
const sql = require("@libsql/client");

const client = sql.createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function normalizeLastId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : value.toString();
  }
  return value;
}

function mapRow(result, row) {
  if (!row) return null;
  if (!Array.isArray(row)) return row;
  const obj = {};
  for (let i = 0; i < (result.columns || []).length; i += 1) {
    obj[result.columns[i]] = row[i];
  }
  return obj;
}

function mapRows(result) {
  if (!result || !Array.isArray(result.rows)) return [];
  return result.rows.map((row) => mapRow(result, row));
}

function normalizeArgs(paramsOrCallback, callback) {
  if (typeof paramsOrCallback === 'function') {
    return { params: [], callback: paramsOrCallback };
  }
  return { params: Array.isArray(paramsOrCallback) ? paramsOrCallback : [], callback };
}

class TursoDB {
  constructor() {
    this.db = client;
    this.ready = Promise.resolve();
    console.log('[DB] Using Turso libsql database:', {
      url: process.env.TURSO_DATABASE_URL?.substring(0, 30) + '...'
    });
  }

  async run(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    try {
      const result = await this.db.execute({
        sql: String(sql || ''),
        args: params || []
      });
      const changes = result.rowsAffected || 0;
      const lastID = normalizeLastId(result.lastInsertRowid);
      if (callback) callback.call({ lastID, changes }, null);
      return { changes, lastID };
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }

  async get(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    try {
      const result = await this.db.execute({
        sql: String(sql || ''),
        args: params || []
      });
      const row = mapRow(result, result.rows?.[0]) || null;
      if (callback) callback(null, row);
      return row;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }

  async all(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    try {
      const result = await this.db.execute({
        sql: String(sql || ''),
        args: params || []
      });
      const rows = mapRows(result);
      if (callback) callback(null, rows);
      return rows;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }

  async exec(sql, callback) {
    try {
      await this.db.execute(String(sql || ''));
      if (callback) callback(null);
      return;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }

  serialize(fn) {
    // Turso executes queries serially by default, so just call the function
    return fn();
  }

  prepare(sql) {
    // Turso doesn't have a prepare step like SQLite3
    // Return a stub object that can execute queries
    return {
      run: (...args) => this.run(sql, ...args),
      get: (...args) => this.get(sql, ...args),
      all: (...args) => this.all(sql, ...args),
      finalize: (callback) => callback?.(null)
    };
  }

  async close(callback) {
    try {
      // Turso client doesn't need explicit closing
      if (callback) callback(null);
      return;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }
}

module.exports = new TursoDB();
