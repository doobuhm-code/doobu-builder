require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { Pool } = require('pg');
const path = require('path');

const isPg = !!process.env.DATABASE_URL;
let pgPool = null;
let lottoSqlite = null;
let pensionSqlite = null;

if (isPg) {
  console.log('☁️ PostgreSQL (Supabase/Neon) DB Connection Activated');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('🎰 Local SQLite3 DB Connection Activated');
  const sqlite3 = require('sqlite3').verbose();
  lottoSqlite = new sqlite3.Database(path.join(__dirname, 'lotto.db'), (err) => {
    if (err) console.error('Lotto SQLite connection failed:', err.message);
  });
  pensionSqlite = new sqlite3.Database(path.join(__dirname, 'pension_lotto.db'), (err) => {
    if (err) console.error('Pension SQLite connection failed:', err.message);
  });
}

// Initialize tables in PostgreSQL
async function initPgTables() {
  if (!isPg) return;
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS lotto_history (
        drwno INTEGER PRIMARY KEY,
        drwnodate TEXT,
        num1 INTEGER, num2 INTEGER, num3 INTEGER,
        num4 INTEGER, num5 INTEGER, num6 INTEGER,
        bnusno INTEGER
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pension_lotto (
        drw_no INTEGER PRIMARY KEY,
        drw_no_date TEXT,
        win_group INTEGER,
        num1 INTEGER, num2 INTEGER, num3 INTEGER,
        num4 INTEGER, num5 INTEGER, num6 INTEGER
      );
    `);
    console.log('✅ PostgreSQL tables checked/initialized successfully');
  } catch (err) {
    console.error('❌ PostgreSQL tables initialization failed:', err);
  } finally {
    client.release();
  }
}

// Lotto DB operations wrapper
const lotto = {
  getLatest: () => {
    if (isPg) {
      return pgPool.query('SELECT drwno as "drwNo", drwnodate as "drwNoDate", num1, num2, num3, num4, num5, num6, bnusno as "bnusNo" FROM lotto_history ORDER BY drwno DESC LIMIT 1')
        .then(res => res.rows[0] || null);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.get('SELECT * FROM lotto_history ORDER BY drwNo DESC LIMIT 1', [], (err, row) => {
          if (err) {
            lottoSqlite.get('SELECT * FROM lotto ORDER BY drwNo DESC LIMIT 1', [], (err2, row2) => {
              if (err2) reject(err2); else resolve(row2);
            });
          } else resolve(row);
        });
      });
    }
  },
  getByDrwNo: (drwNo) => {
    if (isPg) {
      return pgPool.query('SELECT drwno as "drwNo", drwnodate as "drwNoDate", num1, num2, num3, num4, num5, num6, bnusno as "bnusNo" FROM lotto_history WHERE drwno = $1', [drwNo])
        .then(res => res.rows[0] || null);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.get('SELECT * FROM lotto_history WHERE drwNo = ?', [drwNo], (err, row) => {
          if (err) {
            lottoSqlite.get('SELECT * FROM lotto WHERE drwNo = ?', [drwNo], (err2, row2) => {
              if (err2) reject(err2); else resolve(row2);
            });
          } else resolve(row);
        });
      });
    }
  },
  getAll: () => {
    if (isPg) {
      return pgPool.query('SELECT drwno as "drwNo", drwnodate as "drwNoDate", num1, num2, num3, num4, num5, num6, bnusno as "bnusNo" FROM lotto_history ORDER BY drwno DESC')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT * FROM lotto_history ORDER BY drwNo DESC', [], (err, rows) => {
          if (err || !rows || rows.length === 0) {
            lottoSqlite.all('SELECT * FROM lotto ORDER BY drwNo DESC', [], (err2, rows2) => {
              if (err2) reject(err2); else resolve(rows2);
            });
          } else resolve(rows);
        });
      });
    }
  },
  insert: (data) => {
    if (isPg) {
      return pgPool.query(`
        INSERT INTO lotto_history (drwno, drwnodate, num1, num2, num3, num4, num5, num6, bnusno)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (drwno) DO NOTHING
      `, [data.drwNo, data.drwNoDate, data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6, data.bnusNo]);
    } else {
      return new Promise((resolve, reject) => {
        const stmt = lottoSqlite.prepare(`
          INSERT OR REPLACE INTO lotto_history 
          (drwNo, drwNoDate, num1, num2, num3, num4, num5, num6, bnusNo) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.drwNo, data.drwNoDate,
          data.drwtNo1, data.drwtNo2, data.drwtNo3,
          data.drwtNo4, data.drwtNo5, data.drwtNo6,
          data.bnusNo,
          (err) => { stmt.finalize(); if (err) reject(err); else resolve(); }
        );
      });
    }
  },
  getMaxDrwNo: () => {
    if (isPg) {
      return pgPool.query('SELECT COALESCE(MAX(drwno), 0) as maxno FROM lotto_history')
        .then(res => res.rows[0].maxno || 0);
    } else {
      return new Promise((resolve) => {
        lottoSqlite.get('SELECT MAX(drwNo) as maxNo FROM lotto_history', (err, row) => {
          resolve(row && row.maxNo ? row.maxNo : 0);
        });
      });
    }
  }
};

