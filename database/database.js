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
    // Build config untuk PostgreSQL client
    const config = {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres'
    };
    
    // Add password hanya jika ada dan tidak empty
    const password = (process.env.PGPASSWORD || '').trim();
    if (password) {
      config.password = password;
    }
    
    // Add SSL jika dikonfigurasi
    if (process.env.PG_SSL === 'true') {
      config.ssl = { rejectUnauthorized: false };
    }
    
    // Log config untuk debugging (tanpa password)
    console.log('[DB] PostgreSQL config:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      hasPassword: !!config.password
    });
    
    this.client = new Client(config);

    this.ready = this.client.connect()
      .then(() => {
        console.log('✅ PostgreSQL terhubung');
      })
      .catch((err) => {
        console.error('⚠️  PostgreSQL tidak terhubung:', err.message);
        // Graceful error handling - jangan throw, biar server tetap jalan
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
