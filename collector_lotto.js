const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'lotto.db'), (err) => {
  if (err) console.error('❌ 로또 DB 연결 실패:', err.message);
  else {
    db.run('PRAGMA journal_mode = WAL;');
    db.configure('busyTimeout', 10000);
  }
});

function initTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS lotto_history (
        drwNo INTEGER PRIMARY KEY,
        drwNoDate TEXT,
        num1 INTEGER, num2 INTEGER, num3 INTEGER,
        num4 INTEGER, num5 INTEGER, num6 INTEGER,
        bnusNo INTEGER
      )
    `, (err) => { if (err) reject(err); else resolve(); });
  });
}

async function fetchLatestLotto(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.returnValue === 'success' ? data : null;
  } catch (e) {  // 👈 catch 키워드 추가 완료
    return null;
  }
}

function insertLottoData(data) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO lotto_history 
      (drwNo, drwNoDate, num1, num2, num3, num4, num5, num6, bnusNo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.drwNo, data.drwNoDate,
      data.drwtNo1, data.drwtNo2, data.drwtNo3,
      data.drwtNo4, data.drwtNo5, data.drwtNo6,
      data.bnusNo,
      (err) => { if (err) reject(err); else resolve(); }
    );
    stmt.finalize();
  });
}

function getMaxDrwNo() {
  return new Promise((resolve) => {
    db.get('SELECT MAX(drwNo) as maxNo FROM lotto_history', (err, row) => {
      resolve(row && row.maxNo ? row.maxNo : 0);
    });
  });
}

async function runLottoCollector() {
  try {
    await initTable();
    const maxNo = await getMaxDrwNo();
    let nextNo = maxNo + 1;
    let successCount = 0;

    while (true) {
      const data = await fetchLatestLotto(nextNo);
      if (data) {
        await insertLottoData(data);
        console.log(`✅ [로또 수집 완료] 제 ${nextNo}회차(${data.drwNoDate})`);
        successCount++;
        nextNo++;
      } else {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (successCount > 0) console.log(`🎉 로또 총 ${successCount}건 수집 완료!`);
  } catch (err) {
    console.error('❌ 로또 수집 에러:', err);
  }
}

if (require.main === module) {
  runLottoCollector();
}

module.exports = runLottoCollector;