// Pension DB operations wrapper
const pension = {
  getLatest: () => {
    if (isPg) {
      return pgPool.query('SELECT drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6 FROM pension_lotto ORDER BY drw_no DESC LIMIT 1')
        .then(res => res.rows[0] || null);
    } else {
      return new Promise((resolve, reject) => {
        pensionSqlite.get('SELECT * FROM pension_lotto ORDER BY drw_no DESC LIMIT 1', [], (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });
    }
  },
  getByDrwNo: (drwNo) => {
    if (isPg) {
      return pgPool.query('SELECT drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6 FROM pension_lotto WHERE drw_no = $1', [drwNo])
        .then(res => res.rows[0] || null);
    } else {
      return new Promise((resolve, reject) => {
        pensionSqlite.get('SELECT * FROM pension_lotto WHERE drw_no = ?', [drwNo], (err, row) => {
          if (err) reject(err); else resolve(row);
        });
      });
    }
  },
  getAll: () => {
    if (isPg) {
      return pgPool.query('SELECT drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6 FROM pension_lotto ORDER BY drw_no DESC')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        pensionSqlite.all('SELECT * FROM pension_lotto ORDER BY drw_no DESC', [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  },
  insert: (data) => {
    if (isPg) {
      return pgPool.query(`
        INSERT INTO pension_lotto (drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (drw_no) DO NOTHING
      `, [data.drwNo, data.drwNoDate, data.pensionBand, data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6]);
    } else {
      return new Promise((resolve, reject) => {
        const stmt = pensionSqlite.prepare(`
          INSERT OR REPLACE INTO pension_lotto 
          (drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.drwNo, data.drwNoDate, data.pensionBand,
          data.drwtNo1, data.drwtNo2, data.drwtNo3,
          data.drwtNo4, data.drwtNo5, data.drwtNo6,
          (err) => { stmt.finalize(); if (err) reject(err); else resolve(); }
        );
      });
    }
  },
  getMaxDrwNo: () => {
    if (isPg) {
      return pgPool.query('SELECT COALESCE(MAX(drw_no), 0) as maxno FROM pension_lotto')
        .then(res => res.rows[0].maxno || 0);
    } else {
      return new Promise((resolve) => {
        pensionSqlite.get('SELECT MAX(drw_no) as maxNo FROM pension_lotto', (err, row) => {
          resolve(row && row.maxNo ? row.maxNo : 0);
        });
      });
    }
  }
};

const news = {
  initialize: () => {
    if (isPg) {
      return pgPool.query(`
        CREATE TABLE IF NOT EXISTS lotto_news (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          author TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `).then(() => {
        return pgPool.query('SELECT COUNT(*) FROM lotto_news').then(res => {
          if (parseInt(res.rows[0].count) === 0) {
            return pgPool.query(`
              INSERT INTO lotto_news (title, content, author) VALUES 
              ('로또 1등 당첨자의 생생한 농협 본점 방문 수령 후기', '지난주 로또 6/45 1등 당첨자가 NH농협은행 본점을 직접 방문하여 당첨금을 수령한 생생한 체험기가 공개되었습니다. 당첨자는 "정문 통과부터 심장이 쿵광거렸고, 1층 VIP실로 안내받는 순간 비로소 실감이 났다"고 소감을 밝혔습니다. 농협 관계자는 세금 공제 및 연금식 전환 팁을 친절히 조율해주었다며 감사 인사를 전했습니다.', '김행운 기자'),
              ('복권위원회 발표: 내년도 복권기금 공익사업 2조 원 돌파', '기획재정부 복권위원회가 발표한 자료에 따르면, 국민들이 소액으로 즐긴 복권 판매 대금 중 약 2조 3천억 원이 내년도 소외계층 주거안정, 국가유공자 복지, 다문화가정 지원사업 등 다양한 공익적 배정에 투입됩니다. 복권 구매가 따뜻한 사회적 기여로 환원되고 있습니다.', '박사회 기자'),
              ('전국 로또 명당 지도 분석: 진짜 명소의 당첨 비결은 무엇일까?', '서울 노원구, 부산 동구 등 전국적으로 유명한 이른바 로또 명당들의 비밀이 전격 분석되었습니다. 통계 분석 전문가들은 "명당의 당첨 확률 자체가 물리적으로 높은 것이 아니라, 유동 인구가 많아 하루 판매량이 압도적이기 때문에 비례해서 당첨 횟수가 많은 착시 현상"이라며 소소한 재미로 집 주변 판매점을 이용할 것을 당부했습니다.', '이통계 기자')
            `);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run(`
          CREATE TABLE IF NOT EXISTS lotto_news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            author TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `, (err) => {
          if (err) return reject(err);
          lottoSqlite.get('SELECT COUNT(*) as count FROM lotto_news', [], (err2, row) => {
            if (err2) return reject(err2);
            if (row.count === 0) {
              const stmt = lottoSqlite.prepare('INSERT INTO lotto_news (title, content, author) VALUES (?, ?, ?)');
              stmt.run('로또 1등 당첨자의 생생한 농협 본점 방문 수령 후기', '지난주 로또 6/45 1등 당첨자가 NH농협은행 본점을 직접 방문하여 당첨금을 수령한 생생한 체험기가 공개되었습니다. 당첨자는 "정문 통과부터 심장이 쿵광거렸고, 1층 VIP실로 안내받는 순간 비로소 실감이 났다"고 소감을 밝혔습니다. 농협 관계자는 세금 공제 및 연금식 전환 팁을 친절히 조율해주었다며 감사 인사를 전했습니다.', '김행운 기자');
              stmt.run('복권위원회 발표: 내년도 복권기금 공익사업 2조 원 돌파', '기획재정부 복권위원회가 발표한 자료에 따르면, 국민들이 소액으로 즐긴 복권 판매 대금 중 약 2조 3천억 원이 내년도 소외계층 주거안정, 국가유공자 복지, 다문화가정 지원사업 등 다양한 공익적 배정에 투입됩니다. 복권 구매가 따뜻한 사회적 기여로 환원되고 있습니다.', '박사회 기자');
              stmt.run('전국 로또 명당 지도 분석: 진짜 명소의 당첨 비결은 무엇일까?', '서울 노원구, 부산 동구 등 전국적으로 유명한 이른바 로또 명당들의 비밀이 전격 분석되었습니다. 통계 분석 전문가들은 "명당의 당첨 확률 자체가 물리적으로 높은 것이 아니라, 유동 인구가 많아 하루 판매량이 압도적이기 때문에 비례해서 당첨 횟수가 많은 착시 현상"이라며 소소한 재미로 집 주변 판매점을 이용할 것을 당부했습니다.', '이통계 기자');
              stmt.finalize((err3) => {
                if (err3) reject(err3); else resolve();
              });
            } else resolve();
          });
        });
      });
    }
  },
  getAll: () => {
    if (isPg) {
      return pgPool.query('SELECT id, title, content, author, created_at as "createdAt" FROM lotto_news ORDER BY id DESC')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT id, title, content, author, created_at as createdAt FROM lotto_news ORDER BY id DESC', [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  },
  insert: (title, content, author) => {
    if (isPg) {
      return pgPool.query('INSERT INTO lotto_news (title, content, author) VALUES ($1, $2, $3) RETURNING id', [title, content, author])
        .then(res => res.rows[0].id);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('INSERT INTO lotto_news (title, content, author) VALUES (?, ?, ?)', [title, content, author], function(err) {
          if (err) reject(err); else resolve(this.lastID);
        });
      });
    }
  },
  delete: (id) => {
    if (isPg) {
      return pgPool.query('DELETE FROM lotto_news WHERE id = $1', [id]);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('DELETE FROM lotto_news WHERE id = ?', [id], (err) => {
          if (err) reject(err); else resolve();
        });
      });
    }
  }
};

const saju = {
  initialize: () => {
    if (isPg) {
      return pgPool.query(`
        CREATE TABLE IF NOT EXISTS saju_data (
          id SERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL
        );
      `).then(() => {
        return pgPool.query('SELECT COUNT(*) FROM saju_data').then(res => {
          if (parseInt(res.rows[0].count) === 0) {
            return pgPool.query(`
              INSERT INTO saju_data (category, key, value) VALUES 
              ('zodiac', '0', '원숭이띠 (신금 申金 - 지혜와 재치)의 타고난 영민함과 끈기를 얻었습니다.'),
              ('zodiac', '1', '닭띠 (유금 酉金 - 예리함과 총명함)의 비범함과 판단력을 타고났습니다.'),
              ('zodiac', '2', '개띠 (술토 戌土 - 충직함과 책임감)의 우직함과 강인한 인격을 타고났습니다.'),
              ('zodiac', '3', '돼지띠 (해수 亥水 - 풍요와 끈기)의 축복을 받아 태어난 풍요의 결실 기류가 깃들어 있습니다.'),
              ('zodiac', '4', '쥐띠 (자수 子水 - 기회와 지혜)의 영석함과 빠른 직관을 얻어 기회포착이 유리합니다.'),
              ('zodiac', '5', '소띠 (축토 丑土 - 우직함과 결실)의 성실함과 견고한 끈기를 타고나 대성하는 운입니다.'),
              ('zodiac', '6', '호랑이띠 (인목 寅木 - 용맹과 자신감)의 당당함과 개척적인 자립 추진력이 있습니다.'),
              ('zodiac', '7', '토끼띠 (묘목 卯木 - 조화와 영민함)의 온화한 처세술과 조화로운 균형 감각을 지녔습니다.'),
              ('zodiac', '8', '용띠 (진토 辰土 - 무한한 잠재력)의 웅장한 도량과 변화무쌍한 에너지를 부여받았습니다.'),
              ('zodiac', '9', '뱀띠 (사화 巳火 - 직관과 통찰)의 날카로운 분석력과 철두철미한 추진력을 지녔습니다.'),
              ('zodiac', '10', '말띠 (오화 午火 - 열정과 돌파력)의 질주하는 정열과 거침없는 행동력을 얻었습니다.'),
              ('zodiac', '11', '양띠 (미토 未土 - 온화함과 상생)의 따뜻한 인덕과 상생하는 온기를 타고났습니다.'),
              ('season', '봄', '봄의 왕성한 생명력과 목(木 - 창조 및 시작)의 기운'),
              ('season', '여름', '여름의 뜨거운 열정과 화(火 - 확장 및 화합)의 기운'),
              ('season', '가을', '가을의 풍요로운 결실과 금(金 - 집중 및 결단)의 기운'),
              ('season', '겨울', '겨울의 고요한 지혜와 수(水 - 저장 및 통찰)의 기운'),
              ('element', '화_신강', '귀하는 열정적이고 외향적인 화(火)의 일간을 타고났으나 태어난 계절의 기운 또한 화(火)가 강성하여 사주 전체의 화기가 다소 신강(身强)해집니다. 따라서 뜨거운 기운을 지혜롭게 차단하고 조화롭게 식혀주는 <strong>수(수 - 깊은 통찰력)</strong>와 <strong>금(금 - 결단력 및 재물)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '화_신약', '귀하는 온화하고 밝게 빛나는 화(火)의 일간을 타고났으나 주변 계절이나 시각의 기운이 이를 든든하게 받쳐주지 못해 사주가 다소 신약(身弱)해집니다. 따라서 나에게 따뜻한 활력과 인덕을 채워주는 <strong>목(목 - 배움 및 조력)</strong>과 자립심을 든든하게 받쳐줄 <strong>화(화 - 독립심 및 추진력)</strong>의 기운이 귀인 오행(용신)이 됩니다.'),
              ('element', '수_신강', '귀하는 지혜롭고 깊이 있는 수(수)의 일간을 타고났으나 태어난 계절 또한 차가운 수(수)나 토(토)가 많아 기류가 넘쳐납니다. 따라서 유연하게 흐를 수 있게 해주는 <strong>목(목 - 발산 및 창의력)</strong>과 쾌적하게 비춰주는 <strong>화(화 - 재물 및 사교성)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '수_신약', '귀하는 유연하게 흐르는 수(수)의 일간을 타고났으나 태어난 달이나 시각의 마른 대지나 뜨거운 기운 때문에 물줄기가 다소 신약(身弱)해집니다. 이를 채우고 자양해 주는 단단한 <strong>금(금 - 자양분 및 지혜)</strong>과 기운의 근원을 돕는 <strong>수(수 - 지혜 및 인덕)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '목_신강', '귀하는 성장과 창조를 뜻하는 목(목)의 일간을 타고났으나 태어난 계절 또한 수목(수목)이 풍부하여 기세가 한껏 신강해집니다. 따라서 기운을 개화시켜 줄 <strong>화(화 - 예술 및 표현력)</strong>와 올바른 절제를 유도하는 <strong>금(금 - 명예 및 절제력)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '목_신약', '귀하는 우직한 나무 같은 목(목)의 일간을 타고났으나 태어난 계절의 기운이 매우 건조하거나 차가워 뿌리가 상하기 쉽습니다. 따라서 성장에 꼭 필요한 생명수 같은 <strong>수(수 - 문서운 및 지혜)</strong>와 곧은 의지를 지켜줄 <strong>목(목 - 주체성 및 동료운)</strong>의 기운이 귀인 오행(용신)이 됩니다.'),
              ('element', '금_신강', '귀하는 결단력과 정의감이 가득한 금(금)의 일간을 타고났으나 주변 기류 또한 단단한 광산이나 바위여서 사주 전체의 금기가 다소 신강(신강)해집니다. 강하고 굳은 칼날을 부드럽게 세공해 줄 <strong>수(수 - 유연함 및 융통성)</strong>와 현실적인 성취를 안겨다 줄 <strong>목(목 - 재물 및 결과)</strong>의 기운이 귀인 오행(용신)이 됩니다.'),
              ('element', '금_신약', '귀하는 빛나고 총명한 보석인 금(금)의 일간을 타고났으나 태어난 달의 기운이 매우 뜨겁거나 나무가 많아 일간의 근원이 약해집니다. 이를 보완하고 지지해 주는 <strong>금(금 - 자양분 및 지혜)</strong>과 기운의 근원을 돕는 <strong>수(수 - 지혜 및 인덕)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '토_신강', '귀하는 신뢰가 두텁고 무거운 대지인 토(土)의 일간을 타고났으나 주변 계절이나 시각 또한 뜨거운 태양이거나 단단한 대지여서 사주가 신강(신강)해집니다. 단단해진 흙을 부드럽게 일깨우는 <strong>금(금 - 재능 발현 및 표현)</strong>과 비옥한 결실을 줄 시원한 단비인 <strong>수(수 - 흐름 및 재물운)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'),
              ('element', '토_신약', '귀하는 만물의 어머니 같은 토(토)의 일간을 타고났으나 태어난 계절의 기운이 너무 춥거나 척박하여 일간이 힘을 잃기 쉽습니다. 대지를 온화하게 데워줄 <strong>화(화 - 인덕 및 학업)</strong>와 든든히 받쳐줄 <strong>토(토 - 기반 및 신뢰)</strong>의 기운이 귀인 오행(용신)이 됩니다.')
            `);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run(`
          CREATE TABLE IF NOT EXISTS saju_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL
          );
        `, (err) => {
          if (err) return reject(err);
          lottoSqlite.get('SELECT COUNT(*) as count FROM saju_data', [], (err2, row) => {
            if (err2) return reject(err2);
            if (row.count === 0) {
              const stmt = lottoSqlite.prepare('INSERT INTO saju_data (category, key, value) VALUES (?, ?, ?)');
              const items = [
                ['zodiac', '0', '원숭이띠 (신금 申金 - 지혜와 재치)의 타고난 영민함과 끈기를 얻었습니다.'],
                ['zodiac', '1', '닭띠 (유금 酉金 - 예리함과 총명함)의 비범함과 판단력을 타고났습니다.'],
                ['zodiac', '2', '개띠 (술토 戌土 - 충직함과 책임감)의 우직함과 강인한 인격을 타고났습니다.'],
                ['zodiac', '3', '돼지띠 (해수 亥水 - 풍요와 끈기)의 축복을 받아 태어난 풍요의 결실 기류가 깃들어 있습니다.'],
                ['zodiac', '4', '쥐띠 (자수 子水 - 기회와 지혜)의 영석함과 빠른 직관을 얻어 기회포착이 유리합니다.'],
                ['zodiac', '5', '소띠 (축토 丑土 - 우직함과 결실)의 성실함과 견고한 끈기를 타고나 대성하는 운입니다.'],
                ['zodiac', '6', '호랑이띠 (인목 寅木 - 용맹과 자신감)의 당당함과 개척적인 자립 추진력이 있습니다.'],
                ['zodiac', '7', '토끼띠 (묘목 卯木 - 조화와 영민함)의 온화한 처세술과 조화로운 균형 감각을 지녔습니다.'],
                ['zodiac', '8', '용띠 (진토 辰土 - 무한한 잠재력)의 웅장한 도량과 변화무쌍한 에너지를 부여받았습니다.'],
                ['zodiac', '9', '뱀띠 (사화 巳火 - 직관과 통찰)의 날카로운 분석력과 철두철미한 추진력을 지녔습니다.'],
                ['zodiac', '10', '말띠 (오화 午火 - 열정과 돌파력)의 질주하는 정열과 거침없는 행동력을 얻었습니다.'],
                ['zodiac', '11', '양띠 (미토 未土 - 온화함과 상생)의 따뜻한 인덕과 상생하는 온기를 타고났습니다.'],
                ['season', '봄', '봄의 왕성한 생명력과 목(木 - 창조 및 시작)의 기운'],
                ['season', '여름', '여름의 뜨거운 열정과 화(火 - 확장 및 화합)의 기운'],
                ['season', '가을', '가을의 풍요로운 결실과 금(金 - 집중 및 결단)의 기운'],
                ['season', '겨울', '겨울의 고요한 지혜와 수(水 - 저장 및 통찰)의 기운'],
                ['element', '화_신강', '귀하는 열정적이고 외향적인 화(火)의 일간을 타고났으나 태어난 계절의 기운 또한 화(火)가 강성하여 사주 전체의 화기가 다소 신강(身强)해집니다. 따라서 뜨거운 기운을 지혜롭게 차단하고 조화롭게 식혀주는 <strong>수(수 - 깊은 통찰력)</strong>와 <strong>금(금 - 결단력 및 재물)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '화_신약', '귀하는 온화하고 밝게 빛나는 화(火)의 일간을 타고났으나 주변 계절이나 시각의 기운이 이를 든든하게 받쳐주지 못해 사주가 다소 신약(身弱)해집니다. 따라서 나에게 따뜻한 활력과 인덕을 채워주는 <strong>목(목 - 배움 및 조력)</strong>과 자립심을 든든하게 받쳐줄 <strong>화(화 - 독립심 및 추진력)</strong>의 기운이 귀인 오행(용신)이 됩니다.'],
                ['element', '수_신강', '귀하는 지혜롭고 깊이 있는 수(수)의 일간을 타고났으나 태어난 계절 또한 차가운 수(수)나 토(토)가 많아 기류가 넘쳐납니다. 따라서 유연하게 흐를 수 있게 해주는 <strong>목(목 - 발산 및 창의력)</strong>과 쾌적하게 비춰주는 <strong>화(화 - 재물 및 사교성)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '수_신약', '귀하는 유연하게 흐르는 수(수)의 일간을 타고났으나 태어난 달이나 시각의 마른 대지나 뜨거운 기운 때문에 물줄기가 다소 신약(身弱)해집니다. 이를 채우고 자양해 주는 단단한 <strong>금(금 - 자양분 및 지혜)</strong>과 기운의 근원을 돕는 <strong>수(수 - 지혜 및 인덕)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '목_신강', '귀하는 성장과 창조를 뜻하는 목(목)의 일간을 타고났으나 태어난 계절 또한 수목(수목)이 풍부하여 기세가 한껏 신강해집니다. 따라서 기운을 개화시켜 줄 <strong>화(화 - 예술 및 표현력)</strong>와 올바른 절제를 유도하는 <strong>금(금 - 명예 및 절제력)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '목_신약', '귀하는 우직한 나무 같은 목(목)의 일간을 타고났으나 태어난 계절의 기운이 매우 건조하거나 차가워 뿌리가 상하기 쉽습니다. 따라서 성장에 꼭 필요한 생명수 같은 <strong>수(수 - 문서운 및 지혜)</strong>와 곧은 의지를 지켜줄 <strong>목(목 - 주체성 및 동료운)</strong>의 기운이 귀인 오행(용신)이 됩니다.'],
                ['element', '금_신강', '귀하는 결단력과 정의감이 가득한 금(금)의 일간을 타고났으나 주변 기류 또한 단단한 광산이나 바위여서 사주 전체의 금기가 다소 신강(신강)해집니다. 강하고 굳은 칼날을 부드럽게 세공해 줄 <strong>수(수 - 유연함 및 융통성)</strong>와 현실적인 성취를 안겨다 줄 <strong>목(목 - 재물 및 결과)</strong>의 기운이 귀인 오행(용신)이 됩니다.'],
                ['element', '금_신약', '귀하는 빛나고 총명한 보석인 금(금)의 일간을 타고났으나 태어난 달의 기운이 매우 뜨겁거나 나무가 많아 일간의 근원이 약해집니다. 이를 보완하고 지지해 주는 <strong>금(금 - 자양분 및 지혜)</strong>과 기운의 근원을 돕는 <strong>수(수 - 지혜 및 인덕)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '토_신강', '귀하는 신뢰가 두텁고 무거운 대지인 토(土)의 일간을 타고났으나 주변 계절이나 시각 또한 뜨거운 태양이거나 단단한 대지여서 사주가 신강(신강)해집니다. 단단해진 흙을 부드럽게 일깨우는 <strong>금(금 - 재능 발현 및 표현)</strong>과 비옥한 결실을 줄 시원한 단비인 <strong>수(수 - 흐름 및 재물운)</strong>의 기운이 평생의 귀인 오행(용신)이 됩니다.'],
                ['element', '토_신약', '귀하는 만물의 어머니 같은 토(토)의 일간을 타고났으나 태어난 계절의 기운이 너무 춥거나 척박하여 일간이 힘을 잃기 쉽습니다. 대지를 온화하게 데워줄 <strong>화(화 - 인덕 및 학업)</strong>와 든든히 받쳐줄 <strong>토(토 - 기반 및 신뢰)</strong>의 기운이 귀인 오행(용신)이 됩니다.']
              ];
              items.forEach(item => {
                stmt.run(item[0], item[1], item[2]);
              });
              stmt.finalize((err3) => {
                if (err3) reject(err3); else resolve();
              });
            } else resolve();
          });
        });
      });
    }
  },
  getAll: () => {
    if (isPg) {
      return pgPool.query('SELECT category, key, value FROM saju_data')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT category, key, value FROM saju_data', [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  }
};

const hotspots = {
  initialize: () => {
    if (isPg) {
      return pgPool.query(`
        DROP TABLE IF EXISTS lotto_hotspots;
        CREATE TABLE IF NOT EXISTS lotto_hotspots (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          address TEXT NOT NULL,
          wins TEXT NOT NULL,
          description TEXT NOT NULL,
          region TEXT DEFAULT '전국'
        );
      `).then(() => {
        return pgPool.query('SELECT COUNT(*) FROM lotto_hotspots').then(res => {
          if (parseInt(res.rows[0].count) === 0) {
            return pgPool.query(`
              INSERT INTO lotto_hotspots (name, address, wins, description, region) VALUES 
              ('스파복권방', '서울 노원구 상계동 707-3', '1등 48회 / 2등 180회 이상', '전국 부동의 1위 명당으로 주말마다 대기열이 수백 미터에 달하는 대한민국 최고의 로또 명소', '서울'),
              ('천하명당복권방', '부산 동구 범일동 830-195', '1등 39회 / 2등 150회 이상', '부산과 영남 지역을 대표하는 전통 명문 명당으로 신기할 정도로 끊임없이 당첨자를 배출하는 곳', '부산'),
              ('세진글라스', '대구 서구 평리동 1094-4', '1등 24회 / 2등 80회 이상', '안경점 내부에 위치한 대구 최고의 당첨 기류를 가득 안은 행운의 중심지', '대구'),
              ('로또휴게실', '경기 용인시 기흥구 하갈동 143-4', '1등 22회 / 2등 70회 이상', '국도변 기흥 저수지 옆에 위치하여 운전자들의 필수 코스로 각광받는 경기 최대의 명소', '경기'),
              ('로또명당인천점', '충남 아산시 인주면 서해로 512-2', '1등 17회 / 2등 50회 이상', '충청권 최고의 1등 배출 명가로 아산만 방조제 길목에 위치하여 많은 방문객이 모여드는 성지', '충청'),
              ('목화휴게소', '경남 사천시 용현면 주문리 4', '1등 19회 / 2등 60회 이상', '삼천포 앞바다가 훤히 트인 수려한 비경과 함께 엄청난 행운을 안겨주는 영남권 대박 명소', '경상'),
              ('알리바이', '광주 광산구 신창동 1252-11', '1등 12회 / 2등 40회 이상', '호남 지역의 최대 복권 판매점이자 광주 전남을 아우르는 최고의 1등 노다지 명소', '전라'),
              ('제주복권방', '제주 제주시 노형동 911-3', '1등 9회 / 2등 25회 이상', '제주도 노형동의 핵심 입지에 자리하여 수많은 현지인과 관광객들이 줄지어 찾는 섬나라 최고 명당', '제주'),
              ('복권나라', '대전 대덕구 중리동 365-15', '1등 15회 / 2등 45회 이상', '대전 대덕구의 전통 깊은 복권명당으로 한결같이 높은 1등 출현율을 자랑하는 한밭의 자랑', '대전')
            `);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('DROP TABLE IF EXISTS lotto_hotspots', (err) => {
          if (err) return reject(err);
          lottoSqlite.run(`
            CREATE TABLE IF NOT EXISTS lotto_hotspots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              address TEXT NOT NULL,
              wins TEXT NOT NULL,
              description TEXT NOT NULL,
              region TEXT DEFAULT '전국'
            );
          `, (err2) => {
            if (err2) return reject(err2);
            lottoSqlite.get('SELECT COUNT(*) as count FROM lotto_hotspots', [], (err3, row) => {
              if (err3) return reject(err3);
              if (row.count === 0) {
                const stmt = lottoSqlite.prepare('INSERT INTO lotto_hotspots (name, address, wins, description, region) VALUES (?, ?, ?, ?, ?)');
                stmt.run('스파복권방', '서울 노원구 상계동 707-3', '1등 48회 / 2등 180회 이상', '전국 부동의 1위 명당으로 주말마다 대기열이 수백 미터에 달하는 대한민국 최고의 로또 명소', '서울');
                stmt.run('천하명당복권방', '부산 동구 범일동 830-195', '1등 39회 / 2등 150회 이상', '부산과 영남 지역을 대표하는 전통 명문 명당으로 신기할 정도로 끊임없이 당첨자를 배출하는 곳', '부산');
                stmt.run('세진글라스', '대구 서구 평리동 1094-4', '1등 24회 / 2등 80회 이상', '안경점 내부에 위치한 대구 최고의 당첨 기류를 가득 안은 행운의 중심지', '대구');
                stmt.run('로또휴게실', '경기 용인시 기흥구 하갈동 143-4', '1등 22회 / 2등 70회 이상', '국도변 기흥 저수지 옆에 위치하여 운전자들의 필수 코스로 각광받는 경기 최대의 명소', '경기');
                stmt.run('로또명당인천점', '충남 아산시 인주면 서해로 512-2', '1등 17회 / 2등 50회 이상', '충청권 최고의 1등 배출 명가로 아산만 방조제 길목에 위치하여 많은 방문객이 모여드는 성지', '충청');
                stmt.run('목화휴게소', '경남 사천시 용현면 주문리 4', '1등 19회 / 2등 60회 이상', '삼천포 앞바다가 훤히 트인 수려한 비경과 함께 엄청난 행운을 안겨주는 영남권 대박 명소', '경상');
                stmt.run('알리바이', '광주 광산구 신창동 1252-11', '1등 12회 / 2등 40회 이상', '호남 지역의 최대 복권 판매점이자 광주 전남을 아우르는 최고의 1등 노다지 명소', '전라');
                stmt.run('제주복권방', '제주 제주시 노형동 911-3', '1등 9회 / 2등 25회 이상', '제주도 노형동의 핵심 입지에 자리하여 수많은 현지인과 관광객들이 줄지어 찾는 섬나라 최고 명당', '제주');
                stmt.run('복권나라', '대전 대덕구 중리동 365-15', '1등 15회 / 2등 45회 이상', '대전 대덕구의 전통 깊은 복권명당으로 한결같이 높은 1등 출현율을 자랑하는 한밭의 자랑', '대전');
                stmt.finalize((err4) => {
                  if (err4) reject(err4); else resolve();
                });
              } else resolve();
            });
          });
        });
      });
    }
  },
  getAll: () => {
    if (isPg) {
      return pgPool.query('SELECT id, name, address, wins, description, region FROM lotto_hotspots ORDER BY id ASC')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT id, name, address, wins, description, region FROM lotto_hotspots ORDER BY id ASC', [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  }
};

const board = {
  initialize: () => {
    if (isPg) {
      return pgPool.query(`
        DROP TABLE IF EXISTS board_posts;
        CREATE TABLE IF NOT EXISTS board_posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          author TEXT,
          password TEXT,
          category TEXT DEFAULT 'free',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `).then(() => {
        return pgPool.query('SELECT COUNT(*) FROM board_posts').then(res => {
          if (parseInt(res.rows[0].count) === 0) {
            return pgPool.query(`
              INSERT INTO board_posts (title, content, author, password, category) VALUES 
              ('로또 대박 기원합니다!', '오늘 역학 패턴 필터로 뽑아낸 조합으로 5천원씩 사왔습니다. 이번 회차 모두 대박 나세요!', '행운충전', '1234', 'lotto'),
              ('사주 오행 번호 소름 돋네요.', '태어난 시간까지 넣어서 사주 돌렸는데 나온 평생 행운수 4개가 실제로 지난주 2등 번호랑 많이 겹칩니다... 이번 주 믿고 갑니다!', '만세력왕', '1234', 'lotto'),
              ('연금복권 1등 세후 546만원 수령 후기 보고 왔습니다.', '정말 꿈의 직장이네요. 매달 세금 떼고 546만원이 꼬박꼬박 20년 동안 들어오면 소원이 없겠습니다. 다들 대박나세요!', '연금바라기', '1234', 'pension'),
              ('게시판 개설 축하합니다!', '복권 정보 공유하고 소소하게 잡담 나눌 수 있어서 좋네요. 자주 오겠습니다.', '단골예약', '1234', 'free')
            `);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('DROP TABLE IF EXISTS board_posts', (err) => {
          if (err) return reject(err);
          lottoSqlite.run(`
            CREATE TABLE IF NOT EXISTS board_posts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              author TEXT,
              password TEXT,
              category TEXT DEFAULT 'free',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `, (err2) => {
            if (err2) return reject(err2);
            lottoSqlite.get('SELECT COUNT(*) as count FROM board_posts', [], (err3, row) => {
              if (err3) return reject(err3);
              if (row.count === 0) {
                const stmt = lottoSqlite.prepare('INSERT INTO board_posts (title, content, author, password, category) VALUES (?, ?, ?, ?, ?)');
                stmt.run('로또 대박 기원합니다!', '오늘 역학 패턴 필터로 뽑아낸 조합으로 5천원씩 사왔습니다. 이번 회차 모두 대박 나세요!', '행운충전', '1234', 'lotto');
                stmt.run('사주 오행 번호 소름 돋네요.', '태어난 시간까지 넣어서 사주 돌렸는데 나온 평생 행운수 4개가 실제로 지난주 2등 번호랑 많이 겹칩니다... 이번 주 믿고 갑니다!', '만세력왕', '1234', 'lotto');
                stmt.run('연금복권 1등 세후 546만원 수령 후기 보고 왔습니다.', '정말 꿈의 직장이네요. 매달 세금 떼고 546만원이 꼬박꼬박 20년 동안 들어오면 소원이 없겠습니다. 다들 대박나세요!', '연금바라기', '1234', 'pension');
                stmt.run('게시판 개설 축하합니다!', '복권 정보 공유하고 소소하게 잡담 나눌 수 있어서 좋네요. 자주 오겠습니다.', '단골예약', '1234', 'free');
                stmt.finalize((err4) => {
                  if (err4) reject(err4); else resolve();
                });
              } else resolve();
            });
          });
        });
      });
    }
  },
  getAll: (category) => {
    const filterCategory = category || 'free';
    if (isPg) {
      return pgPool.query('SELECT id, title, content, author, created_at as "createdAt" FROM board_posts WHERE category = $1 ORDER BY id DESC', [filterCategory])
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT id, title, content, author, created_at as createdAt FROM board_posts WHERE category = ? ORDER BY id DESC', [filterCategory], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  },
  insert: (title, content, author, password, category) => {
    const filterCategory = category || 'free';
    if (isPg) {
      return pgPool.query('INSERT INTO board_posts (title, content, author, password, category) VALUES ($1, $2, $3, $4, $5) RETURNING id', [title, content, author, password, filterCategory])
        .then(res => res.rows[0].id);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('INSERT INTO board_posts (title, content, author, password, category) VALUES (?, ?, ?, ?, ?)', [title, content, author, password, filterCategory], function(err) {
          if (err) reject(err); else resolve(this.lastID);
        });
      });
    }
  },
  delete: (id, password) => {
    if (isPg) {
      return pgPool.query('SELECT password FROM board_posts WHERE id = $1', [id]).then(res => {
        if (res.rows[0] && res.rows[0].password === password) {
          return pgPool.query('DELETE FROM board_posts WHERE id = $1', [id]).then(() => true);
        }
        return false;
      });
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.get('SELECT password FROM board_posts WHERE id = ?', [id], (err, row) => {
          if (err) return reject(err);
          if (row && row.password === password) {
            lottoSqlite.run('DELETE FROM board_posts WHERE id = ?', [id], (err2) => {
              if (err2) reject(err2); else resolve(true);
            });
          } else {
            resolve(false);
          }
        });
      });
    }
  }
};

module.exports = {
  isPg,
  initPgTables,
  lotto,
  pension,
  news,
  saju,
  hotspots,
  board
};
