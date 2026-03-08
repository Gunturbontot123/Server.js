const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data.db');
const idToDelete = 'b612791b-0201-4cff-aa33-1cf7d1c90562';

const db = new sqlite3.Database(dbPath);
db.run('DELETE FROM obat WHERE id = ?', [idToDelete], function(err){
  if(err){
    console.error('Error deleting row:', err);
    process.exit(1);
  }
  console.log('Deleted rows:', this.changes);
  db.close();
});
