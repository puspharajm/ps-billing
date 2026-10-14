import { Client } from 'pg';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const NEON_CONNECTION_STRING = process.env.NEON_DATABASE_URL;

async function mapSQLiteTypeToPostgres(sqliteType: string): Promise<string> {
  const t = sqliteType.toUpperCase();
  if (t.includes('INT')) return 'INTEGER';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'TEXT';
  if (t.includes('BLOB') || t === '') return 'BYTEA';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
  if (t.includes('TIMESTAMP') || t.includes('DATETIME')) return 'TIMESTAMP';
  return 'TEXT'; // default fallback
}

function getSqliteTables(db: sqlite3.Database): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
}

function getSqliteTableSchema(db: sqlite3.Database, tableName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info("${tableName}")`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getSqliteRows(db: sqlite3.Database, tableName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM "${tableName}"`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export async function runBackup() {
  if (!NEON_CONNECTION_STRING) {
    throw new Error("NEON_DATABASE_URL is not set in environment variables");
  }
  console.log("Starting backup to Neon DB...");
  const pgClient = new Client({ connectionString: NEON_CONNECTION_STRING });
  
  try {
    await pgClient.connect();
    console.log("Connected to Neon DB.");

    const basePath = path.normalize(path.join(__dirname, '..'));
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const files = fs.readdirSync(basePath).filter(f => f.endsWith('.sqlite'));

    for (const file of files) {
      console.log(`Processing database file: ${file}`);
      
      let schemaName = 'public';
      if (file.startsWith('billing_tenant_')) {
        const hash = file.replace('billing_tenant_', '').replace('.sqlite', '');
        schemaName = `tenant_${hash}`;
      }

      await pgClient.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      console.log(`Created/verified schema: ${schemaName}`);

      const sqliteDbPath = path.normalize(path.join(basePath, file));
      if (!sqliteDbPath.startsWith(basePath)) {
        console.warn(`Skipping invalid path: ${sqliteDbPath}`);
        continue;
      }
      const db = new sqlite3.Database(sqliteDbPath);

      const tables = await getSqliteTables(db);
      
      for (const table of tables) {
        console.log(`  Syncing table: ${table}`);
        const columns = await getSqliteTableSchema(db, table);
        
        // Construct CREATE TABLE statement
        const colDefs = await Promise.all(columns.map(async col => {
          const pgType = await mapSQLiteTypeToPostgres(col.type);
          return `"${col.name}" ${pgType}`;
        }));
        
        const createTableQuery = `
          DROP TABLE IF EXISTS "${schemaName}"."${table}" CASCADE;
          CREATE TABLE "${schemaName}"."${table}" (
            ${colDefs.join(', ')}
          );
        `;
        
        await pgClient.query(createTableQuery);

        // Fetch and insert rows
        const rows = await getSqliteRows(db, table);
        if (rows.length > 0) {
          const colNames = columns.map(c => `"${c.name}"`).join(', ');
          
          for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            
            const values: any[] = [];
            const placeholders = chunk.map((row, rowIndex) => {
              const rowPlaceholders = columns.map((col, colIndex) => {
                const propValue = Object.entries(row).find(([key]) => key === col.name)?.[1] ?? null;
                values.push(propValue);
                return `$${rowIndex * columns.length + colIndex + 1}`;
              }).join(', ');
              return `(${rowPlaceholders})`;
            }).join(', ');

            const insertQuery = `INSERT INTO "${schemaName}"."${table}" (${colNames}) VALUES ${placeholders};`;
            await pgClient.query(insertQuery, values);
          }
        }
      }
      
      db.close();
    }
    
    console.log("Backup to Neon DB completed successfully.");
    return { success: true, message: "Backup completed successfully" };
  } catch (error: any) {
    console.error("Backup failed:", error);
    throw error;
  } finally {
    await pgClient.end();
  }
}
