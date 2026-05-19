
const db = require("./database.js").db
const session = require("express-session")
class TursoSessionStore extends session.Store {
  async get(sid, cb) {
    try {
      const result = await db.execute({
        sql: `SELECT sess FROM user_sessions WHERE sid = ? AND expired_at > ?`,
        args: [sid, Date.now()],
      });
      if (!result.rows.length) return cb(null, null);
      cb(null, JSON.parse(result.rows[0].sess));
    } catch (err) { cb(err); }
  }

  async set(sid, sess, cb) {
    try {
      const expiredAt = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 86400000; // 1 day default
      await db.execute({
        sql: `INSERT OR REPLACE INTO user_sessions (sid, sess, expired_at) VALUES (?, ?, ?)`,
        args: [sid, JSON.stringify(sess), expiredAt],
      });
      cb(null);
    } catch (err) { cb(err); }
  }

  async destroy(sid, cb) {
    try {
      await db.execute({
        sql: `DELETE FROM user_sessions WHERE sid = ?`,
        args: [sid],
      });
      cb(null);
    } catch (err) { cb(err); }
  }
}
module.exports = { TursoSessionStore }
