/**
 * techtree.js
 *
 * Canvas-based Tech Tree Visualization for Phase 6.
 *
 * Renders all game items as a node graph arranged in tier rows,
 * connected by dependency lines. Node state (crafted / available / locked)
 * is reflected via colour coding.
 */

import { gameState, getConfig } from './gameState.js';
import { getEffect } from './effects.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_NAMES = ['Survival', 'Settlement', 'Village', 'Town', 'Civilization'];

const TIER_COLORS = {
    Survival:     '#2ecc71',
    Settlement:   '#3498db',
    Village:      '#9b59b6',
    Town:         '#e67e22',
    Civilization: '#e74c3c'
};

/**
 * Upper bounds (exclusive) of the total resource cost that place an item in
 * each tier.  The last entry is Infinity so every item maps to a tier.
 */
const TIER_THRESHOLDS = [50, 100, 250, 500, Infinity];

// Layout constants
const NODE_WIDTH  = 110;
const NODE_HEIGHT = 36;
const TIER_GAP    = 80;
const NODE_GAP    = 12;
const PADDING     = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the tier name for an item based on its total resource cost.
 *
 * @param {Object} item - An item config object with a `requirements` property.
 * @returns {string} One of the TIER_NAMES values.
 */
function getItemTierName(item) {
    const totalCost = Object.values(item.requirements || {}).reduce((a, b) => a + b, 0);
    for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
        if (totalCost < TIER_THRESHOLDS[i]) return TIER_NAMES[i];
    }
    return TIER_NAMES[TIER_NAMES.length - 1];
}

/**
 * Polyfill ctx.roundRect for browsers that do not support it natively.
 * Modifies the canvas 2D context prototype in-place (idempotent).
 *
 * @param {CanvasRenderingContext2D} ctx
 */
function polyfillRoundRect(ctx) {
    if (typeof ctx.roundRect === 'function') return;

    ctx.roundRect = function roundRect(x, y, w, h, r) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y,     x + w, y + r,     r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x,     y + h, x,     y + h - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x,     y,     x + r, y,          r);
        this.closePath();
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the tech tree onto the canvas element identified by `canvasId`.
 * Safe to call repeatedly — each call redraws the whole canvas from scratch.
 *
 * @param {string} canvasId - The id attribute of a <canvas> element.
 */
export function renderTechTree(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config  = getConfig();
    const items   = config.items;
    const ctx     = canvas.getContext('2d');

    // Apply roundRect polyfill before any drawing
    polyfillRoundRect(ctx);

    // --- Group items by tier ---
    const tiers = {};
    TIER_NAMES.forEach(t => { tiers[t] = []; });
    items.forEach(item => {
        const tierName = getItemTierName(item);
        tiers[tierName].push(item);
    });

    // --- Size the canvas ---
    const maxPerTier  = Math.max(...Object.values(tiers).map(t => t.length));
    const canvasWidth = Math.max(800, maxPerTier * (NODE_WIDTH + NODE_GAP) + PADDING * 2);
    const canvasHeight = TIER_NAMES.length * (NODE_HEIGHT + TIER_GAP) + PADDING * 2;

    canvas.width  = canvasWidth;
    canvas.height = canvasHeight;

    // advancedTechUnlockRate — when > 0 item names are revealed even while locked
    const techUnlockRate = getEffect('advancedTechUnlockRate');

    // Map from item id -> centre/edge positions for connection drawing
    const nodePositions = {};

    // --- Pass 1: draw tier labels and item nodes ---
    TIER_NAMES.forEach((tierName, tierIdx) => {
        const tierItems = tiers[tierName];
        const y = PADDING + tierIdx * (NODE_HEIGHT + TIER_GAP);

        // Tier label
        ctx.fillStyle = TIER_COLORS[tierName];
        ctx.font      = 'bold 12px Orbitron, monospace';
        ctx.fillText(tierName, PADDING, y - 5);

        tierItems.forEach((item, itemIdx) => {
            const x = PADDING + itemIdx * (NODE_WIDTH + NODE_GAP);

            const isCrafted   = !!gameState.craftedItems[item.id];
            const isAvailable = !isCrafted && item.dependencies.every(d => !!gameState.craftedItems[d]);
            const isLocked    = !isCrafted && !isAvailable;

            // Determine visual style from state
            let fillColor, textColor, borderColor;
            if (isCrafted) {
                fillColor   = 'rgba(46, 204, 113, 0.3)';
                textColor   = '#2ecc71';
                borderColor = '#2ecc71';
            } else if (isAvailable) {
                fillColor   = 'rgba(0, 255, 255, 0.2)';
                textColor   = '#00ffff';
                borderColor = '#00ffff';
            } else {
                fillColor   = 'rgba(100, 100, 100, 0.2)';
                textColor   = '#666';
                borderColor = '#444';
            }

            // Draw rounded rectangle node
            ctx.fillStyle   = fillColor;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth   = 1.5;
            ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, 6);
            ctx.fill();
            ctx.stroke();

            // Item name — hide completely when locked and tech unlock rate is zero
            const showName    = !isLocked || techUnlockRate > 0;
            const rawName     = showName ? item.name : '???';
            const displayName = rawName.length > 14 ? rawName.substring(0, 12) + '..' : rawName;

            ctx.fillStyle = textColor;
            ctx.font      = '9px Orbitron, monospace';
            ctx.fillText(displayName, x + 5, y + 15);

            // Status sub-label
            ctx.font = '8px Orbitron, monospace';
            if (isCrafted) {
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('BUILT', x + 5, y + 28);
            } else if (isAvailable) {
                ctx.fillStyle = '#00ffff';
                ctx.fillText('AVAILABLE', x + 5, y + 28);
            } else {
                ctx.fillStyle = '#555';
                ctx.fillText('LOCKED', x + 5, y + 28);
            }

            // Store cardinal edge positions for connection drawing
            nodePositions[item.id] = {
                x:      x + NODE_WIDTH / 2,
                y:      y + NODE_HEIGHT / 2,
                top:    y,
                bottom: y + NODE_HEIGHT,
                left:   x,
                right:  x + NODE_WIDTH
            };
        });
    });

    // --- Pass 2: draw dependency lines between nodes ---
    ctx.lineWidth = 1;
    items.forEach(item => {
        const target = nodePositions[item.id];
        if (!target) return;

        item.dependencies.forEach(depId => {
            const source = nodePositions[depId];
            if (!source) return;

            const isCrafted  = !!gameState.craftedItems[item.id];
            const depCrafted = !!gameState.craftedItems[depId];

            ctx.strokeStyle = (isCrafted || depCrafted)
                ? 'rgba(46, 204, 113, 0.4)'
                : 'rgba(100, 100, 100, 0.3)';

            ctx.beginPath();
            ctx.moveTo(source.x, source.bottom);
            ctx.lineTo(target.x, target.top);
            ctx.stroke();
        });
    });
}

/**
 * Toggle the tech tree container's visibility and (re-)render on open.
 * Expects a #tech-tree-container div and #tech-tree-canvas canvas in the DOM.
 */
export function toggleTechTree() {
    const container = document.getElementById('tech-tree-container');
    if (!container) return;

    if (container.style.display === 'none' || container.style.display === '') {
        container.style.display = 'block';
        renderTechTree('tech-tree-canvas');
    } else {
        container.style.display = 'none';
    }
}
