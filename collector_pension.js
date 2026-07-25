const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'pension_lotto.db'), (err) => {
  if (err) console.error('❌ 연금복권 DB 연결 실패:', err.message);
  else {
    db.run('PRAGMA journal_mode = WAL;');
    db.configure('busyTimeout', 10000);
  }
});

function initTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS pension_lotto (
        drw_no INTEGER PRIMARY KEY,
        drw_no_date TEXT,
        win_group INTEGER,
        num1 INTEGER, num2 INTEGER, num3 INTEGER,
        num4 INTEGER, num5 INTEGER, num6 INTEGER
      )
    `, (err) => { if (err) reject(err); else resolve(); });
  });
}

async function fetchPensionData(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=get720Number&drwNo=${drwNo}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.returnValue === 'success' ? data : null;
  } catch (e) {
    return null;
  }
}

function insertPensionData(data) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO pension_lotto 
      (drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.drwNo, data.drwNoDate, data.pensionBand,
      data.drwtNo1, data.drwtNo2, data.drwtNo3,
      data.drwtNo4, data.drwtNo5, data.drwtNo6,
      (err) => { if (err) reject(err); else resolve(); }
    );
    stmt.finalize();
  });
}

function getMaxDrwNo() {
  return new Promise((resolve) => {
    db.get('SELECT MAX(drw_no) as maxNo FROM pension_lotto', (err, row) => {
      resolve(row && row.maxNo ? row.maxNo : 0);
    });
  });
}

async function runPensionCollector() {
  try {
    await initTable();
    const maxNo = await getMaxDrwNo();
    let nextNo = maxNo + 1;
    let successCount = 0;

    while (true) {
      const data = await fetchPensionData(nextNo);
      if (data) {
        await insertPensionData(data);
        console.log(`✅ [연금복권 수집 완료] 제 ${nextNo}회차(${data.drwNoDate})`);
        successCount++;
        nextNo++;
      } else {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (successCount > 0) console.log(`🎉 연금복권 총 ${successCount}건 수집 완료!`);
  } catch (err) {
    console.error('❌ 연금복권 수집 에러:', err);
  }
  // 💡 서버 가동 중 DB 연결 유지를 위해 db.close()를 제거했습니다.
}

if (require.main === module) {
  runPensionCollector();
}

module.exports = runPensionCollector;