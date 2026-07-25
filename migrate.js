require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const lottoDbPath = path.join(__dirname, 'lotto.db');
const pensionDbPath = path.join(__dirname, 'pension_lotto.db');

async function migrate() {
  console.log('🏁 Starting migration from SQLite to Supabase PostgreSQL...');

  // 1. Connect and initialize PostgreSQL tables
  const client = await pgPool.connect();
  try {
    console.log('📦 Initializing PostgreSQL tables...');
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
    client.release();
    process.exit(1);
  }

  // 2. Migrate Lotto records
  console.log('🎰 Migrating Lotto data...');
  const lottoSqlite = new sqlite3.Database(lottoDbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('❌ Failed to open lotto.db:', err.message);
      process.exit(1);
    }
  });

  const lottoRows = await new Promise((resolve, reject) => {
    lottoSqlite.all('SELECT * FROM lotto', [], (err, rows) => {
      if (err) {
        lottoSqlite.all('SELECT * FROM lotto_history', [], (err2, rows2) => {
          if (err2) reject(err2); else resolve(rows2);
        });
      } else resolve(rows);
    });
  });

  console.log(`📊 Found ${lottoRows.length} lotto records in SQLite.`);
  let lottoMigrated = 0;
  
  // Batch inserts or sequential with ON CONFLICT DO NOTHING
  for (const row of lottoRows) {
    try {
      await client.query(`
        INSERT INTO lotto_history (drwno, drwnodate, num1, num2, num3, num4, num5, num6, bnusno)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (drwno) DO NOTHING
      `, [row.drwNo, row.drwNoDate, row.num1, row.num2, row.num3, row.num4, row.num5, row.num6, row.bnusNo]);
      lottoMigrated++;
    } catch (insertErr) {
      console.error(`❌ Error migrating lotto drwNo ${row.drwNo}:`, insertErr.message);
    }
  }
  console.log(`✅ Lotto migration complete. ${lottoMigrated}/${lottoRows.length} successfully processed.`);

  // Close lotto SQLite connection
  lottoSqlite.close();

  // 3. Migrate Pension records
  console.log('🎟️ Migrating Pension Lotto data...');
  const pensionSqlite = new sqlite3.Database(pensionDbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('❌ Failed to open pension_lotto.db:', err.message);
      process.exit(1);
    }
  });

  const pensionRows = await new Promise((resolve, reject) => {
    pensionSqlite.all('SELECT * FROM pension_lotto', [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  console.log(`📊 Found ${pensionRows.length} pension records in SQLite.`);
  let pensionMigrated = 0;

  for (const row of pensionRows) {
    try {
      await client.query(`
        INSERT INTO pension_lotto (drw_no, drw_no_date, win_group, num1, num2, num3, num4, num5, num6)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (drw_no) DO NOTHING
      `, [row.drw_no, row.drw_no_date, row.win_group, row.num1, row.num2, row.num3, row.num4, row.num5, row.num6]);
      pensionMigrated++;
    } catch (insertErr) {
      console.error(`❌ Error migrating pension drw_no ${row.drw_no}:`, insertErr.message);
    }
  }
  console.log(`✅ Pension migration complete. ${pensionMigrated}/${pensionRows.length} successfully processed.`);

  // Close pension SQLite connection
  pensionSqlite.close();

  // Release PG client
  client.release();
  await pgPool.end();

  console.log('🎉 Migration fully finished!');
}

migrate().catch(err => {
  console.error('❌ Migration failed with uncaught error:', err);
  process.exit(1);
});
