/**
 * build.js
 * Copies all web assets into dist/ for Capacitor to bundle into the APK.
 * No bundler needed — the game uses vanilla ES6 modules.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Files and directories to copy into dist/
const ASSETS = [
    'index.html',
    'game.js',
    'gameState.js',
    'resources.js',
    'crafting.js',
    'automation.js',
    'events.js',
    'ui.js',
    'save.js',
    'audio.js',
    'effects.js',
    'trading.js',
    'exploration.js',
    'quests.js',
    'achievements.js',
    'population.js',
    'techtree.js',
    'factions.js',
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
