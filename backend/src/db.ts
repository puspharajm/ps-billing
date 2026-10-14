import sqlite3 from 'sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { 
  CompanySettings, Customer, Supplier, Item, Invoice, InvoiceItem, Payment, User, Session 
} from './types';

import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';
dotenv.config();

let isOnline = false;

function getConfiguredNeonUrl(): string {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
}

// Resolve the writable directory for SQLite databases.
// In a packaged Electron app __dirname is inside the read-only ASAR archive,
// so we use process.resourcesPath which points to the extracted resources.
function getDbBasePath(): string {
  // Check if running inside a packaged Electron app
  const isPackaged = typeof process !== 'undefined'
    && (process as any).resourcesPath
    && !(process as any).resourcesPath.includes('node_modules');
  if (isPackaged) {
    try {
      const { app } = require('electron');
      if (app) {
        return app.getPath('userData');
      }
    } catch (e) {
      // ignore
    }
    return process.env.APPDATA ? path.join(process.env.APPDATA, 'SMR Groups Billing') : (process as any).resourcesPath;
  }
  // Development: databases live in the backend/ directory
  return path.join(__dirname, '..');
}

const DB_BASE = getDbBasePath();
const DB_FILE = path.join(DB_BASE, 'billing.sqlite');
let masterDb: sqlite3.Database;
let pgPool: Pool;

export const tenantContext = new AsyncLocalStorage<sqlite3.Database | string>();
const tenantDbs = new Map<string, sqlite3.Database | string>();

// SQLite Helpers
function initSqliteMaster() {
  console.log("Initializing Master SQLite database at", DB_FILE);
  
  const isPackaged = typeof process !== 'undefined'
    && (process as any).resourcesPath
    && !(process as any).resourcesPath.includes('node_modules');

  if (isPackaged) {
    if (!fs.existsSync(DB_FILE)) {
      const sourceDb = path.join((process as any).resourcesPath, 'billing.sqlite');
      if (fs.existsSync(sourceDb)) {
        const dir = path.dirname(DB_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(sourceDb, DB_FILE);
        console.log("Copied initial database to userData folder");
      }
    }
  }

  masterDb = new sqlite3.Database(DB_FILE);
  masterDb.serialize(() => {
    masterDb.run("PRAGMA foreign_keys = ON;");
  });
}

// Postgres dialect conversion helpers
function convertToPgSql(sql: string): string {
  // Detect INSERT OR IGNORE BEFORE replacing ? so we can use the flag later
  const isInsertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);

  let counter = 1;
  let pgSql = sql.replace(/\?/g, () => `$${counter++}`);

  // Convert INSERT OR IGNORE INTO → INSERT INTO  (ON CONFLICT appended below)
  if (isInsertOrIgnore) {
    pgSql = pgSql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');
  }

  // Convert SQLite date functions
  pgSql = pgSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');

  // Cast text expires_at to timestamptz for Postgres compatibility
  pgSql = pgSql.replace(/expires_at\s*([><= ])\s*CURRENT_TIMESTAMP/gi, 'CAST(expires_at AS timestamptz) $1 CURRENT_TIMESTAMP');

  // Append RETURNING id for INSERT statements
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
    if (isInsertOrIgnore) {
      // Upsert: do nothing on conflict, still return id (null if not inserted)
      pgSql += ' ON CONFLICT DO NOTHING RETURNING id';
    } else {
      pgSql += ' RETURNING id';
    }
  }
  return pgSql;
}

function convertCreateTable(sql: string): string {
  // Convert SQLite AUTOINCREMENT to Postgres SERIAL
  return sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
}

function getActiveDb(): sqlite3.Database | string {
  return tenantContext.getStore() || (isOnline ? 'public' : masterDb);
}

// ==========================================
// DB WRAPPERS (Dual Adapter)
// ==========================================

export function run(sql: string, params: any[] = []): Promise<{ id: number; changes: number }> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const tenantSchema = getActiveDb() as string;
        const pgSql = convertCreateTable(convertToPgSql(sql));
        if (!pgPool) throw new Error("Database not initialized. Ensure DATABASE_URL is set.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO "${tenantSchema}", public`);
          const result = await client.query(pgSql, params);
          resolve({ id: result.rows[0]?.id || 0, changes: result.rowCount || 0 });
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      (getActiveDb() as sqlite3.Database).run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    }
  });
}

