const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const srcPath = path.resolve(__dirname, '..', 'DB_Obat.sqlite');
const tgtPath = path.resolve(__dirname, 'data.db');

const src = new sqlite3.Database(srcPath);
const tgt = new sqlite3.Database(tgtPath);

const allAsync = (db, sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
const runAsync = (db, sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(err){ if(err) rej(err); else res(this); }));

function levenshtein(a, b){
  if(!a || !b) return (a||b).length;
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, () => new Array(n+1));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function similarity(a,b){
  if(!a && !b) return 1;
  if(!a || !b) return 0;
  const d = levenshtein(a,b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (d / Math.max(1, maxLen));
}

const SIM_THRESHOLD = parseFloat(process.argv[2] || process.env.SIM_THRESH || '0.65');

(async function main(){
  try{
    const srcCols = await allAsync(src, "PRAGMA table_info('obat')");
    const tgtCols = await allAsync(tgt, "PRAGMA table_info('obat')");
    const colNames = cols => cols.map(c => c.name.toLowerCase());
    const pick = (cols, patterns) => {
      const names = colNames(cols);
      for(const p of patterns){
        for(const n of names){
          if(n.match(p)) return n;
        }
      }
      return null;
    };

    const srcNameCol = pick(srcCols, [/^nama_barang$/, /^nama$/, /^name$/, /nama_obat/, /namaobat/, /obat/]) || 'nama';
    const srcBatchCol = pick(srcCols, [/batch/, /no_batch/, /batch_no/, /batch_number/]) || 'batch';
    const tgtNameCol = pick(tgtCols, [/^nama$/, /^name$/, /nama_obat/, /namaobat/, /obat/]) || 'nama';
    const tgtBatchCol = pick(tgtCols, [/batch/, /no_batch/, /batch_no/, /batch_number/]) || 'batch';

    console.log('Detected columns:');
    console.log(' source name:', srcNameCol, ' source batch:', srcBatchCol);
    console.log(' target name:', tgtNameCol, ' target batch:', tgtBatchCol);
    console.log(' source table info:', srcCols);

    const srcRows = await allAsync(src, `SELECT "${srcNameCol}" AS name, "${srcBatchCol}" AS batch FROM obat WHERE "${srcBatchCol}" IS NOT NULL AND "${srcBatchCol}" <> ''`);
    const tgtRows = await allAsync(tgt, `SELECT id, "${tgtNameCol}" AS name FROM obat WHERE "${tgtBatchCol}" IS NULL OR "${tgtBatchCol}" = ''`);

    console.log('Source rows with batch:', srcRows.length);
    console.log('Target rows missing batch:', tgtRows.length);

    const srcIndex = srcRows.map(r=>({nama: r.name, batch: r.batch}));
    console.log('Sample source names:');
    srcIndex.slice(0,10).forEach((s,i)=> console.log(i+1, s.nama));
    console.log('\nSample raw source rows (first 5):');
    srcRows.slice(0,5).forEach((r,i)=> console.log(i+1, r));

    let updates = 0;
    for(const t of tgtRows){
      let best = {sim:0, batch:null, name:null};
      for(const s of srcIndex){
        const sim = similarity(t.name || '', s.nama || '');
        if(sim > best.sim){ best = {sim, batch: s.batch, name: s.nama}; }
      }
      if(best.sim >= SIM_THRESHOLD){
        await runAsync(tgt, `UPDATE obat SET "${tgtBatchCol}" = ? WHERE id = ?`, [best.batch, t.id]);
        console.log(`Updated id=${t.id} name="${t.name}" -> batch="${best.batch}" (sim=${best.sim.toFixed(2)}) matched:"${best.name}"`);
        updates++;
      } else {
        console.log(`No good match for id=${t.id} name="${t.name}" (best sim=${best.sim.toFixed(2)})`);
      }
    }

    console.log('Fuzzy update complete. Total updates:', updates);
    src.close(); tgt.close();
  }catch(err){
    console.error('Error:', err);
    src.close(); tgt.close();
    process.exit(1);
  }
})();
