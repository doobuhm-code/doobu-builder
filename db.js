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

module.exports = {
  isPg,
  initPgTables,
  lotto,
  pension,
  news
};
