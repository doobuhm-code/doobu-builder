const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 로또 DB 연결
const lottoDb = new sqlite3.Database(path.join(__dirname, 'lotto.db'), (err) => {
  if (err) console.error('로또 DB 연결 실패:', err.message);
  else console.log('🎰 로또 DB 연결 성공');
});

// 연금복권 DB 연결
const pensionDb = new sqlite3.Database(path.join(__dirname, 'pension_lotto.db'), (err) => {
  if (err) console.error('연금복권 DB 연결 실패:', err.message);
  else console.log('🎟️ 연금복권 DB 연결 성공');
});

// ================= 로또 API =================

// 로또 최신 회차 조회
app.get('/api/lotto-latest', (req, res) => {
  lottoDb.get('SELECT * FROM lotto ORDER BY drwNo DESC LIMIT 1', [], (err, row) => {
    if (err || !row) {
      // 테이블명이 다를 경우를 대비한 대체 쿼리
      lottoDb.get('SELECT * FROM lotto_history ORDER BY drwNo DESC LIMIT 1', [], (err2, row2) => {
        if (err2 || !row2) return res.status(404).json({ success: false, message: '로또 데이터가 없습니다.' });
        res.json({ success: true, data: row2 });
      });
      return;
    }
    res.json({ success: true, data: row });
  });
});

// 특정 회차 로또 번호 조회
app.get('/api/lotto/:drwNo', (req, res) => {
  const drwNo = req.params.drwNo;
  lottoDb.get('SELECT * FROM lotto WHERE drwNo = ?', [drwNo], (err, row) => {
    if (err || !row) {
      lottoDb.get('SELECT * FROM lotto_history WHERE drwNo = ?', [drwNo], (err2, row2) => {
        if (err2 || !row2) return res.status(404).json({ success: false, message: '해당 회차 데이터가 없습니다.' });
        res.json({ success: true, data: row2 });
      });
      return;
    }
    res.json({ success: true, data: row });
  });
});

// 로또 당첨번호 중복 검사
app.post('/api/lotto/check-win', (req, res) => {
  const { numbers } = req.body;
  if (!numbers || numbers.length !== 6) {
    return res.status(400).json({ success: false, message: '번호 6개를 입력해주세요.' });
  }

  lottoDb.all('SELECT * FROM lotto ORDER BY drwNo DESC', [], (err, rows) => {
    const targetRows = (err || !rows || rows.length === 0) ? [] : rows;
    
    // 만약 lotto 테이블 조회가 안되면 lotto_history로 시도
    if (targetRows.length === 0) {
      lottoDb.all('SELECT * FROM lotto_history ORDER BY drwNo DESC', [], (err2, rows2) => {
        if (err2 || !rows2) return res.status(500).json({ success: false, message: 'DB 에러' });
        processCheckWin(rows2, numbers, res);
      });
    } else {
      processCheckWin(targetRows, numbers, res);
    }
  });
});

function processCheckWin(rows, numbers, res) {
  const results = [];
  rows.forEach(row => {
    const dbNums = [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6];
    let matchCount = dbNums.filter(num => numbers.includes(num)).length;

    if (matchCount >= 4) {
      results.push({
        drwNo: row.drwNo,
        drwNoDate: row.drwNoDate,
        matchCount: matchCount,
        dbNums: dbNums,
        bnusNo: row.bnusNo
      });
    }
  });

  results.sort((a, b) => b.matchCount - a.matchCount || b.drwNo - a.drwNo);
  res.json({ success: true, results });
}


// ================= 연금복권 API =================

app.get('/api/pension-latest', (req, res) => {
  pensionDb.get('SELECT * FROM pension_lotto ORDER BY drw_no DESC LIMIT 1', [], (err, row) => {
    if (err || !row) return res.status(404).json({ success: false, message: '데이터가 없습니다.' });
    res.json({ success: true, data: row });
  });
});

app.get('/api/pension/:drwNo', (req, res) => {
  const drwNo = req.params.drwNo;
  pensionDb.get('SELECT * FROM pension_lotto WHERE drw_no = ?', [drwNo], (err, row) => {
    if (err || !row) return res.status(404).json({ success: false, message: '해당 회차 데이터가 없습니다.' });
    res.json({ success: true, data: row });
  });
});

app.post('/api/pension/check-win', (req, res) => {
  const { n1, n2, n3, n4, n5, n6 } = req.body;
  if (n1 === undefined) return res.status(400).json({ success: false, message: '번호를 입력해주세요.' });

  const userNums = [Number(n1), Number(n2), Number(n3), Number(n4), Number(n5), Number(n6)];

  pensionDb.all('SELECT * FROM pension_lotto ORDER BY drw_no DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'DB 에러' });

    const results = [];
    rows.forEach(row => {
      const dbNums = [row.num1, row.num2, row.num3, row.num4, row.num5, row.num6];
      let matchCount = 0;
      for (let i = 0; i < 6; i++) {
        if (dbNums[i] === userNums[i]) matchCount++;
      }

      if (matchCount >= 4) {
        results.push({
          drw_no: row.drw_no,
          drw_no_date: row.drw_no_date,
          win_group: row.win_group,
          matchCount: matchCount,
          dbNums: dbNums
        });
      }
    });

    results.sort((a, b) => b.matchCount - a.matchCount || b.drw_no - a.drw_no);
    res.json({ success: true, results });
  });
});


// ================= 서버 완벽 재시작 실행 =================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 복권 포털 서버 실행 중: http://localhost:${PORT}`);
});