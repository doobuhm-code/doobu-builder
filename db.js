const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
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

module.exports = {
  isPg,
  initPgTables,
  lotto,
  pension
};
