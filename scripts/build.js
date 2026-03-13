/**
 * build.js
 * Bundles all ES6 modules into a single bundle.js via esbuild,
 * then copies web assets into dist/ for Capacitor to bundle into the APK.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Non-JS assets to copy (JS is handled by esbuild bundle)
const ASSETS = [
    'index.html',
    'knowledge_data.json',
    'assets',
];

function rmDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Clean and recreate dist/
rmDir(DIST);
fs.mkdirSync(DIST, { recursive: true });

// Bundle all ES6 modules into a single file
console.log('[build] Bundling JS modules with esbuild...');
execFileSync('npx', ['esbuild', 'game.js', '--bundle', '--outfile=dist/bundle.js', '--format=iife'], {
    cwd: ROOT,
    stdio: 'inherit',
});

// Copy non-JS assets
let copied = 0;
for (const asset of ASSETS) {
    const src = path.join(ROOT, asset);
    const dest = path.join(DIST, asset);
    if (fs.existsSync(src)) {
        copyRecursive(src, dest);
        copied++;
    } else {
        console.warn(`[build] Skipping missing asset: ${asset}`);
    }
}

console.log(`[build] Copied ${copied} assets to dist/`);
console.log('[build] Done.');
