import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { 
  initializeDatabase, run, all, get, hashPassword, verifyPassword,
  getTenantDb, tenantContext, runGlobal, allGlobal, getGlobal
} from './db';
import { 
  CompanySettings, Customer, Supplier, Item, Invoice, InvoiceItem, Payment, User, Session 
} from './types';

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Vercel's reverse proxy
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
]);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Electron, curl, health checks)
    if (!origin) return callback(null, true);

    const isAllowedLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1):(4173|517[3-5])$/.test(origin);
    const isDesktopLocalOrigin = process.env.ELECTRON === '1'
      && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    if (allowedOrigins.has(origin) || isAllowedLocalDevOrigin || isDesktopLocalOrigin) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '512kb' }));

app.use((req, _res, next) => {
  if (req.url === '/_/backend' || req.url.startsWith('/_/backend/')) {
    req.url = req.url.slice('/_/backend'.length) || '/';
  }
  next();
});

// Log requests
app.use((req, res, next) => {
  if (process.env.ELECTRON !== '1') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

const ONLINE_BILLING_API_BASE_URL = 'https://ps-billing-eta.vercel.app/_/backend/api';

app.use('/api/online', async (req, res) => {
  if (process.env.ELECTRON !== '1') {
    return res.status(404).json({ error: 'Online desktop access is only available in the desktop app.' });
  }

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'This request method is not supported.' });
  }

  const upstreamUrl = `${ONLINE_BILLING_API_BASE_URL}${req.originalUrl.slice('/api/online'.length)}`;
  const headers = new Headers();
  const authorization = req.get('authorization');
  if (authorization) headers.set('Authorization', authorization);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  if (hasBody) headers.set('Content-Type', req.get('content-type') || 'application/json');

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      ...(hasBody ? { body: JSON.stringify(req.body ?? {}) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('Online billing API proxy request failed:', err);
    res.status(502).json({ error: 'The shared online billing service could not be reached.' });
  }
});

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
app.use(async (req: any, res, next) => {
  const p = req.path || '';
  const isLoginPath = p === '/api/auth/login' || p.endsWith('/api/auth/login');
  const isDesktopSetupPath = ['/api/auth/setup-status', '/api/auth/initial-admin']
    .some((setupPath) => p === setupPath || p.endsWith(setupPath));
  const isHealthPath = p === '/api/health' || p.endsWith('/api/health');
  const isPublicPanelsPath = p === '/api/public/panels' || p.endsWith('/api/public/panels');

  // Public routes that don't require authentication
  if (isLoginPath || isDesktopSetupPath || isHealthPath || isPublicPanelsPath) {
    return next();
  }

  // All other /api routes require a valid token
  if (req.path.startsWith('/api/')) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const session = await get<Session>(
        "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')",
        [token]
      );
      if (!session) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      const user = await get<User>("SELECT * FROM users WHERE id = ?", [session.user_id]);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Get licensee details if associated
      let licenseeCompanyName = user.role === 'admin' ? 'Admin' : 'Unknown';
      if (user.license_number) {
        const licensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [user.license_number]);
        if (licensee) {
          licenseeCompanyName = licensee.company_name;
        }
      }

      // Attach user to request
      req.user = { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        license_number: user.license_number,
        licensee_company_name: licenseeCompanyName
      };

      // Admin user management routes operate on the master DB
      if (req.path.startsWith('/api/admin/') || req.path === '/api/auth/logout' || req.path === '/api/auth/me') {
        return next();
      }

      // Standard routes operate on the user's tenant DB
      const tenantDb = await getTenantDb(user.id as number);
      return tenantContext.run(tenantDb, () => {
        next();
      });
    } catch (err) {
      return res.status(500).json({ error: 'Authentication check failed' });
    }
  }

  next();
});

// Admin-only middleware helper
function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==========================================
// 0. HEALTH CHECK (PUBLIC)
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    // Run a lightweight DB query to confirm the connection is alive
    await get<{ val: number }>('SELECT 1 as val', []);
    res.json({
      status: 'ok',
      mode: process.env.VERCEL ? 'vercel-postgres' : (process.env.USE_NEON === 'true' ? 'neon-postgres' : 'sqlite'),
      timestamp: new Date().toISOString(),
      version: '1.2.4',
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      message: err.message,
      hint: 'Check that DATABASE_URL is set correctly in Vercel Environment Variables.',
    });
  }
});

app.get('/api/public/panels', async (_req, res) => {
  try {
    const panels = await allGlobal<{
      id: number;
      company_name: string;
      licensee_name: string;
      logo_data: string | null;
      default_username: string;
    }>(`
      SELECT
        id,
        company_name,
        licensee_name,
        logo_data,
        (
          SELECT username
          FROM users
          WHERE users.license_number = licensees.license_number
            AND users.role = 'user'
          ORDER BY users.id ASC
          LIMIT 1
        ) AS default_username
      FROM licensees
      WHERE license_number IS NOT NULL
        AND TRIM(license_number) != ''
        AND license_number != 'Admin'
        AND EXISTS (
          SELECT 1 FROM users
          WHERE users.license_number = licensees.license_number
            AND users.role = 'user'
        )
      ORDER BY licensee_name ASC
    `);
    res.setHeader('Cache-Control', 'no-store');
    res.json(panels);
  } catch (err: any) {
    console.error('Unable to load public licensee panels:', err);
    res.status(500).json({ error: 'Unable to load company panels.' });
  }
});

// ==========================================
// 0. ELECTRON SYSTEM ENDPOINTS
// ==========================================
app.post('/api/shutdown', (req, res) => {
  // Only allow shutdown in offline mode — VERCEL env var is '1' on Vercel, absent locally
  if (!process.env.VERCEL) {
    res.json({ success: true, message: "Shutting down..." });
    console.log("Shutdown requested by client. Exiting...");
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } else {
    res.status(403).json({ error: "Shutdown not allowed in hosted environment." });
  }
});

// ==========================================
// -1. ADMIN BACKUP
// ==========================================
app.post('/api/admin/backup/trigger', requireAdmin, async (req: any, res: any) => {
  try {
    const { runBackup } = await import('./backup.js');
    const result = await runBackup();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Backup failed', details: error.message });
  }
});

// ==========================================
// -1. ADMIN USER & LICENSEE MANAGEMENT
// ==========================================

