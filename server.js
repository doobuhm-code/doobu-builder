const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const runLottoCollector = require('./collector_lotto');
const runPensionCollector = require('./collector_pension');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ================= 로또 API =================

// 로또 최신 회차 조회
app.get('/api/lotto-latest', async (req, res) => {
  try {
    const row = await db.lotto.getLatest();
    if (!row) return res.status(404).json({ success: false, message: '로또 데이터가 없습니다.' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('로또 최신 회차 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// 특정 회차 로또 번호 조회
app.get('/api/lotto/:drwNo', async (req, res) => {
  const drwNo = req.params.drwNo;
  try {
    const row = await db.lotto.getByDrwNo(drwNo);
    if (!row) return res.status(404).json({ success: false, message: '해당 회차 데이터가 없습니다.' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error(`로또 ${drwNo}회차 조회 에러:`, err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// 로또 당첨번호 중복 검사
app.post('/api/lotto/check-win', async (req, res) => {
  const { numbers } = req.body;
  if (!numbers || numbers.length !== 6) {
    return res.status(400).json({ success: false, message: '번호 6개를 입력해주세요.' });
  }

  try {
    const rows = await db.lotto.getAll();
    processCheckWin(rows, numbers, res);
  } catch (err) {
    console.error('로또 중복 검사 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
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

// 연금복권 최신 회차 조회
app.get('/api/pension-latest', async (req, res) => {
  try {
    const row = await db.pension.getLatest();
    if (!row) return res.status(404).json({ success: false, message: '데이터가 없습니다.' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('연금 최신 회차 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// 특정 회차 연금복권 조회
app.get('/api/pension/:drwNo', async (req, res) => {
  const drwNo = req.params.drwNo;
  try {
    const row = await db.pension.getByDrwNo(drwNo);
    if (!row) return res.status(404).json({ success: false, message: '해당 회차 데이터가 없습니다.' });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error(`연금 ${drwNo}회차 조회 에러:`, err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// 연금복권 당첨번호 검색
app.post('/api/pension/check-win', async (req, res) => {
  const { n1, n2, n3, n4, n5, n6 } = req.body;
  if (n1 === undefined) return res.status(400).json({ success: false, message: '번호를 입력해주세요.' });

  const userNums = [Number(n1), Number(n2), Number(n3), Number(n4), Number(n5), Number(n6)];

  try {
    const rows = await db.pension.getAll();
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
  } catch (err) {
    console.error('연금 중복 검사 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// ================= 로또 뉴스 & 컬럼 API =================
app.get('/api/news', async (req, res) => {
  try {
    const list = await db.news.getAll();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('뉴스 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

app.post('/api/news', async (req, res) => {
  const { title, content, author } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: '제목과 내용을 채워주세요.' });
  }
  try {
    const newsId = await db.news.insert(title, content, author || '익명 기고가');
    res.json({ success: true, id: newsId, message: '뉴스가 성공적으로 저장되었습니다!' });
  } catch (err) {
    console.error('뉴스 등록 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

app.delete('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.news.delete(id);
    res.json({ success: true, message: '성공적으로 삭제되었습니다.' });
  } catch (err) {
    console.error('뉴스 삭제 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// ================= 사주 사전 테이블 API =================
app.get('/api/saju', async (req, res) => {
  try {
    const list = await db.saju.getAll();
    const dict = { zodiac: {}, season: {}, element: {} };
    list.forEach(item => {
      dict[item.category][item.key] = item.value;
    });
    res.json({ success: true, data: dict });
  } catch (err) {
    console.error('사주 데이터 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// ================= 로또 전국 명당 API =================
app.get('/api/hotspots', async (req, res) => {
  try {
    const list = await db.hotspots.getAll();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('명당 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// ================= 자유게시판 API =================
app.get('/api/board', async (req, res) => {
  const { category } = req.query;
  try {
    const list = await db.board.getAll(category);
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('게시판 조회 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

app.post('/api/board', async (req, res) => {
  const { title, content, author, password, category } = req.body;
  if (!title || !content || !author || !password) {
    return res.status(400).json({ success: false, message: '모든 필드를 입력해 주세요.' });
  }
  try {
    await db.board.insert(title, content, author, password, category || 'free');
    res.json({ success: true, message: '게시글이 성공적으로 등록되었습니다!' });
  } catch (err) {
    console.error('게시글 등록 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

app.post('/api/board/delete', async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) {
    return res.status(400).json({ success: false, message: '게시글 ID와 비밀번호를 입력해 주세요.' });
  }
  try {
    const deleted = await db.board.delete(id, password);
    if (deleted) {
      res.json({ success: true, message: '게시글이 성공적으로 삭제되었습니다.' });
    } else {
      res.status(403).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }
  } catch (err) {
    console.error('게시글 삭제 에러:', err);
    res.status(500).json({ success: false, message: 'DB 에러' });
  }
});

// ================= 서버 구동 및 자동 수집 실행 =================
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 복권 포털 서버 실행 중: http://localhost:${PORT}`);
  
  try {
    // 1. PostgreSQL 연결 환경일 시 테이블 자동 초기화
    await db.initPgTables();
    
    // 2. 모든 테이블 자동 초기화 및 시딩 (뉴스, 사주, 명당, 게시판)
    await db.news.initialize();
    await db.saju.initialize();
    await db.hotspots.initialize();
    await db.board.initialize();
    
    // 3. 서버 실행 시 누락된 최신 데이터 백그라운드에서 즉시 수집 시작
    console.log('🔄 [자동 수집] 최신 복권 당첨 정보를 동기화하는 중...');
    runLottoCollector();
    runPensionCollector();
  } catch (err) {
    console.error('❌ 서버 초기 가동 에러:', err);
  }
});

// 3. 12시간마다 주기적으로 동기화 작업 실행 (실시간 수집 차단 방지 및 주기 설정)
setInterval(() => {
  console.log('⏰ [정기 스케줄러] 복권 결과 최신화 작업 수행 중...');
  runLottoCollector();
  runPensionCollector();
}, 12 * 60 * 60 * 1000);
