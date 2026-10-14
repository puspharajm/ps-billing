const fs = require('fs');
const path = require('path');
const { rebuild } = require('@electron/rebuild');
const { build, Platform } = require('electron-builder');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const stagedDir = path.join(backendDir, '.electron-build');
const stagedModulesDir = path.join(stagedDir, 'node_modules');
const sourceModulesDir = path.join(backendDir, 'node_modules');
const electronVersion = require('electron/package.json').version;

async function buildDesktop() {
  fs.rmSync(stagedDir, { recursive: true, force: true });
  fs.mkdirSync(stagedDir, { recursive: true });
  fs.cpSync(sourceModulesDir, stagedModulesDir, { recursive: true });
  fs.copyFileSync(path.join(backendDir, 'package.json'), path.join(stagedDir, 'package.json'));

  await rebuild({
    buildPath: stagedDir,
    electronVersion,
    force: true,
    onlyModules: ['sqlite3'],
    projectRootPath: stagedDir,
  });

  await build({
    targets: Platform.WINDOWS.createTarget('nsis'),
    publish: 'never',
  });
}

buildDesktop().catch(error => {
  console.error('Desktop packaging failed:', error);
  process.exitCode = 1;
});