// Explicitly run queries on the Global/Master Database
export function runGlobal(sql: string, params: any[] = []): Promise<{ id: number; changes: number }> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const pgSql = convertCreateTable(convertToPgSql(sql));
        if (!pgPool) throw new Error("Database not initialized.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO public`);
          const result = await client.query(pgSql, params);
          resolve({ id: result.rows[0]?.id || 0, changes: result.rowCount || 0 });
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      masterDb.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    }
  });
}

export function all<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const tenantSchema = getActiveDb() as string;
        const pgSql = convertToPgSql(sql);
        if (!pgPool) throw new Error("Database not initialized. Ensure DATABASE_URL is set.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO "${tenantSchema}", public`);
          const result = await client.query(pgSql, params);
          resolve(result.rows as T[]);
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      (getActiveDb() as sqlite3.Database).all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows as T[]);
      });
    }
  });
}

export function allGlobal<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const pgSql = convertToPgSql(sql);
        if (!pgPool) throw new Error("Database not initialized.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO public`);
          const result = await client.query(pgSql, params);
          resolve(result.rows as T[]);
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      masterDb.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []) as T[]);
      });
    }
  });
}

export function get<T>(sql: string, params: any[] = []): Promise<T | null> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const tenantSchema = getActiveDb() as string;
        const pgSql = convertToPgSql(sql);
        if (!pgPool) throw new Error("Database not initialized. Ensure DATABASE_URL is set.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO "${tenantSchema}", public`);
          const result = await client.query(pgSql, params);
          resolve((result.rows[0] || null) as T | null);
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      (getActiveDb() as sqlite3.Database).get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve((row || null) as T | null);
      });
    }
  });
}

export function getGlobal<T>(sql: string, params: any[] = []): Promise<T | null> {
  return new Promise(async (resolve, reject) => {
    if (isOnline) {
      try {
        const pgSql = convertToPgSql(sql);
        if (!pgPool) throw new Error("Database not initialized.");
        const client = await pgPool.connect();
        try {
          await client.query(`SET search_path TO public`);
          const result = await client.query(pgSql, params);
          resolve((result.rows[0] || null) as T | null);
        } finally {
          client.release();
        }
      } catch (err) {
        reject(err);
      }
    } else {
      masterDb.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve((row || null) as T | null);
      });
    }
  });
}

// ==========================================
// Initialization
// ==========================================

