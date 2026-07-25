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
          region TEXT NOT NULL,
          first_wins INTEGER NOT NULL
        );
      `).then(() => {
        return pgPool.query('SELECT COUNT(*) FROM lotto_hotspots').then(res => {
          if (parseInt(res.rows[0].count) === 0) {
            return pgPool.query(`
              INSERT INTO lotto_hotspots (name, address, wins, description, region, first_wins) VALUES 
              ('부일카서비스', '부산 동구 범일동 830-240', '1등 42회 / 2등 155회 이상', '카센타 내부에 위치하여 대기줄만 수십 미터에 달하는 부동의 영남 최다 명당', '부산', 42),
              ('스파복권방', '서울 노원구 상계동 707-3', '1등 48회 / 2등 180회 이상', '전국 부동의 1위 명당으로 주말마다 대기열이 수백 미터에 달하는 대한민국 최고의 로또 명소', '서울', 48),
              ('제이복권방', '서울 종로구 종로5가 58', '1등 15회 / 2등 45회 이상', '종로5가 핵심 역세권에 위치하여 전통의 강력한 만복 기운을 얻은 종로의 자부심', '서울', 15),
              ('가판점', '서울 신문로1가 238', '1등 12회 / 2등 36회 이상', '서대문역과 광화문 광장 사이의 유동인구를 모두 행운으로 바꿔주는 광화문 최고 명소', '서울', 12),
              ('교통카드판매소', '서울 영등포구 당산동6가 331-1', '1등 10회 / 2등 30회 이상', '당산역 출퇴근 직장인들이 매일 발걸음을 멈추고 복권을 구입하는 영등포 최고 명당', '서울', 10),
              ('종합가판점', '서울 동대문구 청량리동 229', '1등 8회 / 2등 24회 이상', '청량리 역전 시장통에서 흘러나오는 활기찬 만복의 기운이 깃든 동대문의 행운 성지', '서울', 8),
              ('천하명당복권방', '부산 동구 범일동 830-195', '1등 39회 / 2등 150회 이상', '부산과 영남 지역을 대표하는 전통 명문 명당으로 신기할 정도로 끊임없이 당첨자를 배출하는 곳', '부산', 39),
              ('돈벼락맞는곳', '부산 동구 범일동 833-5', '1등 14회 / 2등 40회 이상', '천하명당복권방 인근 조방 대로변에 나란히 자리하여 쌍벽을 이루는 전통 명당', '부산', 14),
              ('뉴빅마트', '부산 기장군 기장읍 동부리 274-1', '1등 10회 / 2등 28회 이상', '동부산 관광단지의 관문인 기장 시장길목에서 영험한 용궁의 복을 뿜어내는 기장 명소', '부산', 10),
              ('서면로또방', '부산 진구 부전동 256-4', '1등 8회 / 2등 22회 이상', '부산의 심장 서면 교차로 한가운데서 젊은 활력과 대박 기류를 독점하는 도심형 명당', '부산', 8),
              ('세진글라스', '대구 서구 평리동 1094-4', '1등 24회 / 2등 80회 이상', '안경점 내부에 위치한 대구 최고의 당첨 기류를 가득 안은 행운의 중심지', '대구', 24),
              ('메트로센타열쇠', '대구 중구 덕산동 88', '1등 12회 / 2등 35회 이상', '반월당 지하상가 열쇠점 가판에서 소소하게 터지는 반전 1등의 대표적인 지하철 명소', '대구', 12),
              ('복권명당 평리점', '대구 서구 평리동 1094-1', '1등 9회 / 2등 25회 이상', '대구 평리동 사거리 중심가에서 오행의 상생 흐름을 타고 재물복을 이끄는 명소', '대구', 9),
              ('달서행운방', '대구 달서구 상인동 1506', '1등 8회 / 2등 22회 이상', '대구 남부 최대 인구 밀집 구역인 상인동 대로변을 대박 기운으로 채우는 달서구 최고 명소', '대구', 8),
              ('대박찬스 칠성점', '대구 북구 칠성동1가 180', '1등 7회 / 2등 20회 이상', '칠성시장 야시장과 번화가 입구에서 상인과 서민들에게 금전 대박을 안겨주는 희망 복권방', '대구', 7),
              ('로또휴게실', '경기 용인시 기흥구 하갈동 143-4', '1등 22회 / 2등 70회 이상', '국도변 기흥 저수지 옆에 위치하여 운전자들의 필수 코스로 각광받는 경기 최대의 명소', '경기', 22),
              ('라이프마트', '인천 남동구 간석동 395-2', '1등 18회 / 2등 55회 이상', '인천 남동구 핵심 상권에 위치하여 서울/수도권을 장악하는 강력한 1등 행운 충전소', '경기', 18),
              ('원곡복권방', '경기 안산시 단원구 원곡동 794', '1등 11회 / 2등 30회 이상', '다문화 거리의 활기찬 다국적 만복과 에너지가 공명하는 안산 최고의 1등 배출처', '경기', 11),
              ('마두역상계점', '경기 고양시 일산동구 마두동 797', '1등 9회 / 2등 25회 이상', '일산 신도시 한가운데 마두역 대로변에서 수많은 시민들에게 꿈을 주는 일산 대표 명당', '경기', 9),
              ('수원행운복권방', '경기 수원시 팔달구 매산로1가 57-3', '1등 7회 / 2등 20회 이상', '수원역 앞 가장 활기찬 유동인구 기류 속에서 끊임없이 당첨을 쏟아내는 수원 최대 성지', '경기', 7),
              ('복권나라 중리점', '대전 대덕구 중리동 365-15', '1등 15회 / 2등 45회 이상', '대전 대덕구의 전통 깊은 복권명당으로 한결같이 높은 1등 출현율을 자랑하는 한밭의 자랑', '대전', 15),
              ('명당복권방 용전점', '대전 동구 용전동 141-1', '1등 9회 / 2등 25회 이상', '복합터미널 교통 요충지에서 대전 시민들에게 끊임없이 대박 행운을 점지하는 길지', '대전', 9),
              ('행운마트 둔산점', '대전 서구 둔산동 1081', '1등 7회 / 2등 20회 이상', '대전 행정타운 중심가 둔산동의 세련된 기류를 단박에 재물운으로 바꾸는 도심 속 요람', '대전', 7),
              ('유성온천대박방', '대전 유성구 봉명동 535-5', '1등 6회 / 2등 18회 이상', '유성온천의 영험한 정기와 수많은 관광객들의 행운 기류가 결집된 유성구 대표 복권방', '대전', 6),
              ('신탄진행운방', '대전 대덕구 신탄진동 120-1', '1등 5회 / 2등 15회 이상', '신탄진 IC 초입에서 화물 운전자들과 테크노밸리 근로자들의 희망을 일구는 명가', '대전', 5),
              ('로또명당 인주점', '충남 아산시 인주면 서해로 512-2', '1등 17회 / 2등 50회 이상', '충청권 최고의 1등 배출 명가로 아산만 방조제 길목에 위치하여 많은 방문객이 모여드는 성지', '충청', 17),
              ('썬마트', '충북 청주시 상당구 용암동 1693', '1등 12회 / 2등 35회 이상', '청주 최대 아파트 단지 상가에서 청주 인근의 맑은 산맥 기운을 타고 솟아오른 1위 명가', '충청', 12),
              ('행운복권 두정점', '충남 천안시 서북구 두정동 1354', '1등 9회 / 2등 25회 이상', '천안 두정역 번화가 청춘들의 열정 한복판에서 청량한 재물복을 선사하는 곳', '충청', 9),
              ('홍성대박가판', '충남 홍성군 홍성읍 오관리 311', '1등 6회 / 2등 18회 이상', '홍성 전통시장 입구에서 흘러나오는 재물 노다지 기운이 가득한 지역 대표 가판점', '충청', 6),
              ('충주대박방', '충북 청주시 흥덕구 복대동 853', '1등 5회 / 2등 15회 이상', '복대동 지웰시티 인근 신흥 중심가 코너에서 활기찬 도심 재물운을 분배하는 명가', '충청', 5),
              ('목화휴게소', '경남 사천시 용현면 주문리 4', '1등 19회 / 2등 60회 이상', '삼천포 앞바다가 훤히 트인 수려한 비경과 함께 엄청난 행운을 안겨주는 영남권 대박 명소', '경상', 19),
              ('복권천국 구미점', '경북 구미시 원평동 123-1', '1등 12회 / 2등 35회 이상', '구미 공단 노동자들의 성실한 에너지와 구미역 번화가 기류가 축적된 경북 1위 로또방', '경상', 12),
              ('경주명당가판', '경북 경주시 노서동 130-1', '1등 9회 / 2등 25회 이상', '천년고도 경주 대릉원과 첨성대의 유구한 땅의 영적 에너지를 간직한 역사적인 명가', '경상', 9),
              ('창원광장로또방', '경남 창원시 성산구 중앙동 95', '1등 8회 / 2등 22회 이상', '창원 시청 광장 한복판 대형 로터리 대로변에서 강력한 도심형 정기를 이끌어내는 성지', '경상', 8),
              ('울산대박마트', '울산 남구 삼산동 1521-1', '1등 7회 / 2등 20회 이상', '울산 삼산동 번화가 롯데백화점 인근에서 산업수도의 기운을 가득 모은 금전의 화수분', '경상', 7),
              ('알리바이', '광주 광산구 신창동 1252-11', '1등 12회 / 2등 40회 이상', '호남 지역의 최대 복권 판매점이자 광주 전남을 아우르는 최고의 1등 노다지 명소', '전라', 12),
              ('금암복권방', '전북 전주시 덕진구 금암동 720', '1등 9회 / 2등 25회 이상', '전주 고속터미널 초입 대로변 가판에서 관광객과 도민들에게 당첨의 기적을 전하는 곳', '전라', 9),
              ('행운의가판 금남로', '광주 동구 금남로5가 183', '1등 7회 / 2등 20회 이상', '금남로의 곧고 깨끗한 기류가 모여 상서로운 운을 이뤄내는 유서 깊은 노점 명당', '전라', 7),
              ('여수수산명당', '전남 여수시 교동 590', '1등 6회 / 2등 18회 이상', '여수 수산시장 입구의 끊임없는 활어 기운과 바닷바람이 닿는 남도 제일의 명당', '전라', 6),
              ('목포하당대박방', '전남 목포시 신흥동 980', '1등 5회 / 2등 15회 이상', '영산강 물줄기가 영산호로 모이는 풍요의 기운을 그대로 담아내는 대표 포구 명당', '전라', 5),
              ('제주복권방', '제주 제주시 노형동 911-3', '1등 9회 / 2등 25회 이상', '제주도 노형동의 핵심 입지에 자리하여 수많은 현지인과 관광객들이 줄지어 찾는 섬나라 최고 명당', '제주', 9),
              ('서귀포행운가판', '제주 서귀포시 서귀동 274', '1등 5회 / 2등 15회 이상', '서귀포 매일 올레시장 입구에서 한라산 자락의 상서로운 명기를 다 받아내는 곳', '제주', 5),
              ('함덕해변복권방', '제주 제주시 조천읍 함덕리 1251', '1등 4회 / 2등 12회 이상', '함덕 서우봉 해변에서 사시사철 불어오는 청량한 용궁 기류가 복으로 맺히는 성지', '제주', 4),
              ('연동대박마트', '제주 제주시 연동 272-3', '1등 3회 / 2등 10회 이상', '제주 도청과 신제주 번화가 최고의 중심 상권에서 번영과 성공을 이끄는 재물방', '제주', 3),
              ('성산일출명당', '제주 서귀포시 성산읍 성산리 110', '1등 3회 / 2등 8회 이상', '가장 먼저 해가 뜨는 성산 일출봉의 웅장한 아침 해돋이 기운을 담은 신비로운 로또 명가', '제주', 3)
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
              region TEXT NOT NULL,
              first_wins INTEGER NOT NULL
            );
          `, (err2) => {
            if (err2) return reject(err2);
            lottoSqlite.get('SELECT COUNT(*) as count FROM lotto_hotspots', [], (err3, row) => {
              if (err3) return reject(err3);
              if (row.count === 0) {
                const stmt = lottoSqlite.prepare('INSERT INTO lotto_hotspots (name, address, wins, description, region, first_wins) VALUES (?, ?, ?, ?, ?, ?)');
                const list = [
                  ['부일카서비스', '부산 동구 범일동 830-240', '1등 42회 / 2등 155회 이상', '카센타 내부에 위치하여 대기줄만 수십 미터에 달하는 부동의 영남 최다 명당', '부산', 42],
                  ['스파복권방', '서울 노원구 상계동 707-3', '1등 48회 / 2등 180회 이상', '전국 부동의 1위 명당으로 주말마다 대기열이 수백 미터에 달하는 대한민국 최고의 로또 명소', '서울', 48],
                  ['제이복권방', '서울 종로구 종로5가 58', '1등 15회 / 2등 45회 이상', '종로5가 핵심 역세권에 위치하여 전통의 강력한 만복 기운을 얻은 종로의 자부심', '서울', 15],
                  ['가판점', '서울 신문로1가 238', '1등 12회 / 2등 36회 이상', '서대문역과 광화문 광장 사이의 유동인구를 모두 행운으로 바꿔주는 광화문 최고 명소', '서울', 12],
                  ['교통카드판매소', '서울 영등포구 당산동6가 331-1', '1등 10회 / 2등 30회 이상', '당산역 출퇴근 직장인들이 매일 발걸음을 멈추고 복권을 구입하는 영등포 최고 명당', '서울', 10],
                  ['종합가판점', '서울 동대문구 청량리동 229', '1등 8회 / 2등 24회 이상', '청량리 역전 시장통에서 흘러나오는 활기찬 만복의 기운이 깃든 동대문의 행운 성지', '서울', 8],
                  ['천하명당복권방', '부산 동구 범일동 830-195', '1등 39회 / 2등 150회 이상', '부산과 영남 지역을 대표하는 전통 명문 명당으로 신기할 정도로 끊임없이 당첨자를 배출하는 곳', '부산', 39],
                  ['돈벼락맞는곳', '부산 동구 범일동 833-5', '1등 14회 / 2등 40회 이상', '천하명당복권방 인근 조방 대로변에 나란히 자리하여 쌍벽을 이루는 전통 명당', '부산', 14],
                  ['뉴빅마트', '부산 기장군 기장읍 동부리 274-1', '1등 10회 / 2등 28회 이상', '동부산 관광단지의 관문인 기장 시장길목에서 영험한 용궁의 복을 뿜어내는 기장 명소', '부산', 10],
                  ['서면로또방', '부산 진구 부전동 256-4', '1등 8회 / 2등 22회 이상', '부산의 심장 서면 교차로 한가운데서 젊은 활력과 대박 기류를 독점하는 도심형 명당', '부산', 8],
                  ['세진글라스', '대구 서구 평리동 1094-4', '1등 24회 / 2등 80회 이상', '안경점 내부에 위치한 대구 최고의 당첨 기류를 가득 안은 행운의 중심지', '대구', 24],
                  ['메트로센타열쇠', '대구 중구 덕산동 88', '1등 12회 / 2등 35회 이상', '반월당 지하상가 열쇠점 가판에서 소소하게 터지는 반전 1등의 대표적인 지하철 명소', '대구', 12],
                  ['복권명당 평리점', '대구 서구 평리동 1094-1', '1등 9회 / 2등 25회 이상', '대구 평리동 사거리 중심가에서 오행의 상생 흐름을 타고 재물복을 이끄는 명소', '대구', 9],
                  ['달서행운방', '대구 달서구 상인동 1506', '1등 8회 / 2등 22회 이상', '대구 남부 최대 인구 밀집 구역인 상인동 대로변을 대박 기운으로 채우는 달서구 최고 명소', '대구', 8],
                  ['대박찬스 칠성점', '대구 북구 칠성동1가 180', '1등 7회 / 2등 20회 이상', '칠성시장 야시장과 번화가 입구에서 상인과 서민들에게 금전 대박을 안겨주는 희망 복권방', '대구', 7],
                  ['로또휴게실', '경기 용인시 기흥구 하갈동 143-4', '1등 22회 / 2등 70회 이상', '국도변 기흥 저수지 옆에 위치하여 운전자들의 필수 코스로 각광받는 경기 최대의 명소', '경기', 22],
                  ['라이프마트', '인천 남동구 간석동 395-2', '1등 18회 / 2등 55회 이상', '인천 남동구 핵심 상권에 위치하여 서울/수도권을 장악하는 강력한 1등 행운 충전소', '경기', 18],
                  ['원곡복권방', '경기 안산시 단원구 원곡동 794', '1등 11회 / 2등 30회 이상', '다문화 거리의 활기찬 다국적 만복과 에너지가 공명하는 안산 최고의 1등 배출처', '경기', 11],
                  ['마두역상계점', '경기 고양시 일산동구 마두동 797', '1등 9회 / 2등 25회 이상', '일산 신도시 한가운데 마두역 대로변에서 수많은 시민들에게 꿈을 주는 일산 대표 명당', '경기', 9],
                  ['수원행운복권방', '경기 수원시 팔달구 매산로1가 57-3', '1등 7회 / 2등 20회 이상', '수원역 앞 가장 활기찬 유동인구 기류 속에서 끊임없이 당첨을 쏟아내는 수원 최대 성지', '경기', 7],
                  ['복권나라 중리점', '대전 대덕구 중리동 365-15', '1등 15회 / 2등 45회 이상', '대전 대덕구의 전통 깊은 복권명당으로 한결같이 높은 1등 출현율을 자랑하는 한밭의 자랑', '대전', 15],
                  ['명당복권방 용전점', '대전 동구 용전동 141-1', '1등 9회 / 2등 25회 이상', '복합터미널 교통 요충지에서 대전 시민들에게 끊임없이 대박 행운을 점지하는 길지', '대전', 9],
                  ['행운마트 둔산점', '대전 서구 둔산동 1081', '1등 7회 / 2등 20회 이상', '대전 행정타운 중심가 둔산동의 세련된 기류를 단박에 재물운으로 바꾸는 도심 속 요람', '대전', 7],
                  ['유성온천대박방', '대전 유성구 봉명동 535-5', '1등 6회 / 2등 18회 이상', '유성온천의 영험한 정기와 수많은 관광객들의 행운 기류가 결집된 유성구 대표 복권방', '대전', 6],
                  ['신탄진행운방', '대전 대덕구 신탄진동 120-1', '1등 5회 / 2등 15회 이상', '신탄진 IC 초입에서 화물 운전자들과 테크노밸리 근로자들의 희망을 일구는 명가', '대전', 5],
                  ['로또명당 인주점', '충남 아산시 인주면 서해로 512-2', '1등 17회 / 2등 50회 이상', '충청권 최고의 1등 배출 명가로 아산만 방조제 길목에 위치하여 많은 방문객이 모여드는 성지', '충청', 17],
                  ['썬마트', '충북 청주시 상당구 용암동 1693', '1등 12회 / 2등 35회 이상', '청주 최대 아파트 단지 상가에서 청주 인근의 맑은 산맥 기운을 타고 솟아오른 1위 명가', '충청', 12],
                  ['행운복권 두정점', '충남 천안시 서북구 두정동 1354', '1등 9회 / 2등 25회 이상', '천안 두정역 번화가 청춘들의 열정 한복판에서 청량한 재물복을 선사하는 곳', '충청', 9],
                  ['홍성대박가판', '충남 홍성군 홍성읍 오관리 311', '1등 6회 / 2등 18회 이상', '홍성 전통시장 입구에서 흘러나오는 재물 노다지 기운이 가득한 지역 대표 가판점', '충청', 6],
                  ['충주대박방', '충북 청주시 흥덕구 복대동 853', '1등 5회 / 2등 15회 이상', '복대동 지웰시티 인근 신흥 중심가 코너에서 활기찬 도심 재물운을 분배하는 명가', '충청', 5],
                  ['목화휴게소', '경남 사천시 용현면 주문리 4', '1등 19회 / 2등 60회 이상', '삼천포 앞바다가 훤히 트인 수려한 비경과 함께 엄청난 행운을 안겨주는 영남권 대박 명소', '경상', 19],
                  ['복권천국 구미점', '경북 구미시 원평동 123-1', '1등 12회 / 2등 35회 이상', '구미 공단 노동자들의 성실한 에너지와 구미역 번화가 기류가 축적된 경북 1위 로또방', '경상', 12],
                  ['경주명당가판', '경북 경주시 노서동 130-1', '1등 9회 / 2등 25회 이상', '천년고도 경주 대릉원과 첨성대의 유구한 땅의 영적 에너지를 간직한 역사적인 명가', '경상', 9],
                  ['창원광장로또방', '경남 창원시 성산구 중앙동 95', '1등 8회 / 2등 22회 이상', '창원 시청 광장 한복판 대형 로터리 대로변에서 강력한 도심형 정기를 이끌어내는 성지', '경상', 8],
                  ['울산대박마트', '울산 남구 삼산동 1521-1', '1등 7회 / 2등 20회 이상', '울산 삼산동 번화가 롯데백화점 인근에서 산업수도의 기운을 가득 모은 금전의 화수분', '경상', 7],
                  ['알리바이', '광주 광산구 신창동 1252-11', '1등 12회 / 2등 40회 이상', '호남 지역의 최대 복권 판매점이자 광주 전남을 아우르는 최고의 1등 노다지 명소', '전라', 12],
                  ['금암복권방', '전북 전주시 덕진구 금암동 720', '1등 9회 / 2등 25회 이상', '전주 고속터미널 초입 대로변 가판에서 관광객과 도민들에게 당첨의 기적을 전하는 곳', '전라', 9],
                  ['행운의가판 금남로', '광주 동구 금남로5가 183', '1등 7회 / 2등 20회 이상', '금남로의 곧고 깨끗한 기류가 모여 상서로운 운을 이뤄내는 유서 깊은 노점 명당', '전라', 7],
                  ['여수수산명당', '전남 여수시 교동 590', '1등 6회 / 2등 18회 이상', '여수 수산시장 입구의 끊임없는 활어 기운과 바닷바람이 닿는 남도 제일의 명당', '전라', 6],
                  ['목포하당대박방', '전남 목포시 신흥동 980', '1등 5회 / 2등 15회 이상', '영산강 물줄기가 영산호로 모이는 풍요의 기운을 그대로 담아내는 대표 포구 명당', '전라', 5],
                  ['제주복권방', '제주 제주시 노형동 911-3', '1등 9회 / 2등 25회 이상', '제주도 노형동의 핵심 입지에 자리하여 수많은 현지인과 관광객들이 줄지어 찾는 섬나라 최고 명당', '제주', 9],
                  ['서귀포행운가판', '제주 서귀포시 서귀동 274', '1등 5회 / 2등 15회 이상', '서귀포 매일 올레시장 입구에서 한라산 자락의 상서로운 명기를 다 받아내는 곳', '제주', 5],
                  ['함덕해변복권방', '제주 제주시 조천읍 함덕리 1251', '1등 4회 / 2등 12회 이상', '함덕 서우봉 해변에서 사시사철 불어오는 청량한 용궁 기류가 복으로 맺히는 성지', '제주', 4],
                  ['연동대박마트', '제주 제주시 연동 272-3', '1등 3회 / 2등 10회 이상', '제주 도청과 신제주 번화가 최고의 중심 상권에서 번영과 성공을 이끄는 재물방', '제주', 3],
                  ['성산일출명당', '제주 서귀포시 성산읍 성산리 110', '1등 3회 / 2등 8회 이상', '가장 먼저 해가 뜨는 성산 일출봉의 웅장한 아침 해돋이 기운을 담은 신비로운 로또 명가', '제주', 3]
                ];
                list.forEach(item => {
                  stmt.run(item[0], item[1], item[2], item[3], item[4], item[5]);
                });
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
      return pgPool.query('SELECT id, name, address, wins, description, region, first_wins FROM lotto_hotspots ORDER BY first_wins DESC')
        .then(res => res.rows);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.all('SELECT id, name, address, wins, description, region, first_wins FROM lotto_hotspots ORDER BY first_wins DESC', [], (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
    }
  },
  updateWins: (id, wins, firstWins) => {
    if (isPg) {
      return pgPool.query('UPDATE lotto_hotspots SET wins = $1, first_wins = $2 WHERE id = $3', [wins, firstWins, id]);
    } else {
      return new Promise((resolve, reject) => {
        lottoSqlite.run('UPDATE lotto_hotspots SET wins = ?, first_wins = ? WHERE id = ?', [wins, firstWins, id], (err) => {
          if (err) reject(err); else resolve();
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
