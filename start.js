/**
 * SMR Groups Billing Software — Unified Launcher
 * 
 * Starts both the backend (Express/SQLite) and frontend (Vite/React) servers
 * from a single command: `node start.js`
 * 
 * Usage:
 *   node start.js          → Start both in development mode
 *   node start.js --build  → Build frontend for production
 */

const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npx.cmd' : 'npx';
const npmRunCmd = isWindows ? 'npm.cmd' : 'npm';

const BACKEND_DIR = path.join(__dirname, 'backend');
const FRONTEND_DIR = path.join(__dirname, 'frontend');

// ANSI color codes for console output
const COLORS = {
  RESET: '\x1b[0m',
  CYAN: '\x1b[36m',
  MAGENTA: '\x1b[35m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
};

function log(prefix, color, message) {
  const timestamp = new Date().toLocaleTimeString();
  process.stdout.write(`${COLORS.DIM}${timestamp}${COLORS.RESET} ${color}${COLORS.BOLD}[${prefix}]${COLORS.RESET} ${message}\n`);
}

function startProcess(name, command, args, cwd, color) {
  log(name, color, `Starting: ${command} ${args.join(' ')}`);
  
  const child = spawn(command, args, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) log(name, color, line);
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) log(name, color, `${COLORS.RED}${line}${COLORS.RESET}`);
    });
  });

  child.on('error', (err) => {
    log(name, COLORS.RED, `Failed to start: ${err.message}`);
  });

  child.on('exit', (code) => {
    log(name, color, `Process exited with code ${code}`);
  });

  return child;
}

// ==========================================
// MAIN LAUNCHER
// ==========================================

console.log(`
${COLORS.BOLD}${COLORS.GREEN}╔══════════════════════════════════════════════════╗
║       SMR Groups Billing Software                ║
║       Unified Development Server                 ║
╚══════════════════════════════════════════════════╝${COLORS.RESET}
`);

const isBuildMode = process.argv.includes('--build');

if (isBuildMode) {
  log('BUILD', COLORS.YELLOW, 'Building frontend for production...');
  const buildProcess = startProcess('BUILD', npmRunCmd, ['run', 'build'], FRONTEND_DIR, COLORS.YELLOW);
  buildProcess.on('exit', (code) => {
    if (code === 0) {
      log('BUILD', COLORS.GREEN, 'Frontend build completed successfully!');
    } else {
      log('BUILD', COLORS.RED, 'Frontend build failed!');
      process.exit(1);
    }
  });
} else {
  // Start Backend
  const backend = startProcess(
    'BACKEND',
    npmCmd,
    ['ts-node', 'src/index.ts'],
    BACKEND_DIR,
    COLORS.CYAN
  );

  // Start Frontend (small delay to let backend initialize first)
  setTimeout(() => {
    const frontend = startProcess(
      'FRONTEND',
      npmRunCmd,
      ['run', 'dev'],
      FRONTEND_DIR,
      COLORS.MAGENTA
    );

    // Graceful shutdown handler
    const cleanup = () => {
      log('SYSTEM', COLORS.YELLOW, 'Shutting down servers...');
      
      if (!backend.killed) {
        backend.kill('SIGTERM');
        log('BACKEND', COLORS.CYAN, 'Server stopped');
      }
      if (!frontend.killed) {
        frontend.kill('SIGTERM');
        log('FRONTEND', COLORS.MAGENTA, 'Server stopped');
      }

      setTimeout(() => {
        log('SYSTEM', COLORS.GREEN, 'All servers stopped. Goodbye!');
        process.exit(0);
      }, 1000);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Handle Windows Ctrl+C
    if (isWindows) {
      process.on('SIGHUP', cleanup);
    }
  }, 1500);
}