app.get('/api/admin/users', requireAdmin, async (req: any, res: any) => {
  try {
    const users = await allGlobal("SELECT id, username, role, license_number, created_at, last_login FROM users");
    res.json(users);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', requireAdmin, async (req: any, res: any) => {
  try {
    const { username, password, role, license_number } = req.body;
    const pwdHash = await hashPassword(password);
    await runGlobal("INSERT INTO users (username, password_hash, salt, role, license_number, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", [username, pwdHash.hash, pwdHash.salt, role, license_number || null]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { username, password, role, license_number } = req.body;
    if (password) {
      const pwdHash = await hashPassword(password);
      await runGlobal("UPDATE users SET username = ?, password_hash = ?, salt = ?, role = ?, license_number = ? WHERE id = ?", [username, pwdHash.hash, pwdHash.salt, role, license_number || null, id]);
    } else {
      await runGlobal("UPDATE users SET username = ?, role = ?, license_number = ? WHERE id = ?", [username, role, license_number || null, id]);
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await runGlobal("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/licensees', requireAdmin, async (req: any, res: any) => {
  try {
    const licensees = await allGlobal("SELECT * FROM licensees");
    res.json(licensees);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/licensees', requireAdmin, async (req: any, res: any) => {
  try {
    const { license_number, company_name, licensee_name } = req.body;
    await runGlobal("INSERT INTO licensees (license_number, company_name, licensee_name, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)", [license_number, company_name, licensee_name]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/licensees/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { company_name, licensee_name } = req.body;
    await runGlobal("UPDATE licensees SET company_name = ?, licensee_name = ? WHERE id = ?", [company_name, licensee_name, id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/licensees/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    await runGlobal("DELETE FROM licensees WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 0. AUTHENTICATION ENDPOINTS
// ==========================================
let initialAdminSetupInProgress = false;

app.get('/api/auth/setup-status', async (_req, res) => {
  if (process.env.ELECTRON !== '1') {
    return res.status(404).json({ error: 'Desktop setup is only available in the desktop app.' });
  }

  try {
    const adminCount = await get<{ count: number | string }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ setupRequired: Number(adminCount?.count || 0) === 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to check administrator setup.' });
  }
});

app.post('/api/auth/initial-admin', async (req, res) => {
  if (process.env.ELECTRON !== '1') {
    return res.status(404).json({ error: 'Desktop setup is only available in the desktop app.' });
  }
  if (initialAdminSetupInProgress) {
    return res.status(409).json({ error: 'Administrator setup is already in progress.' });
  }

  initialAdminSetupInProgress = true;
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (username.length < 3 || username.length > 100 || !password) {
      return res.status(400).json({ error: 'Enter a username (3–100 characters) and a password.' });
    }
    if (password.length < 12 || password.length > 256) {
      return res.status(400).json({ error: 'Choose an administrator password with at least 12 characters.' });
    }

    const existingAdmin = await get<{ id: number }>(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    if (existingAdmin) {
      return res.status(409).json({ error: 'An administrator is already configured. Sign in instead.' });
    }

    const existingUsername = await get<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );
    if (existingUsername) {
      return res.status(409).json({ error: 'That username already exists. Choose another one.' });
    }

    const { hash, salt } = hashPassword(password);
    await runGlobal(
      "INSERT INTO users (username, password_hash, salt, role, license_number) VALUES (?, ?, ?, 'admin', 'Admin')",
      [username, hash, salt]
    );
    res.status(201).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to create the administrator account.' });
  } finally {
    initialAdminSetupInProgress = false;
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, panel_id: panelId } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const normalizedUsername = String(username).trim();
    const user = await get<User>("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [normalizedUsername]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!verifyPassword(password, user.password_hash, user.salt)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (panelId !== undefined && panelId !== null && user.role === 'user') {
      const selectedPanel = Number(panelId);
      if (!Number.isSafeInteger(selectedPanel) || selectedPanel <= 0) {
        return res.status(400).json({ error: 'Invalid company panel selection.' });
      }
      const licensee = await get<any>('SELECT id FROM licensees WHERE id = ?', [selectedPanel]);
      if (!licensee) {
        return res.status(401).json({ error: 'Invalid username or password for the selected company panel.' });
      }
      const userLicensee = await get<any>('SELECT id FROM licensees WHERE license_number = ?', [user.license_number]);
      if (!userLicensee || Number(userLicensee.id) !== selectedPanel) {
        return res.status(401).json({ error: 'Invalid username or password for the selected company panel.' });
      }
    }

    // Licensee validation for normal user accounts
    if (user.role === 'user') {
      if (!user.license_number) {
        return res.status(401).json({ error: 'License validation failed. No license number associated with this user.' });
      }
      const licensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [user.license_number]);
      if (!licensee) {
        return res.status(401).json({ error: 'Invalid or expired licensee details. Contact your administrator.' });
      }
    }

    // Create session token (8 hour expiry)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await run(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
      [token, user.id, expiresAt]
    );

    // Update last login
    await run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);

    // Clean up expired sessions
    await run("DELETE FROM sessions WHERE expires_at < datetime('now')");

    // Get licensee details if associated
    let licenseeCompanyName = user.role === 'admin' ? 'Admin' : 'Unknown';
    if (user.license_number) {
      const licensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [user.license_number]);
      if (licensee) {
        licenseeCompanyName = licensee.company_name;
      }
    }

    res.json({
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        license_number: user.license_number,
        licensee_company_name: licenseeCompanyName
      }
    });
  } catch (err: any) {
    const msg: string = err.message || 'Unknown error';
    // Distinguish DB connection errors from auth errors
    if (msg.includes('ENOTFOUND') || msg.includes('DATABASE_URL') || msg.includes('not initialized') || msg.includes('connect ECONNREFUSED')) {
      return res.status(503).json({ 
        error: 'Database unavailable. Ensure DATABASE_URL is set in Vercel Environment Variables.',
        details: msg
      });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/auth/logout', async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await run("DELETE FROM sessions WHERE token = ?", [token]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req: any, res) => {
  try {
    res.json({ user: req.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 0b. SUPER-ADMIN USER MANAGEMENT ENDPOINTS
// ==========================================
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await all<any>("SELECT id, username, role, license_number, created_at, last_login FROM users ORDER BY id ASC");
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role, license_number } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check duplicate
    const existing = await get<User>("SELECT * FROM users WHERE username = ?", [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Validate license number for users
    if (role === 'user' || license_number) {
      if (!license_number) {
        return res.status(400).json({ error: 'License number is required for user account creation.' });
      }
      const licensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [license_number]);
      if (!licensee) {
        return res.status(400).json({ error: 'License number is invalid or not registered.' });
      }
    }

    const { hash, salt } = hashPassword(password);
    const result = await run(
      "INSERT INTO users (username, password_hash, salt, role, license_number) VALUES (?, ?, ?, ?, ?)",
      [username, hash, salt, role || 'user', license_number || null]
    );

    let newUser = null;
    if (result.id) {
      newUser = await get<any>("SELECT id, username, role, license_number, created_at, last_login FROM users WHERE id = ?", [result.id]);
    }
    if (!newUser) {
      newUser = await get<any>("SELECT id, username, role, license_number, created_at, last_login FROM users WHERE username = ?", [username]);
    }
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { username, password, role, license_number } = req.body;

    // Prevent admin from demoting themselves
    if (req.user.id === id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote your own admin account' });
    }

    // Validate license number if updating to role user or changing license
    if (role === 'user' || (license_number && role !== 'admin')) {
      if (license_number) {
        const licensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [license_number]);
        if (!licensee) {
          return res.status(400).json({ error: 'License number is invalid or not registered.' });
        }
      } else if (role === 'user') {
        // Fetch current to check if it has a license
        const existingUser = await get<User>("SELECT * FROM users WHERE id = ?", [id]);
        if (existingUser && !existingUser.license_number) {
          return res.status(400).json({ error: 'License number is required for user account.' });
        }
      }
    }

    if (password) {
      const { hash, salt } = hashPassword(password);
      await run("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, id]);
    }
    if (username) {
      await run("UPDATE users SET username = ? WHERE id = ?", [username, id]);
    }
    if (role) {
      await run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
    }
    if (license_number !== undefined) {
      await run("UPDATE users SET license_number = ? WHERE id = ?", [license_number, id]);
    }

    const updated = await get<any>("SELECT id, username, role, license_number, created_at, last_login FROM users WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 0c. SUPER-ADMIN LICENSEE ENDPOINTS
// ==========================================
app.get('/api/admin/licensees', requireAdmin, async (req, res) => {
  try {
    const licensees = await all<any>("SELECT * FROM licensees ORDER BY id ASC");
    res.json(licensees);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licensees', requireAdmin, async (req, res) => {
  try {
    const { license_number, company_name, licensee_name } = req.body;
    if (!license_number || !company_name) {
      return res.status(400).json({ error: 'License number and Company name are required' });
    }

    // Check duplicate
    const existing = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [license_number]);
    if (existing) {
      return res.status(400).json({ error: 'License number already registered' });
    }

    const finalLicenseeName = licensee_name || company_name;

    const result = await run(
      "INSERT INTO licensees (license_number, company_name, licensee_name) VALUES (?, ?, ?)",
      [license_number, company_name, finalLicenseeName]
    );

    let newLicensee = null;
    if (result.id) {
      newLicensee = await get<any>("SELECT * FROM licensees WHERE id = ?", [result.id]);
    }
    if (!newLicensee) {
      newLicensee = await get<any>("SELECT * FROM licensees WHERE license_number = ?", [license_number]);
    }
    res.status(201).json(newLicensee);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/licensees/:id', requireAdmin, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { company_name, licensee_name } = req.body;

    if (!company_name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const finalLicenseeName = licensee_name || company_name;

    await run(
      "UPDATE licensees SET company_name = ?, licensee_name = ? WHERE id = ?",
      [company_name, finalLicenseeName, id]
    );

    const updated = await get<any>("SELECT * FROM licensees WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/licensees/:id/logo', requireAdmin, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const logoData: unknown = req.body?.logo_data;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid licensee.' });
    }

    if (logoData !== null && typeof logoData !== 'string') {
      return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP image.' });
    }

    if (typeof logoData === 'string') {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logoData);
      if (!match || logoData.length > 350_000 || match[2].length % 4 !== 0) {
        return res.status(400).json({ error: 'Logo must be a PNG, JPEG, or WebP image no larger than 256 KB.' });
      }
      const bytes = Buffer.from(match[2], 'base64');
      const mime = match[1];
      const isPng = mime === 'png' && bytes.length >= 8
        && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = mime === 'jpeg' && bytes.length >= 3
        && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isWebp = mime === 'webp' && bytes.length >= 12
        && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (bytes.length > 256 * 1024 || (!isPng && !isJpeg && !isWebp)) {
        return res.status(400).json({ error: 'The selected file is not a valid PNG, JPEG, or WebP image under 256 KB.' });
      }
    }

    const result = await run('UPDATE licensees SET logo_data = ? WHERE id = ?', [logoData, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Licensee not found.' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Unable to update licensee logo:', err);
    res.status(500).json({ error: 'Unable to update the licensee logo.' });
  }
});

app.delete('/api/admin/licensees/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await run("DELETE FROM licensees WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);

    // Prevent deleting yourself
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Ensure at least one admin remains
    const adminCount = await get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    const targetUser = await get<User>("SELECT * FROM users WHERE id = ?", [id]);
    if (targetUser?.role === 'admin' && adminCount && adminCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin account' });
    }

    // Delete sessions first
    await run("DELETE FROM sessions WHERE user_id = ?", [id]);
    await run("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/change-password', async (req: any, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const user = await get<User>("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = verifyPassword(current_password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const { hash, salt } = hashPassword(new_password);
    await run("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [hash, salt, req.user.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SECURE BACKUP ENDPOINT
// ==========================================
app.post('/api/backup', async (req: any, res) => {
  try {
    const { securityKey } = req.body;
    if (!securityKey || securityKey.length < 6) {
      return res.status(400).json({ error: 'Security key must be at least 6 characters long' });
    }

    // Export data from all tenant tables
    const data = {
      timestamp: new Date().toISOString(),
      license_number: req.user.license_number,
      settings: await all("SELECT * FROM settings"),
      customers: await all("SELECT * FROM customers"),
      suppliers: await all("SELECT * FROM suppliers"),
      items: await all("SELECT * FROM items"),
      invoices: await all("SELECT * FROM invoices"),
      invoice_items: await all("SELECT * FROM invoice_items"),
      payments: await all("SELECT * FROM payments"),
      custom_sections: await all("SELECT * FROM custom_sections")
    };

    const jsonString = JSON.stringify(data);

    // Encrypt the JSON data using AES-256-CBC
    const algorithm = 'aes-256-cbc';
    const salt = 'smr-matrix-engine-salt-v1'; 
    const key = crypto.scryptSync(securityKey, salt, 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(jsonString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV to the encrypted text so it can be decrypted later
    const payload = iv.toString('hex') + ':' + encrypted;

    // Send as file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="smr_backup_${req.user.license_number}_${Date.now()}.enc"`);
    res.send(Buffer.from(payload, 'utf8'));

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. COMPANY SETTINGS ENDPOINTS
// ==========================================
app.get('/api/settings', async (req: any, res) => {
  try {
    let settings = await get<CompanySettings>("SELECT * FROM settings ORDER BY id DESC LIMIT 1");
    
    // Determine dynamic defaults based on logged-in user
    let defaultCompanyName = 'SMR Groups';
    let defaultState = 'Andhra Pradesh';
    let defaultStateCode = '37';
    let defaultAddress = 'Plot No. 45, Industrial Development Area, Visakhapatnam, Andhra Pradesh';
    let defaultPhone = '+91 8899889988';
    let defaultEmail = 'billing@smrgroups.com';
    let defaultGstin = '37AAAAASMRG1Z9';
    let defaultBank = 'State Bank of India';
    let defaultAccName = 'SMR GROUPS SOLUTIONS';
    let defaultAccNum = '30099887766';
    let defaultIfsc = 'SBIN0004562';
    let defaultBranch = 'Industrial Estate';

    const username = req.user?.username || '';
    const license = req.user?.license_number || '';

    if (license === 'LIC-TAMILNADU' || username === 'smrtamilnadu') {
      defaultCompanyName = 'SMR Groups Tamilnadu';
      defaultState = 'Tamil Nadu';
      defaultStateCode = '33';
      defaultAddress = 'No. 3, 4th Cross Street, Kalaivanar Nagar, MK Chavady, Vanur, Viluppuram District, Tamil Nadu - 605109';
      defaultPhone = '9786651063';
      defaultEmail = 'smrtamilnadu@gmail.com';
      defaultGstin = '33AYGPV7610M1ZZ';
      defaultBank = 'Indian Bank';
      defaultAccName = 'SMR GROUPS TAMILNADU';
      defaultAccNum = '50099887766';
      defaultIfsc = 'IDIB000C024';
      defaultBranch = 'Chennai Main';
    } else if (license === 'LIC-PONDY' || username === 'smrpondy') {
      defaultCompanyName = 'PS Robotix';
      defaultState = 'Puducherry';
      defaultStateCode = '34';
      defaultAddress = 'No.3, 4th Cross, Middle Street, Kalavanai Nagar, Jipmer Check Post, Puducherry - 605006';
      defaultPhone = '+91 6369278905';
      defaultEmail = 'Psrobotix@gmail.com';
      defaultGstin = '34AAAAASMRG1Z9';
      defaultBank = 'UCO Bank';
      defaultAccName = 'PS ROBOTIX';
      defaultAccNum = '10099887766';
      defaultIfsc = 'UCBA0001852';
      defaultBranch = 'Puducherry Main';
    } else if (license === 'LIC-SMRTRADING' || username === 'smrtrading' || username === 'SMR Trading and Company Pondy') {
      defaultCompanyName = 'SMR TRADING AND COMPANY';
      defaultState = 'Puducherry';
      defaultStateCode = '34';
      defaultAddress = 'No. 3, Mariyamman Koil Street, Kadirkamam, Puducherry - 605009';
      defaultPhone = '9786651063';
      defaultEmail = 'smrtrading@gmail.com';
      defaultGstin = '34AYGPV7610MIZX';
      defaultBank = 'UCO Bank';
      defaultAccName = 'SMR TRADING AND COMPANY';
      defaultAccNum = '10099887766';
      defaultIfsc = 'UCBA0001852';
      defaultBranch = 'Puducherry Main';
    }

    if (!settings) {
      // Table is empty, insert the correct defaults
      await run(`
        INSERT INTO settings (
          company_name, address, phone, email, gstin, state, state_code,
          bank_name, account_name, account_number, ifsc_code, branch, terms_conditions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        defaultCompanyName, defaultAddress, defaultPhone, defaultEmail, defaultGstin, defaultState, defaultStateCode,
        defaultBank, defaultAccName, defaultAccNum, defaultIfsc, defaultBranch, 'Standard terms apply.'
      ]);
      settings = await get<CompanySettings>("SELECT * FROM settings ORDER BY id DESC LIMIT 1");
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', async (req: any, res) => {
  try {
    const s = req.body as CompanySettings;
    await run(`
      UPDATE settings SET
        company_name = ?, address = ?, phone = ?, email = ?, gstin = ?, state = ?, state_code = ?,
        bank_name = ?, account_name = ?, account_number = ?, ifsc_code = ?, branch = ?, terms_conditions = ?,
        custom_print_layout = ?
      WHERE id = ?
    `, [
      s.company_name, s.address, s.phone, s.email, s.gstin, s.state, s.state_code,
      s.bank_name, s.account_name, s.account_number, s.ifsc_code, s.branch, s.terms_conditions,
      s.custom_print_layout || null,
      s.id
    ]);
    
    try {
      const username = req.user?.username || 'Unknown';
      const license = req.user?.license_number || 'Unknown';
      await runGlobal(`
        INSERT INTO notifications (tenant_name, username, action, details)
        VALUES (?, ?, ?, ?)
      `, [
        license, username, 'Settings Updated', `Company profile settings were updated.`
      ]);
    } catch (e) {
      console.error("Failed to insert notification", e);
    }

    const updated = await get<CompanySettings>("SELECT * FROM settings WHERE id = ?", [s.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ADMIN NOTIFICATIONS ENDPOINT
// ==========================================
app.get('/api/admin/notifications', async (req: any, res) => {
  try {
    if (req.user.license_number !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = await allGlobal<any>("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1b. CUSTOM SECTIONS ENDPOINTS
// ==========================================
app.get('/api/custom-sections', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM custom_sections ORDER BY created_at ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-sections', async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Section name is required' });
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await run(
      `INSERT INTO custom_sections (name, slug, icon, color) VALUES (?, ?, ?, ?)`,
      [name.trim(), slug, icon || 'FileText', color || '#6366f1']
    );
    const created = await get<any>("SELECT * FROM custom_sections WHERE slug = ?", [slug]);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'A section with that name already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custom-sections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await run("DELETE FROM custom_sections WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



// ==========================================
// 2. CUSTOMERS ENDPOINTS
// ==========================================
app.get('/api/customers', async (req, res) => {
  try {
    const rows = await all<Customer>("SELECT * FROM customers WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const c = req.body as Customer;
    
    const existingArchived = await get<Customer>("SELECT * FROM customers WHERE name = ? AND is_deleted = 1", [c.name]);
    if (existingArchived) {
      await run(`
        UPDATE customers SET
          address = ?, phone = ?, email = ?, state = ?, state_code = ?, gstin = ?, opening_balance = ?, outstanding_balance = ?, is_deleted = 0
        WHERE id = ?
      `, [c.address, c.phone, c.email, c.state, c.state_code, c.gstin, c.opening_balance, c.opening_balance, existingArchived.id]);
      const restoredCust = await get<Customer>("SELECT * FROM customers WHERE id = ?", [existingArchived.id]);
      return res.status(201).json(restoredCust);
    }

    const result = await run(`
      INSERT INTO customers (name, address, phone, email, state, state_code, gstin, opening_balance, outstanding_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [c.name, c.address, c.phone, c.email, c.state, c.state_code, c.gstin, c.opening_balance, c.opening_balance]);
    const newCust = await get<Customer>("SELECT * FROM customers WHERE id = ?", [result.id]);
    res.status(201).json(newCust);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const c = req.body as Customer;
    await run(`
      UPDATE customers SET
        name = ?, address = ?, phone = ?, email = ?, state = ?, state_code = ?, gstin = ?, opening_balance = ?
      WHERE id = ?
    `, [c.name, c.address, c.phone, c.email, c.state, c.state_code, c.gstin, c.opening_balance, id]);
    
    // Recalculate outstanding balance based on invoices and payments
    const invSum = await get<{ total: number }>("SELECT SUM(grand_total) as total FROM invoices WHERE party_id = ? AND invoice_type = 'sales'", [id]);
    const paySum = await get<{ total: number }>("SELECT SUM(amount) as total FROM payments WHERE party_id = ? AND type = 'receipt'", [id]);
    const totalInvoiced = invSum?.total || 0;
    const totalPaid = paySum?.total || 0;
    const outstanding = c.opening_balance + totalInvoiced - totalPaid;
    await run("UPDATE customers SET outstanding_balance = ? WHERE id = ?", [outstanding, id]);

    const updated = await get<Customer>("SELECT * FROM customers WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Check if customer has invoices
    const hasInvoices = await get<{ count: number }>("SELECT COUNT(*) as count FROM invoices WHERE party_id = ? AND invoice_type = 'sales'", [id]);
    if (hasInvoices && hasInvoices.count > 0) {
      await run("UPDATE customers SET is_deleted = 1 WHERE id = ?", [id]);
      return res.json({ success: true, archived: true, message: "Customer archived. Retained for past invoice history." });
    }
    await run("DELETE FROM customers WHERE id = ?", [id]);
    res.json({ success: true, archived: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. SUPPLIERS ENDPOINTS
// ==========================================
app.get('/api/suppliers', async (req, res) => {
  try {
    const rows = await all<Supplier>("SELECT * FROM suppliers WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const s = req.body as Supplier;
    
    const existingArchived = await get<Supplier>("SELECT * FROM suppliers WHERE name = ? AND is_deleted = 1", [s.name]);
    if (existingArchived) {
      await run(`
        UPDATE suppliers SET
          address = ?, phone = ?, email = ?, state = ?, state_code = ?, gstin = ?, opening_balance = ?, outstanding_balance = ?, is_deleted = 0
        WHERE id = ?
      `, [s.address, s.phone, s.email, s.state, s.state_code, s.gstin, s.opening_balance, s.opening_balance, existingArchived.id]);
      const restoredSupp = await get<Supplier>("SELECT * FROM suppliers WHERE id = ?", [existingArchived.id]);
      return res.status(201).json(restoredSupp);
    }

    const result = await run(`
      INSERT INTO suppliers (name, address, phone, email, state, state_code, gstin, opening_balance, outstanding_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [s.name, s.address, s.phone, s.email, s.state, s.state_code, s.gstin, s.opening_balance, s.opening_balance]);
    const newSupp = await get<Supplier>("SELECT * FROM suppliers WHERE id = ?", [result.id]);
    res.status(201).json(newSupp);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const s = req.body as Supplier;
    await run(`
      UPDATE suppliers SET
        name = ?, address = ?, phone = ?, email = ?, state = ?, state_code = ?, gstin = ?, opening_balance = ?
      WHERE id = ?
    `, [s.name, s.address, s.phone, s.email, s.state, s.state_code, s.gstin, s.opening_balance, id]);

    // Recalculate outstanding balance based on purchases and vendor payments
    const invSum = await get<{ total: number }>("SELECT SUM(grand_total) as total FROM invoices WHERE party_id = ? AND invoice_type = 'purchase'", [id]);
    const paySum = await get<{ total: number }>("SELECT SUM(amount) as total FROM payments WHERE party_id = ? AND type = 'payment'", [id]);
    const totalPurchased = invSum?.total || 0;
    const totalPaid = paySum?.total || 0;
    const outstanding = s.opening_balance + totalPurchased - totalPaid;
    await run("UPDATE suppliers SET outstanding_balance = ? WHERE id = ?", [outstanding, id]);

    const updated = await get<Supplier>("SELECT * FROM suppliers WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Check if supplier has purchase bills
    const hasInvoices = await get<{ count: number }>("SELECT COUNT(*) as count FROM invoices WHERE party_id = ? AND invoice_type = 'purchase'", [id]);
    if (hasInvoices && hasInvoices.count > 0) {
      await run("UPDATE suppliers SET is_deleted = 1 WHERE id = ?", [id]);
      return res.json({ success: true, archived: true, message: "Supplier archived. Retained for past purchase history." });
    }
    await run("DELETE FROM suppliers WHERE id = ?", [id]);
    res.json({ success: true, archived: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-import/:kind', async (req, res) => {
  const table = req.params.kind === 'customers'
    ? 'customers'
    : req.params.kind === 'suppliers'
      ? 'suppliers'
      : null;
  if (!table) return res.status(404).json({ error: 'Unknown party type.' });

  const records: unknown = req.body?.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > 100) {
    return res.status(400).json({ error: 'Provide between 1 and 100 records per import.' });
  }

  const normalizedRecords: Array<{
    name: string;
    address: string;
    phone: string;
    email: string;
    state: string;
    state_code: string;
    gstin: string;
    opening_balance: number;
  }> = [];
  const rowErrors: string[] = [];

  records.forEach((record: unknown, index: number) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      rowErrors.push(`Row ${index + 1}: record must be an object.`);
      return;
    }
    const values = record as Record<string, unknown>;
    const text = (field: string, fallback = '', maxLength = 1000): string | null => {
      const value = values[field] ?? fallback;
      if (typeof value !== 'string' || value.length > maxLength) return null;
      return value.trim();
    };
    const name = text('name', '', 200);
    const address = text('address');
    const phone = text('phone', '', 50);
    const email = text('email', '', 254);
    const state = text('state', 'Andhra Pradesh', 100);
    const stateCode = text('state_code', '37', 20);
    const gstin = text('gstin', '', 15)?.toUpperCase() ?? null;
    const openingBalance = values.opening_balance;

    if (
      name === null || !name || address === null || phone === null || email === null || state === null || stateCode === null ||
      gstin === null || !name.trim() ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      (gstin && !/^[A-Z0-9]{15}$/.test(gstin)) ||
      typeof openingBalance !== 'number' || !Number.isFinite(openingBalance) ||
      Math.abs(openingBalance) > 1_000_000_000_000
    ) {
      rowErrors.push(`Row ${index + 1}: invalid or oversized party details.`);
      return;
    }

    normalizedRecords.push({
      name,
      address,
      phone,
      email,
      state,
      state_code: stateCode,
      gstin,
      opening_balance: openingBalance,
    });
  });

  if (rowErrors.length > 0) return res.status(400).json({ error: 'Some records are invalid.', details: rowErrors });

  try {
    const existing = await all<{ name: string }>(`SELECT name FROM ${table}`);
    const knownNames = new Set(existing.map(item => item.name.trim().toLocaleLowerCase()));
    const importable = normalizedRecords.filter(record => {
      const normalizedName = record.name.toLocaleLowerCase();
      if (knownNames.has(normalizedName)) return false;
      knownNames.add(normalizedName);
      return true;
    });

    if (importable.length > 0) {
      const values = importable.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params = importable.flatMap(record => [
        record.name,
        record.address,
        record.phone,
        record.email,
        record.state,
        record.state_code,
        record.gstin,
        record.opening_balance,
        record.opening_balance,
      ]);
      await run(`
        INSERT INTO ${table} (name, address, phone, email, state, state_code, gstin, opening_balance, outstanding_balance)
        VALUES ${values}
      `, params);
    }

    res.status(201).json({
      importedCount: importable.length,
      skippedCount: normalizedRecords.length - importable.length,
    });
  } catch (err) {
    console.error('Party import failed:', err);
    res.status(500).json({ error: 'Failed to import records. No records from this batch were saved.' });
  }
});

// ==========================================
// 3b. ADDITIONAL MASTER ENTITIES (Item Groups, Sales Execs, Staff, Expenses Groups)
// ==========================================

// Item Groups
app.get('/api/item-groups', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM item_groups ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/item-groups', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await run("INSERT INTO item_groups (name, description) VALUES (?, ?)", [name, description]);
    const created = await get<any>("SELECT * FROM item_groups WHERE id = ?", [result.id]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/item-groups/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    await run("UPDATE item_groups SET name = ?, description = ? WHERE id = ?", [name, description, req.params.id]);
    res.json(await get<any>("SELECT * FROM item_groups WHERE id = ?", [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/item-groups/:id', async (req, res) => {
  try {
    await run("DELETE FROM item_groups WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sales Executives
app.get('/api/sales-executives', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM sales_executives ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/sales-executives', async (req, res) => {
  try {
    const { name, phone, email, region, commission_pct } = req.body;
    const result = await run("INSERT INTO sales_executives (name, phone, email, region, commission_pct) VALUES (?, ?, ?, ?, ?)", [name, phone, email, region, commission_pct]);
    res.status(201).json(await get<any>("SELECT * FROM sales_executives WHERE id = ?", [result.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/sales-executives/:id', async (req, res) => {
  try {
    const { name, phone, email, region, commission_pct } = req.body;
    await run("UPDATE sales_executives SET name = ?, phone = ?, email = ?, region = ?, commission_pct = ? WHERE id = ?", [name, phone, email, region, commission_pct, req.params.id]);
    res.json(await get<any>("SELECT * FROM sales_executives WHERE id = ?", [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/sales-executives/:id', async (req, res) => {
  try {
    await run("DELETE FROM sales_executives WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Company Staff
app.get('/api/company-staff', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM company_staff ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/company-staff', async (req, res) => {
  try {
    const { name, role, phone, email, basic_salary } = req.body;
    const result = await run("INSERT INTO company_staff (name, role, phone, email, basic_salary) VALUES (?, ?, ?, ?, ?)", [name, role, phone, email, basic_salary]);
    res.status(201).json(await get<any>("SELECT * FROM company_staff WHERE id = ?", [result.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/company-staff/:id', async (req, res) => {
  try {
    const { name, role, phone, email, basic_salary } = req.body;
    await run("UPDATE company_staff SET name = ?, role = ?, phone = ?, email = ?, basic_salary = ? WHERE id = ?", [name, role, phone, email, basic_salary, req.params.id]);
    res.json(await get<any>("SELECT * FROM company_staff WHERE id = ?", [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/company-staff/:id', async (req, res) => {
  try {
    await run("DELETE FROM company_staff WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Expenses Groups
app.get('/api/expenses-groups', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM expenses_groups ORDER BY name ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/expenses-groups', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await run("INSERT INTO expenses_groups (name, description) VALUES (?, ?)", [name, description]);
    res.status(201).json(await get<any>("SELECT * FROM expenses_groups WHERE id = ?", [result.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/expenses-groups/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    await run("UPDATE expenses_groups SET name = ?, description = ? WHERE id = ?", [name, description, req.params.id]);
    res.json(await get<any>("SELECT * FROM expenses_groups WHERE id = ?", [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/expenses-groups/:id', async (req, res) => {
  try {
    await run("DELETE FROM expenses_groups WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Expenses
app.get('/api/daily-expenses', async (req, res) => {
  try {
    const rows = await all<any>("SELECT * FROM daily_expenses ORDER BY ref_no ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-expenses', async (req, res) => {
  try {
    const { ref_no, ref_date, expenses_group, amount, narration } = req.body;
    const result = await run(
      "INSERT INTO daily_expenses (ref_no, ref_date, expenses_group, amount, narration) VALUES (?, ?, ?, ?, ?)",
      [ref_no, ref_date, expenses_group, amount, narration]
    );
    res.status(201).json(await get<any>("SELECT * FROM daily_expenses WHERE id = ?", [result.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/daily-expenses/:id', async (req, res) => {
  try {
    const { ref_no, ref_date, expenses_group, amount, narration } = req.body;
    await run(
      "UPDATE daily_expenses SET ref_no = ?, ref_date = ?, expenses_group = ?, amount = ?, narration = ? WHERE id = ?",
      [ref_no, ref_date, expenses_group, amount, narration, req.params.id]
    );
    res.json(await get<any>("SELECT * FROM daily_expenses WHERE id = ?", [req.params.id]));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/daily-expenses/:id', async (req, res) => {
  try {
    await run("DELETE FROM daily_expenses WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mock GST Lookup
app.get('/api/gst-lookup/:gstin', async (req, res) => {
  try {
    const gstin = req.params.gstin;
    // For demonstration, return simulated company details based on the GSTIN.
    // In production, you would call a real API (like ClearTax, Razorpay, or API Setu) here.
    if (gstin.length !== 15) {
      return res.status(400).json({ error: "Invalid GSTIN length" });
    }
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    res.json({
      gstin: gstin,
      company_name: "Mock Company for " + gstin,
      address: "123 Mock Street, Mock City",
      state: "Tamil Nadu",
      state_code: "33",
      pan: gstin.substring(2, 12)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ITEMS (WEG MOTORS) ENDPOINTS
// ==========================================
app.get('/api/items', async (req, res) => {
  try {
    const rows = await all<Item>("SELECT * FROM items WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY code ASC");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const i = req.body as Item;
    
    const existingArchived = await get<Item>("SELECT * FROM items WHERE code = ?", [i.code]);
    if (existingArchived && existingArchived.is_deleted === 1) {
      await run(`
        UPDATE items SET
          name = ?, brand = ?, description = ?, hp = ?, rpm = ?, poles = ?, phase = ?, frame = ?, volts = ?,
          purchase_price = ?, sales_price = ?, stock_qty = ?, low_stock_threshold = ?, gst_rate = ?, type = ?, is_deleted = 0
        WHERE id = ?
      `, [i.name, i.brand, i.description, i.hp, i.rpm, i.poles, i.phase, i.frame, i.volts, i.purchase_price, i.sales_price, i.stock_qty, i.low_stock_threshold, i.gst_rate, i.type || 'motor', existingArchived.id]);
      const restoredItem = await get<Item>("SELECT * FROM items WHERE id = ?", [existingArchived.id]);
      return res.status(201).json(restoredItem);
    }

    const result = await run(`
      INSERT INTO items (code, name, brand, description, hp, rpm, poles, phase, frame, volts, purchase_price, sales_price, stock_qty, low_stock_threshold, gst_rate, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [i.code, i.name, i.brand, i.description, i.hp, i.rpm, i.poles, i.phase, i.frame, i.volts, i.purchase_price, i.sales_price, i.stock_qty, i.low_stock_threshold, i.gst_rate, i.type || 'motor']);
    const newItem = await get<Item>("SELECT * FROM items WHERE id = ?", [result.id]);
    res.status(201).json(newItem);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const i = req.body as Item;
    await run(`
      UPDATE items SET
        code = ?, name = ?, brand = ?, description = ?, hp = ?, rpm = ?, poles = ?, phase = ?, frame = ?, volts = ?,
        purchase_price = ?, sales_price = ?, stock_qty = ?, low_stock_threshold = ?, gst_rate = ?, type = ?
      WHERE id = ?
    `, [i.code, i.name, i.brand, i.description, i.hp, i.rpm, i.poles, i.phase, i.frame, i.volts, i.purchase_price, i.sales_price, i.stock_qty, i.low_stock_threshold, i.gst_rate, i.type || 'motor', id]);
    const updated = await get<Item>("SELECT * FROM items WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Check if referenced in invoice_items
    const hasItems = await get<{ count: number }>("SELECT COUNT(*) as count FROM invoice_items WHERE item_id = ?", [id]);
    if (hasItems && hasItems.count > 0) {
      // Soft delete: mark as deleted so invoices retain history but product is hidden
      await run("UPDATE items SET is_deleted = 1 WHERE id = ?", [id]);
      res.json({ success: true, archived: true, message: "Product archived. It is retained for past invoice history but removed from active listings." });
    } else {
      // Safe to hard delete — no invoice references
      await run("DELETE FROM items WHERE id = ?", [id]);
      res.json({ success: true, archived: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// ==========================================
// 4b. STOCK TRANSACTIONS (ENTRY, RECEIPT, ISSUE) ENDPOINTS
// ==========================================
app.get('/api/stock-transactions', async (req, res) => {
  try {
    const type = req.query.type as string;
    const itemId = req.query.item_id as string;
    let query = `
      SELECT st.*,
             i.name as item_name, i.code as item_code, i.hp, i.rpm, i.frame,
             COALESCE(c.name, s.name) as party_name
      FROM stock_transactions st
      LEFT JOIN items i ON st.item_id = i.id
      LEFT JOIN customers c ON st.party_type = 'customer' AND st.party_id = c.id
      LEFT JOIN suppliers s ON st.party_type = 'supplier' AND st.party_id = s.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];
    if (type) { conditions.push('st.type = ?'); params.push(type); }
    if (itemId) { conditions.push('st.item_id = ?'); params.push(itemId); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY st.date DESC, st.id DESC';
    const rows = await all<any>(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock-transactions', async (req, res) => {
  try {
    const { item_id, type, quantity, date, reference_number, party_id, party_type, notes } = req.body;
    if (!item_id || !type || !quantity || !date) {
      return res.status(400).json({ error: 'item_id, type, quantity, and date are required' });
    }
    if (!['entry', 'receipt', 'issue'].includes(type)) {
      return res.status(400).json({ error: 'type must be entry, receipt, or issue' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number' });
    }

    // Validate item exists
    const item = await get<any>('SELECT * FROM items WHERE id = ?', [item_id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // For issue: validate sufficient stock
    if (type === 'issue') {
      if (item.stock_qty < qty) {
        return res.status(400).json({ error: `Insufficient stock. Available: ${item.stock_qty}, Requested: ${qty}` });
      }
    }

    // Insert transaction
    const result = await run(
      `INSERT INTO stock_transactions (item_id, type, quantity, date, reference_number, party_id, party_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item_id, type, qty, date, reference_number || null, party_id || null, party_type || null, notes || null]
    );

    // Update items.stock_qty
    const delta = type === 'issue' ? -qty : qty;
    await run('UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?', [delta, item_id]);

    const created = await get<any>('SELECT * FROM stock_transactions WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stock-transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const txn = await get<any>('SELECT * FROM stock_transactions WHERE id = ?', [id]);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    // Reverse the stock qty change
    const reverseDelta = txn.type === 'issue' ? txn.quantity : -txn.quantity;
    await run('UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?', [reverseDelta, txn.item_id]);

    // Delete the transaction
    await run('DELETE FROM stock_transactions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. INVOICES (SALES, PURCHASE, QUOTATION) ENDPOINTS
// ==========================================
app.get('/api/invoices', async (req, res) => {
  try {
    const type = req.query.type as string; // sales, purchase, quotation
    const slug = req.query.slug as string; // custom section slug
    let query = `
      SELECT inv.*, 
             COALESCE(c.name, s.name) as party_name,
             COALESCE(c.gstin, s.gstin) as party_gstin
      FROM invoices inv
      LEFT JOIN customers c ON inv.party_id = c.id AND inv.invoice_type != 'purchase'
      LEFT JOIN suppliers s ON inv.party_id = s.id AND inv.invoice_type = 'purchase'
    `;
    const params: any[] = [];
    if (slug) {
      query += ` WHERE inv.custom_section_slug = ?`;
      params.push(slug);
    } else if (type) {
      query += ` WHERE inv.invoice_type = ? AND (inv.custom_section_slug IS NULL OR inv.custom_section_slug = '')`;
      params.push(type);
    }
    query += ` ORDER BY inv.date DESC, inv.id DESC`;
    const rows = await all<any>(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/invoices/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const invoice = await get<any>(`
      SELECT inv.*, 
             COALESCE(c.name, s.name) as party_name,
             COALESCE(c.gstin, s.gstin) as party_gstin,
             COALESCE(c.address, s.address) as party_address,
             COALESCE(c.state, s.state) as party_state,
             COALESCE(c.state_code, s.state_code) as party_state_code
      FROM invoices inv
      LEFT JOIN customers c ON inv.party_id = c.id AND inv.invoice_type != 'purchase'
      LEFT JOIN suppliers s ON inv.party_id = s.id AND inv.invoice_type = 'purchase'
      WHERE inv.id = ?
    `, [id]);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const items = await all<InvoiceItem>("SELECT * FROM invoice_items WHERE invoice_id = ?", [id]);
    invoice.items = items;
    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const inv = req.body as Invoice;
    const items = inv.items || [];

    if (!inv.invoice_number || !inv.invoice_type || !inv.party_id || !inv.date) {
      return res.status(400).json({ error: "Missing required invoice fields" });
    }

    // 1. Insert Invoice parent record
    const result = await run(`
      INSERT INTO invoices (
        invoice_number, invoice_type, party_id, date, due_date,
        subtotal, discount, cgst, sgst, igst, tax_amount, round_off, grand_total,
        paid_amount, balance_amount, payment_status, notes, is_converted, custom_section_slug
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      inv.invoice_number, inv.invoice_type, inv.party_id, inv.date, inv.due_date || inv.date,
      inv.subtotal, inv.discount, inv.cgst, inv.sgst, inv.igst, inv.tax_amount, inv.round_off, inv.grand_total,
      inv.paid_amount || 0, inv.balance_amount, inv.payment_status || 'unpaid', inv.notes, inv.is_converted || 0,
      (inv as any).custom_section_slug || null
    ]);


    const invoiceId = result.id;

    // 2. Insert Invoice Items & Update Stock levels if not a Quotation
    for (const item of items) {
      await run(`
        INSERT INTO invoice_items (
          invoice_id, item_id, item_name, hp, rpm, poles, phase, frame,
          quantity, price, discount_pct, taxable_value, cgst_pct, cgst_amount, sgst_pct, sgst_amount, igst_pct, igst_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        invoiceId, item.item_id, item.item_name, item.hp, item.rpm, item.poles, item.phase, item.frame,
        item.quantity, item.price, item.discount_pct, item.taxable_value, 
        item.cgst_pct, item.cgst_amount, item.sgst_pct, item.sgst_amount, item.igst_pct, item.igst_amount, item.total_amount
      ]);

      // Stock adjustment trigger (sales reduces stock, purchase increases stock)
      if (inv.invoice_type === 'sales') {
        await run("UPDATE items SET stock_qty = stock_qty - ? WHERE id = ?", [item.quantity, item.item_id]);
      } else if (inv.invoice_type === 'purchase') {
        await run("UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?", [item.quantity, item.item_id]);
      }
    }

    // 3. Update Customer/Supplier balances & write a Payment if immediately paid some amount
    if (inv.invoice_type === 'sales') {
      await run("UPDATE customers SET outstanding_balance = outstanding_balance + ? WHERE id = ?", [inv.balance_amount, inv.party_id]);
      
      if (inv.paid_amount > 0) {
        const payNum = `REC/SAL/${invoiceId}`;
        await run(`
          INSERT INTO payments (payment_number, type, party_id, invoice_id, date, amount, mode, reference_number, notes)
          VALUES (?, 'receipt', ?, ?, ?, ?, 'bank', 'AUTO-INVOICE', 'Immediate payment recorded with sales invoice.')
        `, [payNum, inv.party_id, invoiceId, inv.date, inv.paid_amount]);
      }
    } else if (inv.invoice_type === 'purchase') {
      await run("UPDATE suppliers SET outstanding_balance = outstanding_balance + ? WHERE id = ?", [inv.balance_amount, inv.party_id]);
      
      if (inv.paid_amount > 0) {
        const payNum = `PAY/PUR/${invoiceId}`;
        await run(`
          INSERT INTO payments (payment_number, type, party_id, invoice_id, date, amount, mode, reference_number, notes)
          VALUES (?, 'payment', ?, ?, ?, ?, 'bank', 'AUTO-INVOICE', 'Immediate payment recorded with purchase bill.')
        `, [payNum, inv.party_id, invoiceId, inv.date, inv.paid_amount]);
      }
    }

    // If converting quotation to sales invoice, mark the original quotation
    if (inv.invoice_type === 'sales' && req.body.converted_from_quotation_id) {
      await run("UPDATE invoices SET is_converted = 1 WHERE id = ?", [req.body.converted_from_quotation_id]);
    }

    const created = await get<any>("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    created.items = await all<InvoiceItem>("SELECT * FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. PAYMENTS ENDPOINTS
// ==========================================
app.get('/api/payments', async (req, res) => {
  try {
    const rows = await all<any>(`
      SELECT p.*,
             inv.invoice_number as invoice_number,
             COALESCE(c.name, s.name) as party_name
      FROM payments p
      LEFT JOIN invoices inv ON p.invoice_id = inv.id
      LEFT JOIN customers c ON p.party_id = c.id AND p.type = 'receipt'
      LEFT JOIN suppliers s ON p.party_id = s.id AND p.type = 'payment'
      ORDER BY p.date DESC, p.id DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const p = req.body as Payment;
    if (!p.payment_number || !p.type || !p.party_id || !p.amount || !p.date) {
      return res.status(400).json({ error: "Missing required payment fields" });
    }

    // 1. Insert Payment
    const result = await run(`
      INSERT INTO payments (payment_number, type, party_id, invoice_id, date, amount, mode, reference_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.payment_number, p.type, p.party_id, p.invoice_id || null, p.date, p.amount, p.mode, p.reference_number, p.notes]);

    const paymentId = result.id;

    // 2. Adjust invoice paid/balance fields
    if (p.invoice_id) {
      const inv = await get<Invoice>("SELECT * FROM invoices WHERE id = ?", [p.invoice_id]);
      if (inv) {
        const newPaid = inv.paid_amount + p.amount;
        const newBalance = Math.max(0, inv.grand_total - newPaid);
        const status = newBalance === 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
        
        await run(`
          UPDATE invoices SET
            paid_amount = ?, balance_amount = ?, payment_status = ?
          WHERE id = ?
        `, [newPaid, newBalance, status, p.invoice_id]);
      }
    }

    // 3. Adjust party outstanding balances
    if (p.type === 'receipt') {
      await run("UPDATE customers SET outstanding_balance = outstanding_balance - ? WHERE id = ?", [p.amount, p.party_id]);
    } else if (p.type === 'payment') {
      await run("UPDATE suppliers SET outstanding_balance = outstanding_balance - ? WHERE id = ?", [p.amount, p.party_id]);
    }

    const newPayment = await get<any>("SELECT * FROM payments WHERE id = ?", [paymentId]);
    res.status(201).json(newPayment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. FINANCIAL INTELLIGENCE & DASHBOARD ENDPOINTS
// ==========================================
app.get('/api/dashboard', async (req, res) => {
  try {
    // Totals
    const salesTotal = await get<{ total: number }>("SELECT SUM(grand_total) as total FROM invoices WHERE invoice_type = 'sales'");
    const purchaseTotal = await get<{ total: number }>("SELECT SUM(grand_total) as total FROM invoices WHERE invoice_type = 'purchase'");
    const recSum = await get<{ total: number }>("SELECT SUM(outstanding_balance) as total FROM customers");
    const paySum = await get<{ total: number }>("SELECT SUM(outstanding_balance) as total FROM suppliers");

    // Stock alerts
    const stockAlerts = await all<Item>("SELECT * FROM items WHERE stock_qty <= low_stock_threshold ORDER BY stock_qty ASC");

    // Unpaid invoices
    const unpaidInvoices = await all<any>(`
      SELECT inv.*, c.name as party_name 
      FROM invoices inv 
      JOIN customers c ON inv.party_id = c.id
      WHERE inv.invoice_type = 'sales' AND inv.payment_status != 'paid' 
      ORDER BY inv.due_date ASC LIMIT 5
    `);

    // Monthly trends (Last 6 Months)
    const monthlySales = await all<any>(`
      SELECT strftime('%Y-%m', date) as month, SUM(grand_total) as sales
      FROM invoices
      WHERE invoice_type = 'sales' AND date >= date('now', '-6 month')
      GROUP BY month ORDER BY month ASC
    `);

    const monthlyPurchases = await all<any>(`
      SELECT strftime('%Y-%m', date) as month, SUM(grand_total) as purchases
      FROM invoices
      WHERE invoice_type = 'purchase' AND date >= date('now', '-6 month')
      GROUP BY month ORDER BY month ASC
    `);

    res.json({
      sales: salesTotal?.total || 0,
      purchases: purchaseTotal?.total || 0,
      receivables: recSum?.total || 0,
      payables: paySum?.total || 0,
      stockAlerts,
      unpaidInvoices,
      trends: {
        sales: monthlySales,
        purchases: monthlyPurchases
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. REPORTS ENDPOINTS
// ==========================================
app.get('/api/reports/profit-loss', async (req, res) => {
  try {
    const fromDate = req.query.from as string || '1970-01-01';
    const toDate = req.query.to as string || '9999-12-31';

    const salesSum = await get<{ subtotal: number; discount: number; tax: number; grand: number }>(`
      SELECT SUM(subtotal) as subtotal, SUM(discount) as discount, SUM(tax_amount) as tax, SUM(grand_total) as grand
      FROM invoices WHERE invoice_type = 'sales' AND date BETWEEN ? AND ?
    `, [fromDate, toDate]);

    const purchaseSum = await get<{ subtotal: number; discount: number; tax: number; grand: number }>(`
      SELECT SUM(subtotal) as subtotal, SUM(discount) as discount, SUM(tax_amount) as tax, SUM(grand_total) as grand
      FROM invoices WHERE invoice_type = 'purchase' AND date BETWEEN ? AND ?
    `, [fromDate, toDate]);

    res.json({
      sales: salesSum || { subtotal: 0, discount: 0, tax: 0, grand: 0 },
      purchases: purchaseSum || { subtotal: 0, discount: 0, tax: 0, grand: 0 },
      net_profit: (salesSum?.subtotal || 0) - (purchaseSum?.subtotal || 0) - (salesSum?.discount || 0) + (purchaseSum?.discount || 0)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/ledger/:partyId', async (req, res) => {
  try {
    const partyId = req.params.partyId;
    const type = req.query.type as string; // customer, supplier
    const fromDate = req.query.from as string || '1970-01-01';
    const toDate = req.query.to as string || '9999-12-31';

    let party: any;
    let transactions: any[] = [];

    if (type === 'supplier') {
      party = await get<Supplier>("SELECT * FROM suppliers WHERE id = ?", [partyId]);
      if (!party) return res.status(404).json({ error: "Supplier not found" });

      const bills = await all<any>(`
        SELECT 'bill' as t_type, id, invoice_number as reference, date, grand_total as debit, 0 as credit
        FROM invoices WHERE party_id = ? AND invoice_type = 'purchase' AND date BETWEEN ? AND ?
      `, [partyId, fromDate, toDate]);

      const pays = await all<any>(`
        SELECT 'payment' as t_type, id, payment_number as reference, date, 0 as debit, amount as credit
        FROM payments WHERE party_id = ? AND type = 'payment' AND date BETWEEN ? AND ?
      `, [partyId, fromDate, toDate]);

      transactions = [...bills, ...pays].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      party = await get<Customer>("SELECT * FROM customers WHERE id = ?", [partyId]);
      if (!party) return res.status(404).json({ error: "Customer not found" });

      const sales = await all<any>(`
        SELECT 'invoice' as t_type, id, invoice_number as reference, date, grand_total as debit, 0 as credit
        FROM invoices WHERE party_id = ? AND invoice_type = 'sales' AND date BETWEEN ? AND ?
      `, [partyId, fromDate, toDate]);

      const receipts = await all<any>(`
        SELECT 'receipt' as t_type, id, payment_number as reference, date, 0 as debit, amount as credit
        FROM payments WHERE party_id = ? AND type = 'receipt' AND date BETWEEN ? AND ?
      `, [partyId, fromDate, toDate]);

      transactions = [...sales, ...receipts].sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json({ party, transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. GST REPORTS (GSTR-1, GSTR-2) ENDPOINTS
// ==========================================
app.get('/api/reports/gst', async (req, res) => {
  try {
    const fromDate = req.query.from as string || '1970-01-01';
    const toDate = req.query.to as string || '9999-12-31';

    // GSTR-1: Sales tax breakdown
    const gstr1 = await all<any>(`
      SELECT inv.invoice_number, inv.date, c.name as customer_name, c.gstin as customer_gstin,
             inv.subtotal as taxable_value, inv.cgst, inv.sgst, inv.igst, inv.grand_total
      FROM invoices inv
      JOIN customers c ON inv.party_id = c.id
      WHERE inv.invoice_type = 'sales' AND inv.date BETWEEN ? AND ?
      ORDER BY inv.date ASC
    `, [fromDate, toDate]);

    // GSTR-2: Purchase tax breakdown (ITC)
    const gstr2 = await all<any>(`
      SELECT inv.invoice_number, inv.date, s.name as supplier_name, s.gstin as supplier_gstin,
             inv.subtotal as taxable_value, inv.cgst, inv.sgst, inv.igst, inv.grand_total
      FROM invoices inv
      JOIN suppliers s ON inv.party_id = s.id
      WHERE inv.invoice_type = 'purchase' AND inv.date BETWEEN ? AND ?
      ORDER BY inv.date ASC
    `, [fromDate, toDate]);

    res.json({ gstr1, gstr2 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STATIC FRONTEND SERVING
// ==========================================
if (!process.env.VERCEL) {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));
  
  // Catch-all route to serve index.html for client-side routing
  app.get('*splat', (req, res, next) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    } else {
      next();
    }
  });
}

// ==========================================
// SERVER INITIALIZATION
// ==========================================

// Start the Express server; returns a promise that resolves with the http.Server
// once the DB is initialised and the server is listening.
export function startServer(port?: number | string, host?: string): Promise<import('http').Server> {
  const listenPort = Number(port ?? PORT);
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    return Promise.reject(new Error('Invalid local server port.'));
  }
  return initializeDatabase().then(() => {
    return new Promise<import('http').Server>((resolve, reject) => {
      const onListen = () => {
        if (process.env.ELECTRON !== '1') {
          const address = server.address();
          const port = address && typeof address !== 'string' ? address.port : listenPort;
          console.log(`PS-billing Server is running on port ${port}`);
        }
        resolve(server);
      };
      const server = host
        ? app.listen(listenPort, host, onListen)
        : app.listen(listenPort, onListen);
      server.once('error', reject);
    });
  });
}

if (process.env.ELECTRON) {
  // Running inside Electron — main.js will call startServer() explicitly
  console.log('Backend loaded by Electron. Waiting for startServer() call...');
} else if (!process.env.VERCEL) {
  // Standalone development server
  startServer().catch((err) => {
    console.error("Database initialization failed", err);
  });
} else {
  // Initialize DB asynchronously without blocking module export for Vercel
  initializeDatabase().catch(err => console.error("Database initialization failed", err));
}

export default app;
