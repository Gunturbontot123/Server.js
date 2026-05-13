
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

function normalizeArgs(paramsOrCallback, callback) {
  if (typeof paramsOrCallback === 'function') {
    return { params: [], callback: paramsOrCallback };
  }
  return { params: Array.isArray(paramsOrCallback) ? paramsOrCallback : [], callback };
}

class SqliteDb {
  constructor() {
    const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '..', 'data.sqlite');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = null;
    this.ready = new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(
        dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
          if (err) {
            console.error('[DB] SQLite connection error:', err);
            reject(err);
            return;
          }
          this.db.exec('PRAGMA foreign_keys = ON');
          console.log('[DB] Using SQLite database:', { path: dbPath });
          resolve();
        }
      );
    });
  }

  run(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this.ready.then(
      () => new Promise((resolve, reject) => {
        this.db.run(String(sql || ''), params || [], function(err) {
          if (callback) callback.call(this, err || null);
          if (err) return reject(err);
          return resolve({ changes: this.changes || 0, lastID: this.lastID || null });
        });
      })
    );
  }

  get(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this.ready.then(
      () => new Promise((resolve, reject) => {
        this.db.get(String(sql || ''), params || [], (err, row) => {
          if (callback) callback(err || null, row);
          if (err) return reject(err);
          return resolve(row);
        });
      })
    );
  }

  all(sql, paramsOrCallback, maybeCallback) {
    const { params, callback } = normalizeArgs(paramsOrCallback, maybeCallback);
    return this.ready.then(
      () => new Promise((resolve, reject) => {
        this.db.all(String(sql || ''), params || [], (err, rows) => {
          if (callback) callback(err || null, rows || []);
          if (err) return reject(err);
          return resolve(rows || []);
        });
      })
    );
  }

  exec(sql, callback) {
    return this.ready.then(
      () => new Promise((resolve, reject) => {
        this.db.exec(String(sql || ''), (err) => {
          if (callback) callback(err || null);
          if (err) return reject(err);
          return resolve();
        });
      })
    );
  }

  serialize(fn) {
    return this.db.serialize(fn);
  }

  prepare(sql) {
    return this.db.prepare(String(sql || ''));
  }

  close(callback) {
    return this.ready.then(
      () => new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (callback) callback(err || null);
          if (err) return reject(err);
          return resolve();
        });
      })
    );
  }
}

module.exports = new SqliteDb();