async function initializeNeonDatabase() {
  const dbUrl = getConfiguredNeonUrl();
  if (!dbUrl) {
    const msg = [
      'No database connection string found.',
      'Set DATABASE_URL or NEON_DATABASE_URL in the environment to use Neon.',
    ].join('\n');
    console.error(msg);
    throw new Error('No database connection string available for Neon.');
  }

  console.log('Initializing Neon secondary database for auth and user data...');
  const cleanDbUrl = dbUrl.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');

  pgPool = new Pool({
    connectionString: cleanDbUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  try {
    const testClient = await pgPool.connect();
    await testClient.query('SELECT 1');
    testClient.release();
    console.log('Neon Postgres connection verified successfully.');
    isOnline = true;
  } catch (connErr: any) {
    console.error('FATAL: Cannot connect to Postgres database:', connErr.message);
    console.error('Verify DATABASE_URL or NEON_DATABASE_URL is correct and the database is accessible.');
    throw connErr;
  }
}

export async function initializeDatabase() {
  const hasNeonConfig = !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
  const preferLocalPrimary = process.env.ELECTRON === '1'
    || (!process.env.VERCEL && process.env.USE_NEON !== 'true' && !hasNeonConfig);

  if (preferLocalPrimary) {
    try {
      initSqliteMaster();
      isOnline = false;
      console.log('Using local SQLite primary database for application data.');
    } catch (localErr: any) {
      console.warn('Local SQLite primary database unavailable. Falling back to Neon auth/user database.', localErr.message || localErr);
      isOnline = true;
      await initializeNeonDatabase();
    }
  } else {
    try {
      await initializeNeonDatabase();
      isOnline = true;
      console.log('Using Neon auth/user database as the configured primary for login and user data.');
    } catch (neonErr: any) {
      console.warn('Neon auth/user database unavailable. Falling back to local SQLite.', neonErr.message || neonErr);
      initSqliteMaster();
      isOnline = false;
    }
  }

  // Users table (authentication)
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP
    )
  `);

  // Sessions table (auth tokens)
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Licensees table
  await run(`
    CREATE TABLE IF NOT EXISTS licensees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_number TEXT UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      licensee_name TEXT NOT NULL,
      logo_data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await run("ALTER TABLE licensees ADD COLUMN logo_data TEXT");
  } catch (err: any) {
    if (err.code !== '42701' && !String(err.message).toLowerCase().includes('duplicate column name')) {
      throw err;
    }
  }

  try {
    await run("ALTER TABLE users ADD COLUMN license_number TEXT");
  } catch (err) {
    // Ignore error if column already exists
  }

  // Notifications table (global alerts)
  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_name TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    )
  `);

  // Ensure 'Admin' licensee exists
  const adminLicensee = await get<any>("SELECT * FROM licensees WHERE license_number = 'Admin'");
  if (!adminLicensee) {
    console.log("Seeding default Admin licensee (Admin)...");
    await run(`
      INSERT INTO licensees (license_number, company_name, licensee_name)
      VALUES ('Admin', 'Admin', 'Admin')
    `);
  }

  // Ensure 'LIC-TAMILNADU' and 'LIC-PONDY' licensees exist
  const tnLicensee = await get<any>("SELECT * FROM licensees WHERE license_number = 'LIC-TAMILNADU'");
  if (!tnLicensee) {
    console.log("Seeding default Tamilnadu licensee...");
    await run(`
      INSERT INTO licensees (license_number, company_name, licensee_name)
      VALUES ('LIC-TAMILNADU', 'SMR Groups Tamilnadu', 'SMR Tamilnadu')
    `);
  }

  const pondyLicensee = await get<any>("SELECT * FROM licensees WHERE license_number = 'LIC-PONDY'");
  if (!pondyLicensee) {
    console.log("Seeding default Pondy licensee...");
    await run(`
      INSERT INTO licensees (license_number, company_name, licensee_name)
      VALUES ('LIC-PONDY', 'SMR Groups Pondy', 'SMR Pondy')
    `);
  }

  const superAdminUsername = process.env.SUPER_ADMIN_USERNAME?.trim();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (Boolean(superAdminUsername) !== Boolean(superAdminPassword)) {
    throw new Error('Set both SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD to configure the administrator account.');
  }

  if (superAdminUsername && superAdminPassword) {
    const adminUser = await get<{ id: number }>(
      "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
      [superAdminUsername]
    );
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(superAdminPassword, salt, 64).toString('hex');
    if (adminUser) {
      await run(
        "UPDATE users SET password_hash = ?, salt = ?, role = 'admin', license_number = 'Admin' WHERE id = ?",
        [hash, salt, adminUser.id]
      );
    } else {
      await run(
        "INSERT INTO users (username, password_hash, salt, role, license_number) VALUES (?, ?, ?, 'admin', 'Admin')",
        [superAdminUsername, hash, salt]
      );
    }
  } else {
    console.warn('Administrator bootstrap is disabled; set SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD to create or reset an administrator.');
  }

  // Ensure 'LIC-LQGR-8ULB' licensee exists
  const groupsLicensee = await get<any>("SELECT * FROM licensees WHERE license_number = 'LIC-LQGR-8ULB'");
  if (!groupsLicensee) {
    console.log("Seeding default Groups licensee...");
    await run(`
      INSERT INTO licensees (license_number, company_name, licensee_name)
      VALUES ('LIC-LQGR-8ULB', 'SMR Groups', 'SMR Groups')
    `);
  }

  const defaultUserPassword = process.env.DEFAULT_USER_PASSWORD;
  if (defaultUserPassword) {
    const defaultAccounts = [
      { username: 'smrtamilnadu', licenseNumber: 'LIC-TAMILNADU' },
      { username: 'smrpondy', licenseNumber: 'LIC-PONDY' },
      { username: 'smrgroups', licenseNumber: 'LIC-LQGR-8ULB' },
      { username: 'SMR Trading and Company Pondy', licenseNumber: 'LIC-SMRTRADING' },
      { username: 'smrtrading', licenseNumber: 'LIC-SMRTRADING' },
    ];

    for (const account of defaultAccounts) {
      const existingUser = await get<{ id: number }>(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
        [account.username]
      );
      if (existingUser) continue;

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(defaultUserPassword, salt, 64).toString('hex');
      await run(
        "INSERT INTO users (username, password_hash, salt, role, license_number) VALUES (?, ?, ?, 'user', ?)",
        [account.username, hash, salt, account.licenseNumber]
      );
    }
  } else {
    console.warn('Default company accounts were not seeded; set DEFAULT_USER_PASSWORD to create them.');
  }
}

// ==========================================
// Tenant Database Initialization
// ==========================================

export async function getTenantDb(userId: number): Promise<sqlite3.Database | string> {
  const safeId = crypto.createHash('md5').update(String(userId)).digest('hex');
  const dbName = `billing_tenant_${safeId}.sqlite`;
  const schemaName = `tenant_${safeId}`;
  
  if (isOnline) {
    if (tenantDbs.has(schemaName)) {
      return tenantDbs.get(schemaName)!;
    }

    if (!pgPool) throw new Error("Database not initialized. Ensure DATABASE_URL is set.");
    const client = await pgPool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      tenantDbs.set(schemaName, schemaName);

      await new Promise<void>((resolve, reject) => {
        tenantContext.run(schemaName, async () => {
          try {
            const tableCheck = await get<{ count: number | string }>(`
              SELECT count(*) as count 
              FROM information_schema.tables 
              WHERE table_schema = ? AND table_name = 'settings'
            `, [schemaName]);
            
            const isNew = parseInt((tableCheck?.count || 0).toString()) === 0;
            
            if (isNew) {
              await initializeTenantDatabase();
            } else {
              await migrateTenantDatabase();
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
      return schemaName;
    } finally {
      client.release();
    }
  } else {
    // Untaint the filename using a strict regex
    if (!/^billing_tenant_[a-f0-9]{32}\.sqlite$/.test(dbName)) {
      throw new Error("Invalid database filename pattern");
    }
    
    const basePath = path.normalize(DB_BASE);
    const fullPath = path.normalize(path.join(basePath, dbName));
    
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid path specified for tenant database");
    }
    
    if (tenantDbs.has(dbName)) {
      return tenantDbs.get(dbName)! as sqlite3.Database;
    }

    const tDb = new sqlite3.Database(fullPath);
    
    tDb.serialize(() => {
      tDb.run("PRAGMA foreign_keys = ON;");
    });

    tenantDbs.set(dbName, tDb);

    await new Promise<void>((resolve, reject) => {
      tenantContext.run(tDb, async () => {
        try {
          const tableCheck = await get<{ count: number }>("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='settings'");
          const isNew = !tableCheck || tableCheck.count === 0;
          
          if (isNew) {
            await initializeTenantDatabase();
          } else {
            await migrateTenantDatabase();
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    return tDb;
  }
}

export async function initializeTenantDatabase() {
  console.log("Initializing new Tenant database...");

  // 1. Settings table
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      state TEXT,
      state_code TEXT,
      bank_name TEXT,
      account_name TEXT,
      account_number TEXT,
      ifsc_code TEXT,
      branch TEXT,
      terms_conditions TEXT,
      custom_print_layout TEXT
    )
  `);

  // 2. Customers table
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      state TEXT,
      state_code TEXT,
      gstin TEXT,
      opening_balance REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Suppliers table
  await run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      state TEXT,
      state_code TEXT,
      gstin TEXT,
      opening_balance REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Items table (electric motors)
  await run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      brand TEXT DEFAULT 'WEG',
      description TEXT,
      hp TEXT,
      rpm TEXT,
      poles TEXT,
      phase TEXT,
      frame TEXT,
      volts TEXT,
      purchase_price REAL DEFAULT 0,
      sales_price REAL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      low_stock_threshold REAL DEFAULT 2,
      gst_rate REAL DEFAULT 18,
      type TEXT DEFAULT 'motor',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Invoices table
  await run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_type TEXT NOT NULL, -- sales, purchase, quotation
      party_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      cgst REAL DEFAULT 0,
      sgst REAL DEFAULT 0,
      igst REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      round_off REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      balance_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid', -- paid, partial, unpaid
      notes TEXT,
      is_converted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Invoice Items table
  await run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      hp TEXT,
      rpm TEXT,
      poles TEXT,
      phase TEXT,
      frame TEXT,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      discount_pct REAL DEFAULT 0,
      taxable_value REAL NOT NULL,
      cgst_pct REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_pct REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_pct REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )
  `);

  // 7. Payments table
  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- receipt, payment
      party_id INTEGER NOT NULL,
      invoice_id INTEGER,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      mode TEXT NOT NULL, -- cash, bank, upi
      reference_number TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
    )
  `);

  // 8. Daily Expenses table
  await run(`
    CREATE TABLE IF NOT EXISTS daily_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_no TEXT UNIQUE NOT NULL,
      ref_date TEXT NOT NULL,
      expenses_group TEXT NOT NULL,
      amount REAL NOT NULL,
      narration TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function migrateTenantDatabase() {
  console.log("Running migrations for Tenant database...");

  // 8. Custom document sections (Proforma Invoice, Sales Order, Purchase Order, etc.)
  await run(`
    CREATE TABLE IF NOT EXISTS custom_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'FileText',
      color TEXT DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pre-seed the three classic sections so they appear on first login
  const defaultSections = [
    { name: 'Purchase Order', slug: 'purchase-order', icon: 'ShoppingCart', color: '#f59e0b' },
    { name: 'Proforma Invoice', slug: 'proforma-invoice', icon: 'FileText', color: '#3b82f6' },
    { name: 'Sales Order', slug: 'sales-order', icon: 'TrendingUp', color: '#10b981' },
  ];
  for (const sec of defaultSections) {
    try {
      await run(
        `INSERT OR IGNORE INTO custom_sections (name, slug, icon, color) VALUES (?, ?, ?, ?)`,
        [sec.name, sec.slug, sec.icon, sec.color]
      );
    } catch (_) { /* ignore */ }
  }

  // Safe migrations for existing databases
  const safeMigrations = [
    "ALTER TABLE items ADD COLUMN is_deleted INTEGER DEFAULT 0",
    "ALTER TABLE customers ADD COLUMN is_deleted INTEGER DEFAULT 0",
    "ALTER TABLE suppliers ADD COLUMN is_deleted INTEGER DEFAULT 0",
    "ALTER TABLE invoices ADD COLUMN converted_from_quotation_id INTEGER",
    "ALTER TABLE invoices ADD COLUMN custom_section_slug TEXT",
    "ALTER TABLE settings ADD COLUMN custom_print_layout TEXT",
    "ALTER TABLE items ADD COLUMN low_stock_threshold REAL DEFAULT 2",
    "ALTER TABLE items ADD COLUMN type TEXT DEFAULT 'motor'",
  ];
  for (const sql of safeMigrations) {
    try { await run(sql); } catch (_) { /* column already exists */ }
  }

  // 9. Stock transactions table
  await run(`
    CREATE TABLE IF NOT EXISTS stock_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      date TEXT NOT NULL,
      reference_number TEXT,
      party_id INTEGER,
      party_type TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )
  `);

  // 13. Daily Expenses table
  await run(`
    CREATE TABLE IF NOT EXISTS daily_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_no TEXT UNIQUE NOT NULL,
      ref_date TEXT NOT NULL,
      expenses_group TEXT NOT NULL,
      amount REAL NOT NULL,
      narration TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 10. Item Groups
  await run(`
    CREATE TABLE IF NOT EXISTS item_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 11. Sales Executives
  await run(`
    CREATE TABLE IF NOT EXISTS sales_executives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      region TEXT,
      commission_pct REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 12. Company Staff
  await run(`
    CREATE TABLE IF NOT EXISTS company_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      email TEXT,
      basic_salary REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 13. Expenses Groups
  await run(`
    CREATE TABLE IF NOT EXISTS expenses_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Exported helper for password hashing
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash: h, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}
