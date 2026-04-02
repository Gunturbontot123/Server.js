const { Client } = require('pg');

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
    const connectionString = process.env.DATABASE_URL || '';
    this.client = new Client(
 {
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            database: process.env.PGDATABASE || 'postgres',
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || '',
            connectionString: connectionString || undefined,
          },

    );

    this.ready = this.client.connect()
      .then(() => {
        console.log('✅ PostgreSQL terhubung');
      })
      .catch((err) => {
        console.error('Error koneksi PostgreSQL:', err);
        throw err;
      });
  }

  _query(sql, params, callback, mode) {
    const text = replaceQuestionPlaceholders(String(sql || ''));
    return this.ready
      .then(() => this.client.query(text, params || []))
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
}

module.exports = new PostgresCompatDb();
