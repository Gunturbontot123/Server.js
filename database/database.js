
const { Pool } = require('pg');
const { Signer } = require('@aws-sdk/rds-signer');
const { awsCredentialsProvider } = require('@vercel/oidc-aws-credentials-provider');
const { attachDatabasePool } = require('@vercel/functions');




function normalizeArgs(paramsOrCallback, callback) {
  if (typeof paramsOrCallback === 'function') {
    return { params: [], callback: paramsOrCallback };
  }
  return { params: Array.isArray(paramsOrCallback) ? paramsOrCallback : [], callback };
}

function replaceQuestionPlaceholders(sql) {
  let idx = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let result = '';

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingle && !inDouble && !inBlockComment && ch === '-' && next === '-') {
      inLineComment = true;
      result += ch;
      continue;
    }
    if (inLineComment) {
      result += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (!inSingle && !inDouble && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      result += ch;
      continue;
    }
    if (inBlockComment) {
      result += ch;
      if (ch === '*' && next === '/') inBlockComment = false;
      continue;
    }

    if (!inDouble && ch === '\'' && sql[i - 1] !== '\\') {
      inSingle = !inSingle;
      result += ch;
      continue;
    }
    if (!inSingle && ch === '"' && sql[i - 1] !== '\\') {
      inDouble = !inDouble;
      result += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === '?') {
      idx += 1;
      result += `$${idx}`;
      continue;
    }

    result += ch;
  }

  return result;
}


class PostgresCompatDb {
  constructor() {
    const region = process.env.AWS_REGION;
    const signer = new Signer({
      hostname: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      username: process.env.PGUSER,
      region,
      credentials: awsCredentialsProvider({
        roleArn: process.env.AWS_ROLE_ARN,
        clientConfig: { region },
      }),
    });

    this.pool = new Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      database: process.env.PGDATABASE || 'postgres',
      password: () => signer.getAuthToken(),
      port: Number(process.env.PGPORT),
      ssl: { rejectUnauthorized: false },
    });
    attachDatabasePool(this.pool);
    // Log config for debugging (no secrets)
    console.log('[DB] Using standard PostgreSQL connection:', {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      ssl: true,
      auroraIam: true,
    });
    this.ready = Promise.resolve(); // Pool connects lazily
  }

  _query(sql, params, callback, mode) {
    const text = replaceQuestionPlaceholders(String(sql || ''));
    return this.ready
      .then(() => this.pool.query(text, params || []))
      .then((result) => {
        if (mode === 'all') {
          callback && callback(null, result.rows);
          return result.rows;
        }
        if (mode === 'get') {
          callback && callback(null, result.rows[0] || undefined);
          return result.rows[0] || undefined;
        }

        const ctx = {
          changes: Number(result.rowCount || 0),
          lastID: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : null
        };
        callback && callback.call(ctx, null);
        return ctx;
      })
      .catch((err) => {
        if (mode === 'all') {
          callback && callback(err, []);
          return [];
        }
        if (mode === 'get') {
          callback && callback(err);
          return undefined;
        }
        callback && callback.call({ changes: 0, lastID: null }, err);
        return undefined;
      });
  }

  run(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this._query(sql, params, callback, 'run');
  }

  get(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this._query(sql, params, callback, 'get');
  }

  all(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this._query(sql, params, callback, 'all');
  }

  exec(sql, callback) {
    return this._query(sql, [], callback, 'run');
  }

  serialize(fn) {
    if (typeof fn === 'function') fn();
  }

  prepare(sql) {
    return {
      run: (paramsOrCallback, maybeCallback) => this.run(sql, paramsOrCallback, maybeCallback),
      finalize: (callback) => {
        if (typeof callback === 'function') callback(null);
      }
    };
  }

  close(callback) {
    return this.pool.end()
      .then(() => {
        if (typeof callback === 'function') callback(null);
      })
      .catch((err) => {
        if (typeof callback === 'function') callback(err);
      });
  }
}

module.exports = new PostgresCompatDb();
