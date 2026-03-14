/**
 * ui.js
 *
 * Complete UI rendering module for the post-apocalyptic survival game.
 * v2 — 7-tab layout with chain-based buildings, bottom nav, mobile More drawer.
 *
 * Reads from gameState and renders to the DOM. All display updates are driven
 * by the game loop calling updateDisplay() each tick, which only updates the
 * currently active tab for performance.
 *
 * Backward-compatible exports are provided for all functions imported by other modules.
 */

import { gameState, getConfig, getResourceCap, getTotalHousing, computeUnlockedResources, clearTabNotification } from './gameState.js';
import { getEffect, getTotalAssignedWorkers } from './effects.js';
import { getSettlementList, getCurrentSettlement, isSettlementUnlocked, isSupplyLinesUnlocked, getInfrastructureLevel, getTradeLevel, getTotalPopulation } from './settlements.js';
import { getSupplyLines } from './network.js';
import { isAlreadyBuilt } from './crafting.js';
import { getGatherInfo } from './resources.js';


// ─── Dirty-check helper ──────────────────────────────────────────────────────
//
// Prevents DOM thrashing by skipping teardown/rebuild when the data driving
// a section hasn't changed since the last render.  Each container caches a
// lightweight string fingerprint (_renderKey).  If the key matches, the
// rebuild is skipped entirely — zero DOM writes.

function _skipIfUnchanged(el, key) {
    if (!el) return true;
    if (el._renderKey === key) return true;
    el._renderKey = key;
    return false;
}


// ─── Tab Badge Rendering ─────────────────────────────────────────────────────

/**
 * Update all tab notification badges from gameState.tabNotifications.
 * Called every tick by updateDisplay() and on tab switch.
 */
function updateTabBadges() {
    const notifs = gameState.tabNotifications || {};
    document.querySelectorAll('.nav-badge[data-badge-tab]').forEach(badge => {
        const tab = badge.dataset.badgeTab;
        const count = notifs[tab] || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99' : String(count);
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    });
}


// ─── Effect Labels (for tooltip/building display) ─────────────────────────────

const EFFECT_LABELS = {
    foodProductionRate: 'Food production',
    waterProductionRate: 'Water production',
    stoneProductionRate: 'Stone production',
    oreProductionRate: 'Ore production',
    fruitProductionRate: 'Fruit production',
    clayProcessingRate: 'Clay processing',
    fiberProcessingRate: 'Fiber processing',
    oreProcessingRate: 'Ore processing',
    leatherProductionRate: 'Leather production',
    medicineProductionRate: 'Medicine production',
    clothProductionRate: 'Cloth production',
    glassProductionRate: 'Glass production',
    flourProductionRate: 'Flour production',
    textileProductionRate: 'Textile production',
    paperProductionRate: 'Paper production',
    tradeGoodsProductionRate: 'Trade goods',
    currencyProductionRate: 'Currency production',
    energyProductionRate: 'Energy production',
    bookProductionRate: 'Book production',
    woodGatheringMultiplier: 'Wood gathering',
    stoneGatheringMultiplier: 'Stone gathering',
    oreGatheringMultiplier: 'Ore gathering',
    foodGatheringMultiplier: 'Food gathering',
    meatGatheringMultiplier: 'Meat gathering',
    fishingEfficiencyMultiplier: 'Fishing efficiency',
    fishingSuccessRate: 'Fishing success',
    resourceConsumptionMultiplier: 'Resource consumption',
    storageCapacityMultiplier: 'Storage capacity',
    storageMultiplier: 'Storage multiplier',
    storageCapacity: 'Storage bonus',
    housingCapacity: 'Housing',
    defenseBonus: 'Defense',
    moraleBonus: 'Morale',
    craftingEfficiencyMultiplier: 'Crafting efficiency',
    researchSpeedMultiplier: 'Research speed',
    explorationSpeedMultiplier: 'Exploration speed',
    tradingEfficiencyMultiplier: 'Trading efficiency',
    populationGrowthMultiplier: 'Population growth',
    healingRate: 'Healing rate',
    entertainmentValue: 'Entertainment',
    knowledgePerStudy: 'Knowledge per study',
    maxPopulation: 'Max population',
    energyCapacity: 'Energy capacity'
};


// ─── Tab Management ────────────────────────────────────────────────────────────

let _moreDrawerOpen = false;

/**
 * Initialize tab navigation, More drawer, and category button listeners.
 * Called once after game start.
 */
export function initTabs() {
    // Wire up bottom nav buttons
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
            closeMoreDrawer();
        });
    });

    // Wire up drawer buttons
    document.querySelectorAll('.drawer-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
            closeMoreDrawer();
        });
    });

    // More button
    const moreBtn = document.getElementById('more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMoreDrawer();
        });
    }

    // Close more drawer when clicking outside
    document.addEventListener('click', (e) => {
        if (_moreDrawerOpen) {
            const drawer = document.getElementById('more-drawer');
            const moreButton = document.getElementById('more-btn');
            if (drawer && !drawer.contains(e.target) && moreButton && !moreButton.contains(e.target)) {
                closeMoreDrawer();
            }
        }
    });

    // Crafting category buttons
    document.querySelectorAll('.cat-btn[data-category]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateCraftingTab();
        });
    });
}

/**
 * Switch to a specific tab.
 * @param {string} tabName - Tab name matching data-tab attribute and tab-{name} panel ID.
 */
export function switchTab(tabName) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    // Show selected panel
    const panel = document.getElementById('tab-' + tabName);
    if (panel) panel.classList.add('active');

    // Highlight the active nav button (check both nav and drawer)
    const btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
    if (btn) btn.classList.add('active');

    // Clear notification badge for this tab
    clearTabNotification(tabName);
    updateTabBadges();

    // Reset pseudo-tabs when switching back to their parent tab
    if (tabName === 'settlement') {
        const worldView = document.getElementById('world-view');
        const campMain = document.getElementById('camp-main-content');
        if (worldView) worldView.style.display = 'none';
        if (campMain) campMain.style.display = '';
    }

    // Scroll to top of content when switching tabs
    const gc = document.getElementById('game-container');
    if (gc) gc.scrollTop = 0;
}

function toggleMoreDrawer() {
    const drawer = document.getElementById('more-drawer');
    if (!drawer) return;
    _moreDrawerOpen = !_moreDrawerOpen;
    drawer.classList.toggle('open', _moreDrawerOpen);
}

function closeMoreDrawer() {
    const drawer = document.getElementById('more-drawer');
    if (drawer) drawer.classList.remove('open');
    _moreDrawerOpen = false;
}


// ─── HUD Update ────────────────────────────────────────────────────────────────

/**
 * Update the always-visible HUD bar with current game state values.
 */
export function updateHUD() {
    // Day
    const dayEl = document.getElementById('day-display');
    if (dayEl) dayEl.textContent = 'Day ' + gameState.day;

    // Season (with emoji)
    const seasonEl = document.getElementById('season-display');
    if (seasonEl) {
        const season = gameState.currentSeason || 'Spring';
        const seasonEmojis = { spring: '\uD83C\uDF31', summer: '\u2600\uFE0F', autumn: '\uD83C\uDF42', winter: '\u2744\uFE0F' };
        const emoji = seasonEmojis[season] || '';
        seasonEl.textContent = emoji + ' ' + season.charAt(0).toUpperCase() + season.slice(1);
    }

    // Weather (with emoji)
    const weatherEl = document.getElementById('weather-display');
    if (weatherEl) {
        const weather = gameState.currentWeather || 'Clear';
        const weatherEmojis = {
            'Clear': '\u2600\uFE0F',
            'Cloudy': '\u2601\uFE0F',
            'Rain': '\uD83C\uDF27\uFE0F',
            'Storm': '\u26C8\uFE0F',
            'Snow': '\u2744\uFE0F',
            'Fog': '\uD83C\uDF2B\uFE0F',
            'Heatwave': '\uD83D\uDD25',
            'Drought': '\uD83C\uDFDC\uFE0F',
            'Wind': '\uD83D\uDCA8'
        };
        const emoji = weatherEmojis[weather] || '';
        weatherEl.textContent = emoji + ' ' + weather;
    }

    // Food bar
    const foodBar = document.getElementById('food-bar');
    const foodDisplay = document.getElementById('food-display');
    const foodCap = getResourceCap('food');
    if (foodBar) { foodBar.value = gameState.resources.food; foodBar.max = foodCap; }
    if (foodDisplay) foodDisplay.textContent = Math.floor(gameState.resources.food) + '/' + foodCap;

    // Water bar
    const waterBar = document.getElementById('water-bar');
    const waterDisplay = document.getElementById('water-display');
    const waterCap = getResourceCap('water');
    if (waterBar) { waterBar.value = gameState.resources.water; waterBar.max = waterCap; }
    if (waterDisplay) waterDisplay.textContent = Math.floor(gameState.resources.water) + '/' + waterCap;

    // Population
    const popEl = document.getElementById('population-display');
    const housing = getTotalHousing();
    if (popEl) popEl.textContent = 'Pop: ' + gameState.population + '/' + (housing || gameState.population);

    // Workers
    const workersEl = document.getElementById('workers-display');
    if (workersEl) workersEl.textContent = 'Workers: ' + gameState.availableWorkers;

    // Settlement
    const settlementEl = document.getElementById('settlement-display');
    if (settlementEl) settlementEl.textContent = gameState.settlementName + ' (' + capitalize(gameState.biome) + ')';

    // Knowledge
    const knowledgeEl = document.getElementById('knowledge-display');
    if (knowledgeEl) knowledgeEl.textContent = 'Knowledge: ' + gameState.knowledge;

    // Active events indicator
    const eventsEl = document.getElementById('active-events-indicator');
    if (eventsEl) {
        const count = gameState.activeEvents ? gameState.activeEvents.length : 0;
        eventsEl.textContent = count > 0 ? ('Events: ' + count) : '';
        eventsEl.style.color = count > 0 ? '#f39c12' : '';
    }
}


// ─── Settlement Tab ────────────────────────────────────────────────────────────

/**
 * Full update of the Settlement tab contents.
 */
export function updateSettlementTab() {
    updateAdvisor();
    updateCampStatus();
    updateBuiltBuildings();
    updateGatheringButtons();
}

// ─── Advisor ─────────────────────────────────────────────────────────────────

function getAdvisorTips() {
    let config;
    try { config = getConfig(); } catch { return []; }

    const tips = [];
    const blueprints = gameState.unlockedBlueprints || [];
    const buildings = gameState.buildings || {};
    const tools = gameState.tools || {};
    const knowledge = gameState.knowledge || 0;
    const food = gameState.resources?.food || 0;
    const water = gameState.resources?.water || 0;
    const pop = gameState.population || 1;

    const hasWorkbench = buildings.workbench && buildings.workbench.level > 0;
    const hasShelter = (buildings.shelter && buildings.shelter.level > 0)
        || (gameState.multipleBuildings?.shelter?.length > 0);
    const hasCuttingTools = tools.cutting_tools && tools.cutting_tools.level > 0;

    // ── Urgent warnings (always show) ──
    if (food < 15) tips.push({ cat: 'Survival', text: 'Food is running low. Gather food before your people starve.', urgent: true });
    if (water < 10) tips.push({ cat: 'Survival', text: 'Water is dangerously low. Find water immediately.', urgent: true });

    // ── Recommended next step (progression) ──
    if (blueprints.length === 0) {
        tips.push({ cat: 'Next Step', text: 'Open the Book and study to learn your first blueprint.' });
    } else if (!hasWorkbench) {
        if (blueprints.includes('crude_workbench')) {
            const wb = config.items?.find(i => i.id === 'crude_workbench');
            const cost = wb?.requirements || {};
            const canAfford = Object.entries(cost).every(([r, n]) => (gameState.resources[r] || 0) >= n);
            if (canAfford) {
                tips.push({ cat: 'Next Step', text: 'You have enough sticks. Build a Crude Workbench to start crafting.' });
            } else {
                const need = Object.entries(cost).filter(([r, n]) => (gameState.resources[r] || 0) < n)
                    .map(([r, n]) => (n - Math.floor(gameState.resources[r] || 0)) + ' more ' + r);
                tips.push({ cat: 'Next Step', text: 'Gather ' + need.join(' and ') + ' to build a workbench.' });
            }
        } else {
            tips.push({ cat: 'Next Step', text: 'Study the Book to learn how to build a workbench.' });
        }
    } else if (!hasCuttingTools) {
        const hasToolBlueprint = blueprints.some(b => {
            const it = config.items?.find(i => i.id === b);
            return it && it.chain === 'cutting_tools';
        });
        if (hasToolBlueprint) {
            tips.push({ cat: 'Next Step', text: 'Craft a cutting tool to unlock new resources like fiber and wood.' });
        } else {
            tips.push({ cat: 'Next Step', text: 'Study to discover how to make cutting tools.' });
        }
    } else if (!hasShelter) {
        const hasShelterBlueprint = blueprints.some(b => {
            const it = config.items?.find(i => i.id === b);
            return it && it.chain === 'shelter';
        });
        if (hasShelterBlueprint) {
            tips.push({ cat: 'Next Step', text: 'Build a shelter to reduce resource consumption and house more people.' });
        } else {
            tips.push({ cat: 'Next Step', text: 'Study to learn how to build shelter for your settlement.' });
        }
    }

    // ── Growth suggestions ──
    if (hasWorkbench && hasCuttingTools && hasShelter) {
        // Check for craftable upgrades the player hasn't built yet
        const unbuiltBlueprints = blueprints.filter(bId => {
            const item = config.items?.find(i => i.id === bId);
            if (!item) return false;
            const chain = item.chain;
            const chainConfig = config.chains?.[chain];
            if (!chainConfig) return false;
            if (chainConfig.type === 'SINGLE') {
                const stateKey = chain;
                if (buildings[stateKey]?.level >= item.level) return false;
                if (tools[stateKey]?.level >= item.level) return false;
            }
            return true;
        });
        if (unbuiltBlueprints.length > 0) {
            const next = config.items?.find(i => i.id === unbuiltBlueprints[0]);
            if (next) {
                tips.push({ cat: 'Growth', text: 'You have blueprints ready to craft. Try building a ' + next.name + '.' });
            }
        }

        // Suggest food production if population growing
        const hasFarm = (buildings.farming && buildings.farming.level > 0)
            || (gameState.multipleBuildings?.farming?.length > 0);
        if (pop >= 2 && !hasFarm) {
            tips.push({ cat: 'Growth', text: 'With ' + pop + ' mouths to feed, consider building a farm for steady food.' });
        }
    }

    // ── Knowledge ──
    // Study gate: tell the player what to gather before they can study again
    const gateProgress = gameState.studyGateProgress || {};
    const gateRemaining = Object.entries(gateProgress).filter(([, v]) => v > 0);
    if (gateRemaining.length > 0) {
        const needs = gateRemaining
            .map(([r, v]) => '<span style="color:#f1c40f;font-weight:600;">' + v + ' ' + r.charAt(0).toUpperCase() + r.slice(1) + '</span>')
            .join(' and ');
        tips.push({ cat: 'Knowledge', html: true, text: 'The Book wants you to put knowledge into practice \u2014 gather ' + needs + ' before your next study session.' });
    }

    const studyable = config.items?.filter(i =>
        i.chapter <= (gameState.currentChapter || 1) &&
        !blueprints.includes(i.id) &&
        (knowledge >= (i.knowledgeRequired || 0))
    );
    if (studyable && studyable.length > 0 && !tips.some(t => t.cat === 'Next Step' && t.text.includes('Study'))) {
        tips.push({ cat: 'Knowledge', text: 'The Book has more to teach. ' + studyable.length + ' blueprint' + (studyable.length > 1 ? 's' : '') + ' ready to discover.' });
    }

    // ── Quest hint ──
    const quests = gameState.activeQuests || [];
    if (quests.length > 0) {
        tips.push({ cat: 'Quest', text: quests[0].name + ' \u2014 ' + (quests[0].description || '') });
    }

    // ── Fallback ──
    if (tips.length === 0) {
        tips.push({ cat: 'Advisor', text: 'Your settlement is thriving. Explore, study, and keep expanding.' });
    }

    return tips;
}

function updateAdvisor() {
    const container = document.getElementById('goal-content');
    if (!container) return;

    const tips = getAdvisorTips();
    const key = tips.map(t => t.cat + t.text + (t.urgent || '')).join('|');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'font-size:0.65em; color:#e2b714; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px;';
    header.textContent = 'Advisor';
    container.appendChild(header);

    // Show up to 4 tips
    const shown = tips.slice(0, 4);
    for (let i = 0; i < shown.length; i++) {
        const tip = shown[i];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; padding:5px 0;'
            + (i < shown.length - 1 ? ' border-bottom:1px solid rgba(255,255,255,0.05);' : '');

        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.65em; padding:2px 8px; border-radius:3px; white-space:nowrap; margin-top:2px; flex-shrink:0; font-weight:500; background:'
            + (tip.urgent ? 'rgba(231,76,60,0.25); color:#ff6b6b;'
            : tip.cat === 'Next Step' ? 'rgba(0,255,255,0.15); color:#33ffdd;'
            : tip.cat === 'Growth' ? 'rgba(46,204,113,0.15); color:#5dde9e;'
            : tip.cat === 'Knowledge' ? 'rgba(155,89,182,0.2); color:#cc99ff;'
            : tip.cat === 'Quest' ? 'rgba(226,183,20,0.2); color:#f0d050;'
            : 'rgba(255,255,255,0.1); color:#a0aab4;');
        badge.textContent = tip.urgent ? 'Urgent' : tip.cat;
        row.appendChild(badge);

        const text = document.createElement('span');
        text.style.cssText = 'font-size:0.85em; color:' + (tip.urgent ? '#ff6b6b' : '#e0e4e8') + '; line-height:1.4;';
        if (tip.html) {
            text.innerHTML = tip.text;
        } else {
            text.textContent = tip.text;
        }
        row.appendChild(text);

        container.appendChild(row);
    }
}

// ─── Camp Status Bar ──────────────────────────────────────────────────────────

function updateCampStatus() {
    const container = document.getElementById('camp-status-bar');
    if (!container) return;

    const pop = gameState.population || 1;
    const housing = getTotalHousing();
    const workers = gameState.availableWorkers ?? pop;
    const assigned = getTotalAssignedWorkers ? getTotalAssignedWorkers() : 0;
    const blueprintCount = (gameState.unlockedBlueprints || []).length;
    const buildingCount = Object.values(gameState.buildings || {}).filter(b => b.level > 0).length
        + Object.values(gameState.multipleBuildings || {}).reduce((sum, arr) => sum + arr.length, 0);
    const toolCount = Object.values(gameState.tools || {}).filter(t => t.level > 0).length;

    const key = pop + ',' + housing + ',' + workers + ',' + assigned + ',' + blueprintCount + ',' + buildingCount + ',' + toolCount;
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:8px; font-size:0.75em;';

    const items = [
        ['\u{1F465}', 'Pop', pop + '/' + Math.max(housing, pop)],
        ['\u{1F477}', 'Workers', (workers - assigned) + ' free'],
        ['\u{1F4D0}', 'Blueprints', '' + blueprintCount],
        ['\u{1F3D7}', 'Buildings', '' + buildingCount],
        ['\u{1F529}', 'Tools', '' + toolCount],
        ['\u{1F4DA}', 'Knowledge', '' + Math.floor(gameState.knowledge || 0)],
    ];

    for (const [emoji, label, value] of items) {
        const cell = document.createElement('div');
        cell.style.cssText = 'text-align:center; padding:6px 4px; background:rgba(0,255,255,0.04); border-radius:4px; border:1px solid rgba(0,255,255,0.08);';
        const valDiv = document.createElement('div');
        valDiv.style.cssText = 'color:#00ffff; font-weight:bold; font-size:1.1em;';
        valDiv.textContent = emoji + ' ' + value;
        cell.appendChild(valDiv);
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = 'color:#7f8c8d; font-size:0.85em; margin-top:2px;';
        labelDiv.textContent = label;
        cell.appendChild(labelDiv);
        grid.appendChild(cell);
    }

    container.appendChild(grid);
}

function updateBuiltBuildings() {
    const container = document.getElementById('built-buildings');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { container.textContent = ''; return; }

    // Fingerprint: building levels + itemIds + tool levels + multiple building counts
    const bKey = Object.keys(gameState.buildings).map(k => k + ':' + (gameState.buildings[k].level || 0) + ':' + (gameState.buildings[k].itemId || '')).join(',');
    const mKey = Object.keys(gameState.multipleBuildings).map(k => k + ':' + gameState.multipleBuildings[k].length).join(',');
    const tKey = Object.keys(gameState.tools).map(k => k + ':' + (gameState.tools[k].level || 0)).join(',');
    if (_skipIfUnchanged(container, bKey + '|' + mKey + '|' + tKey)) return;

    // Build DOM nodes safely without innerHTML
    while (container.firstChild) container.removeChild(container.firstChild);

    let hasBuildings = false;

    // SINGLE buildings
    for (const chainId of Object.keys(gameState.buildings)) {
        const building = gameState.buildings[chainId];
        if (building.level === 0 || !building.itemId) continue;
        const item = config.items ? config.items.find(i => i.id === building.itemId) : null;
        if (item) {
            hasBuildings = true;
            const card = document.createElement('div');
            card.className = 'building-card';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            const levelSpan = document.createElement('span');
            levelSpan.style.cssText = 'color:#7f8c8d; font-size:0.9em;';
            levelSpan.textContent = 'Lv.' + building.level;
            card.appendChild(nameSpan);
            card.appendChild(levelSpan);
            container.appendChild(card);
        }
    }

    // MULTIPLE buildings
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
        const instances = gameState.multipleBuildings[chainId];
        if (instances.length === 0) continue;
        for (const instance of instances) {
            const item = config.items ? config.items.find(i => i.id === instance.itemId) : null;
            if (item) {
                hasBuildings = true;
                const card = document.createElement('div');
                card.className = 'building-card';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                const infoSpan = document.createElement('span');
                infoSpan.style.cssText = 'color:#7f8c8d; font-size:0.9em;';
                const workers = instance.workersAssigned || 0;
                infoSpan.textContent = workers > 0 ? (workers + ' workers') : '';
                card.appendChild(nameSpan);
                card.appendChild(infoSpan);
                container.appendChild(card);
            }
        }
    }

    // Tools
    for (const chainId of Object.keys(gameState.tools)) {
        const tool = gameState.tools[chainId];
        if (tool.level === 0 || !tool.itemId) continue;
        const item = config.items ? config.items.find(i => i.id === tool.itemId) : null;
        if (item) {
            hasBuildings = true;
            const card = document.createElement('div');
            card.className = 'building-card tool';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            const levelSpan = document.createElement('span');
            levelSpan.style.cssText = 'font-size:0.9em;';
            levelSpan.textContent = 'Lv.' + tool.level;
            card.appendChild(nameSpan);
            card.appendChild(levelSpan);
            container.appendChild(card);
        }
    }

    if (!hasBuildings) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'Nothing built yet. Study the Book to learn blueprints.';
        container.appendChild(p);
    }
}

/**
 * Render gathering buttons for all unlocked resources.
 * Full-width buttons with resource count and modifier badges inside.
 */
export function updateGatheringButtons() {
    const container = document.getElementById('gathering-buttons');
    if (!container) return;

    computeUnlockedResources();
    const resources = gameState.unlockedResources || ['sticks', 'food', 'water'];

    // Remove buttons for resources no longer in the unlocked set
    const existingActions = container.querySelectorAll('.gather-action');
    for (const action of existingActions) {
        if (!resources.includes(action.dataset.resource)) {
            action.remove();
        }
    }

    for (const resource of resources) {
        const current = Math.floor(gameState.resources[resource] || 0);
        const cap = getResourceCap(resource);
        const atCap = current >= cap;
        const noWorkers = gameState.availableWorkers <= 0;

        // Get modifier info for this resource
        const info = getGatherInfo(resource);

        // Check if this button already exists (preserve progress bars during gathers)
        const existingBtn = document.getElementById('gather-' + resource);
        if (existingBtn) {
            existingBtn.disabled = atCap || noWorkers;
            // Update count
            const countEl = existingBtn.querySelector('.resource-count');
            if (countEl) countEl.textContent = current + '/' + cap;
            // Update multiplier badge
            const multEl = existingBtn.querySelector('.gather-btn-mult');
            if (multEl) {
                if (info.speedMult > 1) {
                    multEl.textContent = 'x' + info.speedMult.toFixed(1);
                    multEl.title = info.bonuses.join(', ');
                    multEl.style.display = '';
                } else {
                    multEl.style.display = 'none';
                }
            }
            // Update amount badge
            const amtEl = existingBtn.querySelector('.gather-btn-amount');
            if (amtEl) {
                if (info.amount > 1) {
                    amtEl.textContent = '+' + info.amount;
                    amtEl.style.display = '';
                } else {
                    amtEl.style.display = 'none';
                }
            }
            continue;
        }

        const gatherAction = document.createElement('div');
        gatherAction.className = 'gather-action';
        gatherAction.dataset.resource = resource;

        const btn = document.createElement('button');
        btn.id = 'gather-' + resource;
        btn.className = 'gather-btn';
        btn.dataset.resource = resource;
        btn.disabled = atCap || noWorkers;

        // Left side: name + speed multiplier
        const left = document.createElement('span');
        left.className = 'gather-btn-left';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'gather-btn-name';
        nameSpan.textContent = 'Gather ' + capitalize(resource);
        left.appendChild(nameSpan);

        const multSpan = document.createElement('span');
        multSpan.className = 'gather-btn-mult';
        if (info.speedMult > 1) {
            multSpan.textContent = 'x' + info.speedMult.toFixed(1);
            multSpan.title = info.bonuses.join(', ');
        } else {
            multSpan.style.display = 'none';
        }
        left.appendChild(multSpan);

        // Right side: amount badge + count
        const right = document.createElement('span');
        right.className = 'gather-btn-right';

        const amtSpan = document.createElement('span');
        amtSpan.className = 'gather-btn-amount';
        if (info.amount > 1) {
            amtSpan.textContent = '+' + info.amount;
        } else {
            amtSpan.style.display = 'none';
        }
        right.appendChild(amtSpan);

        const countSpan = document.createElement('span');
        countSpan.className = 'resource-count';
        countSpan.textContent = current + '/' + cap;
        right.appendChild(countSpan);

        btn.appendChild(left);
        btn.appendChild(right);

        // Progress bars container below the button
        const barsContainer = document.createElement('div');
        barsContainer.id = resource + '-bars';
        barsContainer.style.cssText = 'width:100%;';

        gatherAction.appendChild(btn);
        gatherAction.appendChild(barsContainer);
        container.appendChild(gatherAction);
    }
}

function updateQuickStats() {
    const container = document.getElementById('quick-stats');
    if (!container) return;

    const stats = gameState.stats || {};
    const key = (stats.totalGathered || 0) + ',' + (stats.totalCrafted || 0) + ',' + (stats.totalStudied || 0) + ',' + (stats.totalExplored || 0);
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    const entries = [
        ['Gathered', stats.totalGathered || 0],
        ['Crafted', stats.totalCrafted || 0],
        ['Studied', stats.totalStudied || 0],
        ['Explored', stats.totalExplored || 0]
    ];

    for (const [label, value] of entries) {
        const div = document.createElement('div');
        div.className = 'stat-item';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'stat-label';
        labelSpan.textContent = label;
        const valueSpan = document.createElement('span');
        valueSpan.className = 'stat-value';
        valueSpan.textContent = ' ' + value;
        div.appendChild(labelSpan);
        div.appendChild(valueSpan);
        container.appendChild(div);
    }
}


// ─── Book Tab ──────────────────────────────────────────────────────────────────

/**
 * Full update of the Book tab contents.
 */
export function updateBookTab() {
    updateChapterNav();
    updateStudySection();
    updateUnlockedBlueprints();
    updateLoreArchive();
}

function updateChapterNav() {
    const container = document.getElementById('book-chapter-nav');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { return; }

    // Chapters come from config — if not defined, show just chapter 1
    const chapters = config.chapters || [{ id: 1, name: 'Basics' }];
    const knowledgeLevel = gameState.buildings.knowledge ? gameState.buildings.knowledge.level : 0;
    const maxChapter = knowledgeLevel + 1;

    const loreArchive = document.getElementById('lore-archive');
    const loreActive = loreArchive && loreArchive.classList.contains('active') ? '1' : '0';
    const key = gameState.currentChapter + ',' + knowledgeLevel + ',' + loreActive;
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    for (const chapter of chapters) {
        const accessible = chapter.id <= maxChapter;
        const active = chapter.id === gameState.currentChapter;

        const btn = document.createElement('button');
        btn.className = 'chapter-btn';
        if (active) btn.classList.add('active');
        if (!accessible) btn.classList.add('locked');
        btn.dataset.chapter = chapter.id;
        btn.disabled = !accessible;
        btn.textContent = 'Ch.' + chapter.id + ': ' + chapter.name;

        if (accessible) {
            btn.addEventListener('click', () => {
                gameState.currentChapter = parseInt(btn.dataset.chapter, 10);
                updateBookTab();
            });
        }

        container.appendChild(btn);
    }

    // Add Memories button
    const memoriesBtn = document.createElement('button');
    memoriesBtn.className = 'chapter-btn memories-btn';
    memoriesBtn.textContent = 'Memories';
    if (loreArchive && loreArchive.classList.contains('active')) {
        memoriesBtn.classList.add('active');
    }
    memoriesBtn.addEventListener('click', () => {
        const archive = document.getElementById('lore-archive');
        const bookMain = document.getElementById('book-main-content');
        if (archive) {
            const isActive = archive.classList.toggle('active');
            memoriesBtn.classList.toggle('active', isActive);
            if (bookMain) bookMain.style.display = isActive ? 'none' : '';
        }
    });
    container.appendChild(memoriesBtn);
}

function updateStudySection() {
    const progressBar = document.getElementById('study-progress');
    if (progressBar) progressBar.value = gameState.studyBarProgress || 0;

    const gateInfo = document.getElementById('study-gate-info');
    if (gateInfo) {
        if (gameState.pendingPuzzle) {
            gateInfo.textContent = 'Puzzle waiting! Answer to unlock a blueprint.';
            gateInfo.style.color = '#e2b714';
        } else if (gameState.studyGateProgress && Object.values(gameState.studyGateProgress).some(v => v > 0)) {
            // Study gate not met — show what's needed
            const remaining = Object.entries(gameState.studyGateProgress)
                .filter(([, v]) => v > 0)
                .map(([r, v]) => `${v} ${r.charAt(0).toUpperCase() + r.slice(1)}`)
                .join(', ');
            gateInfo.textContent = `Gather ${remaining} before next study.`;
            gateInfo.style.color = '#f39c12';
        } else {
            // Show per-item study progress if currently studying something
            const inProgress = Object.entries(gameState.itemStudyProgress || {});
            if (inProgress.length > 0) {
                let config;
                try { config = getConfig(); } catch { return; }

                const [itemId, tracking] = inProgress[0]; // Show first active item
                const item = config.items ? config.items.find(i => i.id === itemId) : null;
                if (item && tracking.studyCount > 0) {
                    gateInfo.textContent = `Studying ${item.name} (${tracking.studyCount}/${tracking.totalStudies})`;
                    gateInfo.style.color = '#00ffff';
                } else {
                    gateInfo.textContent = '';
                }
            } else {
                gateInfo.textContent = '';
            }
        }
    }
}

function updateUnlockedBlueprints() {
    const container = document.getElementById('unlocked-blueprints');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { return; }

    // Filter items by chapter
    const chapterItems = config.items
        ? config.items.filter(i => i.chapter === gameState.currentChapter)
        : [];

    const key = gameState.currentChapter + ',' + gameState.unlockedBlueprints.length + ',' + gameState.unlockedBlueprints.join(':');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    const heading = document.createElement('h3');
    heading.textContent = 'Blueprints';
    container.appendChild(heading);

    if (chapterItems.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No blueprints in this chapter.';
        container.appendChild(p);
    } else {
        for (const item of chapterItems) {
            const unlocked = gameState.unlockedBlueprints.includes(item.id);
            const div = document.createElement('div');
            div.className = 'blueprint ' + (unlocked ? 'unlocked' : 'locked');
            div.textContent = (unlocked ? '\u2713 ' : '? ') + (unlocked ? item.name : '???');
            container.appendChild(div);
        }
    }
}


// ─── Flashback Popup ──────────────────────────────────────────────────────────

/**
 * Show a flashback popup (learning, lore, or event). Fades in with the
 * sepia/amber flashback styling. Player must click "Return to the present."
 *
 * @param {string} text - The flashback narrative text.
 */
export function showFlashback(text) {
    const popup = document.getElementById('flashback-popup');
    if (!popup) return;

    const textEl = document.getElementById('flashback-text');
    if (textEl) textEl.textContent = text;

    popup.style.display = 'flex';
    // Re-trigger the fade-in animation
    popup.style.animation = 'none';
    popup.offsetHeight; // force reflow
    popup.style.animation = '';
}


// ─── Lore Archive ─────────────────────────────────────────────────────────────

/** Currently viewed slideshow index (within sorted collected lore). */
let _loreSlideshowIndex = 0;

/**
 * Update the lore archive grid in the Book tab.
 * Shows collected/undiscovered lore slots in chronological order.
 */
function updateLoreArchive() {
    const grid = document.getElementById('lore-grid');
    const counterText = document.getElementById('lore-counter-text');
    if (!grid) return;

    const collected = gameState.collectedLore || [];
    const key = collected.length + ',' + collected.map(l => l.id).join(':');
    if (_skipIfUnchanged(grid, key)) return;

    let config;
    try { config = getConfig(); } catch { return; }

    // Total lore count: lore events + study lore flashbacks from hardness 3 items
    const loreEvents = config.loreEvents || [];
    const studyLoreItems = (config.items || []).filter(i =>
        i.hardness >= 3 && i.loreFlashback && i.loreChronologicalOrder !== undefined
    );

    // Build full timeline: all possible lore slots
    const allSlots = [];
    for (const le of loreEvents) {
        allSlots.push({ id: le.id, order: le.chronologicalOrder, source: 'event' });
    }
    for (const item of studyLoreItems) {
        allSlots.push({ id: 'study_lore_' + item.id, order: item.loreChronologicalOrder, source: 'study' });
    }
    allSlots.sort((a, b) => a.order - b.order);

    const collectedIds = new Set(collected.map(l => l.id));

    // Clear and rebuild grid
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    for (let i = 0; i < allSlots.length; i++) {
        const slot = allSlots[i];
        const cell = document.createElement('div');
        cell.className = 'lore-cell';

        if (collectedIds.has(slot.id)) {
            cell.classList.add('collected');
            cell.textContent = i + 1;
            cell.title = 'Click to read';
            cell.dataset.loreId = slot.id;
            cell.addEventListener('click', () => {
                const lore = collected.find(l => l.id === slot.id);
                if (lore) showFlashback(lore.text);
            });
        } else {
            cell.classList.add('undiscovered');
            cell.textContent = '?';
        }

        grid.appendChild(cell);
    }

    if (counterText) {
        const collectedCount = allSlots.filter(s => collectedIds.has(s.id)).length;
        counterText.textContent = 'Collected: ' + collectedCount + ' / ' + allSlots.length;
    }

    // Enable/disable play button
    const playBtn = document.getElementById('lore-play-btn');
    if (playBtn) {
        const hasAny = collected.length > 0;
        playBtn.disabled = !hasAny;
        playBtn.style.opacity = hasAny ? '1' : '0.3';
    }
}

/**
 * Start the lore slideshow — auto-advances through collected snippets
 * in chronological order.
 */
export function startLoreSlideshow() {
    const collected = [...(gameState.collectedLore || [])];
    if (collected.length === 0) return;

    collected.sort((a, b) => a.chronologicalOrder - b.chronologicalOrder);
    _loreSlideshowIndex = 0;

    const slideshow = document.getElementById('lore-slideshow');
    if (slideshow) {
        slideshow.classList.add('active');
        _renderLoreSlide(collected);
    }
}

/**
 * Navigate lore slideshow.
 * @param {number} delta - +1 for next, -1 for prev
 */
export function navigateLoreSlideshow(delta) {
    const collected = [...(gameState.collectedLore || [])];
    collected.sort((a, b) => a.chronologicalOrder - b.chronologicalOrder);

    _loreSlideshowIndex = Math.max(0, Math.min(collected.length - 1, _loreSlideshowIndex + delta));
    _renderLoreSlide(collected);
}

/**
 * Close the lore slideshow.
 */
export function closeLoreSlideshow() {
    const slideshow = document.getElementById('lore-slideshow');
    if (slideshow) slideshow.classList.remove('active');
}

function _renderLoreSlide(collected) {
    const textEl = document.getElementById('lore-slideshow-text');
    const counterEl = document.getElementById('lore-slide-counter');

    if (textEl && collected[_loreSlideshowIndex]) {
        textEl.textContent = collected[_loreSlideshowIndex].text;
    }
    if (counterEl) {
        counterEl.textContent = (_loreSlideshowIndex + 1) + ' / ' + collected.length;
    }
}


// ─── Crafting Tab ──────────────────────────────────────────────────────────────

/**
 * Update crafting items display based on the selected category.
 * This renders craftable items. The actual crafting logic lives in crafting.js.
 */
export function updateCraftingTab() {
    const container = document.getElementById('crafting-items');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch {
        container.textContent = 'Loading...';
        return;
    }

    // Update category badge counts
    document.querySelectorAll('.cat-btn[data-category]').forEach(btn => {
        const cat = btn.dataset.category;
        const count = config.items
            ? config.items.filter(i => gameState.unlockedBlueprints.includes(i.id) && matchCategory(i, cat) && !isAlreadyBuilt(i)).length
            : 0;
        const label = btn.dataset.label || btn.textContent.replace(/\s*\(\d+\)$/, '');
        btn.dataset.label = label;
        btn.textContent = count > 0 ? `${label} (${count})` : label;
    });

    // Get active category
    const activeBtn = document.querySelector('.cat-btn.active');
    const category = activeBtn ? activeBtn.dataset.category : 'tools';

    // Filter unlocked blueprints by category, excluding already-built SINGLE items
    const items = config.items
        ? config.items.filter(i =>
            gameState.unlockedBlueprints.includes(i.id) &&
            matchCategory(i, category) &&
            !isAlreadyBuilt(i)
          )
        : [];

    // Fingerprint: category + items + resource amounts (affect "can afford" state)
    const resKey = items.map(i => {
        const cost = i.requirements || i.cost || {};
        return i.id + ':' + Object.keys(cost).map(r => Math.floor(gameState.resources[r] || 0)).join('/');
    }).join(',');
    const key = category + '|' + gameState.unlockedBlueprints.length + '|' + resKey;
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (items.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No items available in this category. Unlock more blueprints by studying the Book.';
        container.appendChild(p);
        return;
    }

    for (const item of items) {
        const cost = item.requirements || item.cost || {};
        const canAfford = checkCost(cost);
        const effectText = formatEffectsText(item.effect || {});

        const card = document.createElement('div');
        card.className = 'craft-card';
        card.style.cssText = 'background:rgba(0,255,255,0.05); border:1px solid rgba(0,255,255,0.15); border-radius:6px; padding:10px; margin-bottom:8px;';

        // Item name + craft button row
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;';

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-weight:bold; color:#00ffff; font-size:0.95em;';
        nameEl.textContent = item.name;
        header.appendChild(nameEl);

        const btn = document.createElement('button');
        btn.className = 'craft-item-btn';
        btn.dataset.itemId = item.id;
        btn.dataset.itemName = item.name;
        btn.disabled = !canAfford;
        btn.style.cssText = 'padding:4px 12px; font-size:0.8em; white-space:nowrap;';
        btn.textContent = canAfford ? 'Craft' : 'Need Resources';
        header.appendChild(btn);

        card.appendChild(header);

        // Description
        if (item.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:0.8em; color:#7f8c8d; margin-bottom:6px;';
            desc.textContent = item.description;
            card.appendChild(desc);
        }

        // Resource cost list
        const costEntries = Object.entries(cost).filter(function(e) { return e[1] > 0; });
        if (costEntries.length > 0) {
            const costList = document.createElement('div');
            costList.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 10px; margin-bottom:4px;';

            for (const [resource, needed] of costEntries) {
                const have = Math.floor(gameState.resources[resource] || 0);
                const enough = have >= needed;

                const tag = document.createElement('span');
                tag.style.cssText = 'font-size:0.8em; padding:2px 6px; border-radius:3px; background:' +
                    (enough ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)') + '; color:' +
                    (enough ? '#2ecc71' : '#e74c3c') + ';';
                tag.textContent = capitalize(resource) + ': ' + have + '/' + needed;
                costList.appendChild(tag);
            }

            card.appendChild(costList);
        }

        // Effects as styled tags
        const effectEntries = Object.entries(item.effect || {}).filter(e => e[1] !== 0 && e[1] !== null);
        if (effectEntries.length > 0) {
            const effectList = document.createElement('div');
            effectList.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:4px;';

            for (const [key, val] of effectEntries) {
                const label = EFFECT_LABELS[key] || camelToLabel(key);
                const isPositive = val > 0;
                const sign = isPositive ? '+' : '';
                // Format: multipliers as x, others as raw number
                const display = key.includes('Multiplier') ? sign + val + 'x' : sign + val;

                const tag = document.createElement('span');
                tag.style.cssText = 'font-size:0.78em; padding:2px 7px; border-radius:3px; background:' +
                    (isPositive ? 'rgba(226,183,20,0.15)' : 'rgba(231,76,60,0.15)') + '; color:' +
                    (isPositive ? '#e2b714' : '#e74c3c') + ';';
                tag.textContent = label + ' ' + display;
                effectList.appendChild(tag);
            }

            card.appendChild(effectList);
        }

        // Craft time
        if (item.craftTime) {
            const timeEl = document.createElement('div');
            timeEl.style.cssText = 'font-size:0.75em; color:#7f8c8d; margin-top:2px;';
            timeEl.textContent = 'Craft time: ' + item.craftTime + 's';
            card.appendChild(timeEl);
        }

        container.appendChild(card);
    }
}

function matchCategory(item, category) {
    // Map item types/chains to UI categories
    const type = item.type || item.category || '';
    const chain = item.chain || '';

    switch (category) {
        case 'tools':
            return type === 'tool' || chain.includes('tool');
        case 'buildings':
            return type === 'building' || type === 'shelter' || type === 'defense' ||
                   chain.includes('shelter') || chain.includes('food_') ||
                   chain.includes('water') || chain.includes('defense');
        case 'workstations':
            return type === 'workstation' ||
                   ['kiln', 'forge', 'sawmill', 'loom', 'tannery', 'glassworks',
                    'charcoal_pit', 'herbalist_hut', 'paper_mill'].includes(chain);
        case 'workbench':
            return chain === 'workbench' || type === 'workbench';
        default:
            return true;
    }
}

function formatCost(cost) {
    if (!cost || typeof cost !== 'object') return '';
    return Object.entries(cost)
        .filter(function(entry) { return entry[1] > 0; })
        .map(function(entry) { return capitalize(entry[0]) + ': ' + entry[1]; })
        .join(', ');
}

function checkCost(cost) {
    if (!cost || typeof cost !== 'object') return true;
    for (const resource of Object.keys(cost)) {
        if ((gameState.resources[resource] || 0) < cost[resource]) return false;
    }
    return true;
}

function formatEffectsText(effect) {
    if (!effect || typeof effect !== 'object') return '';
    return Object.entries(effect)
        .map(function(entry) {
            const label = EFFECT_LABELS[entry[0]] || entry[0];
            const sign = entry[1] > 0 ? '+' : '';
            return label + ': ' + sign + entry[1];
        })
        .join(', ');
}


// ─── Crafting Queue Display ────────────────────────────────────────────────────

/**
 * Render the crafting queue with progress bars.
 * Called every tick regardless of active tab (queue is always visible).
 */
export function updateCraftingQueueDisplay() {
    const container = document.getElementById('queue-display');
    if (!container) return;

    if (!gameState.craftingQueue || gameState.craftingQueue.length === 0) {
        if (container.childElementCount !== 1 || !container.querySelector('.dim')) {
            while (container.firstChild) container.removeChild(container.firstChild);
            const p = document.createElement('p');
            p.className = 'dim';
            p.textContent = 'Queue empty';
            container.appendChild(p);
        }
        return;
    }

    let config;
    try { config = getConfig(); } catch { return; }

    // Structure key: queue item IDs (for full rebuild check)
    const structKey = gameState.craftingQueue.map(e => e.itemId).join(',');

    // If queue structure hasn't changed, just update progress values in place
    if (container._queueKey === structKey) {
        const rows = container.querySelectorAll('.queue-item');
        for (let idx = 0; idx < gameState.craftingQueue.length && idx < rows.length; idx++) {
            const entry = gameState.craftingQueue[idx];
            const duration = entry.duration || 1;
            const pct = Math.min(100, ((entry.progress || 0) / duration) * 100);
            const prog = rows[idx].querySelector('progress');
            if (prog) prog.value = pct;
            const pctSpan = rows[idx].querySelectorAll('span')[1];
            if (pctSpan) pctSpan.textContent = Math.floor(pct) + '%';
        }
        return;
    }
    container._queueKey = structKey;

    while (container.firstChild) container.removeChild(container.firstChild);

    for (const entry of gameState.craftingQueue) {
        const item = config.items ? config.items.find(i => i.id === entry.itemId) : null;
        const duration = entry.duration || 1;
        const pct = Math.min(100, ((entry.progress || 0) / duration) * 100);

        const row = document.createElement('div');
        row.className = 'queue-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item ? item.name : entry.itemId;

        const prog = document.createElement('progress');
        prog.value = pct;
        prog.max = 100;

        const pctSpan = document.createElement('span');
        pctSpan.textContent = Math.floor(pct) + '%';

        row.appendChild(nameSpan);
        row.appendChild(prog);
        row.appendChild(pctSpan);
        container.appendChild(row);
    }
}


// ─── Production Tab ────────────────────────────────────────────────────────────

/**
 * Update the Production tab with worker assignments and output rates.
 */
export function updateProductionTab() {
    updateWorkerSummary();
    updateProductionAssignments();
}

function updateWorkerSummary() {
    const container = document.getElementById('worker-summary');
    if (!container) return;

    let assigned;
    try { assigned = getTotalAssignedWorkers(); } catch { assigned = 0; }
    const total = gameState.population;
    const available = gameState.availableWorkers;

    const key = total + ',' + assigned + ',' + available;
    if (_skipIfUnchanged(container, key)) return;

    container.textContent = '';
    const totalSpan = document.createElement('span');
    totalSpan.textContent = 'Total: ' + total;
    const sep1 = document.createTextNode(' | ');
    const assignedSpan = document.createElement('span');
    assignedSpan.textContent = 'Assigned: ' + assigned;
    const sep2 = document.createTextNode(' | ');
    const availSpan = document.createElement('span');
    availSpan.style.color = available > 0 ? '#2ecc71' : '#e74c3c';
    availSpan.textContent = 'Available: ' + available;

    container.appendChild(totalSpan);
    container.appendChild(sep1);
    container.appendChild(assignedSpan);
    container.appendChild(sep2);
    container.appendChild(availSpan);
}

function updateProductionAssignments() {
    const container = document.getElementById('production-assignments');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { return; }

    // Fingerprint: building levels + worker assignments + available workers
    const aKey = JSON.stringify(gameState.automationAssignments || {});
    const bLevels = Object.keys(gameState.buildings).map(k => k + ':' + (gameState.buildings[k].level || 0)).join(',');
    const mWorkers = Object.keys(gameState.multipleBuildings).map(k =>
        k + ':' + gameState.multipleBuildings[k].map(i => (i.workersAssigned || 0)).join('/')
    ).join(',');
    const key = bLevels + '|' + mWorkers + '|' + aKey + '|' + gameState.availableWorkers;
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    let hasAny = false;

    // SINGLE production buildings
    for (const chainId of Object.keys(gameState.buildings)) {
        const building = gameState.buildings[chainId];
        if (building.level === 0 || !building.itemId) continue;
        const item = config.items ? config.items.find(i => i.id === building.itemId) : null;
        if (!item) continue;

        // Only show buildings that produce something or can have workers
        if (!item.productionRate && !item.produces) continue;

        const workers = gameState.automationAssignments[chainId] || 0;
        hasAny = true;

        const control = document.createElement('div');
        control.className = 'automation-control';

        const label = document.createElement('span');
        label.style.fontSize = '0.8em';
        label.textContent = item.name + ': ' + workers + ' worker' + (workers !== 1 ? 's' : '');

        const btnGroup = document.createElement('div');

        const removeBtn = document.createElement('button');
        removeBtn.className = 'assign-worker-btn';
        removeBtn.dataset.chain = chainId;
        removeBtn.dataset.action = 'remove';
        removeBtn.disabled = workers <= 0;
        removeBtn.textContent = '-';

        const addBtn = document.createElement('button');
        addBtn.className = 'assign-worker-btn';
        addBtn.dataset.chain = chainId;
        addBtn.dataset.action = 'add';
        addBtn.disabled = gameState.availableWorkers <= 0;
        addBtn.textContent = '+';

        btnGroup.appendChild(removeBtn);
        btnGroup.appendChild(addBtn);
        control.appendChild(label);
        control.appendChild(btnGroup);
        container.appendChild(control);
    }

    // MULTIPLE production buildings
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
        for (const instance of gameState.multipleBuildings[chainId]) {
            if (!instance.itemId) continue;
            const item = config.items ? config.items.find(i => i.id === instance.itemId) : null;
            if (!item) continue;
            if (!item.productionRate && !item.produces) continue;

            const workers = instance.workersAssigned || 0;
            hasAny = true;

            const control = document.createElement('div');
            control.className = 'automation-control';

            const label = document.createElement('span');
            label.style.fontSize = '0.8em';
            label.textContent = item.name + ': ' + workers + ' worker' + (workers !== 1 ? 's' : '');

            const btnGroup = document.createElement('div');

            const removeBtn = document.createElement('button');
            removeBtn.className = 'assign-worker-btn';
            removeBtn.dataset.instance = instance.id;
            removeBtn.dataset.chain = chainId;
            removeBtn.dataset.action = 'remove';
            removeBtn.disabled = workers <= 0;
            removeBtn.textContent = '-';

            const addBtn = document.createElement('button');
            addBtn.className = 'assign-worker-btn';
            addBtn.dataset.instance = instance.id;
            addBtn.dataset.chain = chainId;
            addBtn.dataset.action = 'add';
            addBtn.disabled = gameState.availableWorkers <= 0;
            addBtn.textContent = '+';

            btnGroup.appendChild(removeBtn);
            btnGroup.appendChild(addBtn);
            control.appendChild(label);
            control.appendChild(btnGroup);
            container.appendChild(control);
        }
    }

    if (!hasAny) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'Build production buildings and assign workers.';
        container.appendChild(p);
    }
}


// ─── Exploration Tab ───────────────────────────────────────────────────────────

export function updateExplorationTab() {
    updateExplorationLocations();
    updateActiveExplorations();
}

function updateExplorationLocations() {
    const container = document.getElementById('exploration-locations');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { return; }

    const locations = config.explorationLocations || [];
    const key = (gameState.discoveredLocations || []).join(',') + '|' + locations.length;
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (locations.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No exploration locations available yet.';
        container.appendChild(p);
        return;
    }

    for (const loc of locations) {
        const discovered = gameState.discoveredLocations.includes(loc.id);
        const div = document.createElement('div');
        div.className = 'exploration-location';

        const strong = document.createElement('strong');
        strong.textContent = loc.name;
        div.appendChild(strong);

        if (loc.description) {
            const desc = document.createElement('p');
            desc.style.cssText = 'font-size:0.85em; color:#bdc3c7; margin:4px 0;';
            desc.textContent = loc.description;
            div.appendChild(desc);
        }

        if (discovered) {
            const badge = document.createElement('span');
            badge.style.cssText = 'color:#2ecc71; font-size:0.8em;';
            badge.textContent = 'Discovered';
            div.appendChild(badge);
        }

        container.appendChild(div);
    }
}

function updateActiveExplorations() {
    const container = document.getElementById('active-explorations');
    if (!container) return;

    if (!gameState.explorations || gameState.explorations.length === 0) {
        if (!container.querySelector('.dim')) {
            while (container.firstChild) container.removeChild(container.firstChild);
            const p = document.createElement('p');
            p.className = 'dim';
            p.textContent = 'No active expeditions.';
            container.appendChild(p);
        }
        return;
    }

    // Structure key for full rebuild
    const structKey = gameState.explorations.map(e => e.locationId).join(',');

    // If structure hasn't changed, just update progress
    if (container._expKey === structKey) {
        const expeditions = container.querySelectorAll('.active-expedition');
        for (let i = 0; i < gameState.explorations.length && i < expeditions.length; i++) {
            const exp = gameState.explorations[i];
            const pct = exp.duration > 0 ? Math.min(100, ((exp.progress || 0) / exp.duration) * 100) : 0;
            const prog = expeditions[i].querySelector('progress');
            if (prog) prog.value = pct;
        }
        return;
    }
    container._expKey = structKey;

    while (container.firstChild) container.removeChild(container.firstChild);

    for (const exp of gameState.explorations) {
        const pct = exp.duration > 0 ? Math.min(100, ((exp.progress || 0) / exp.duration) * 100) : 0;

        const div = document.createElement('div');
        div.className = 'active-expedition';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = exp.locationName || exp.locationId;
        div.appendChild(nameSpan);

        const prog = document.createElement('progress');
        prog.value = pct;
        prog.max = 100;
        prog.style.cssText = 'width:100%; margin-top:4px;';
        div.appendChild(prog);

        container.appendChild(div);
    }
}


// ─── World Tab ─────────────────────────────────────────────────────────────────

export function updateWorldTab() {
    updatePopulationSection();
    updateTradingSection();
    updateFactionsSection();
    updateQuestsSection();
    updateAchievementsSection();
    updateStatsSection();
}


// ─── Puzzle Popup ──────────────────────────────────────────────────────────────

/**
 * Show the puzzle popup for an item unlock.
 * Used by the study system when a puzzle is triggered.
 * @param {object} item - The item config object with puzzle, hints, etc.
 */
export function showPuzzlePopup(item) {
    const popup = document.getElementById('puzzle-popup');
    if (!popup) return;

    const titleEl = document.getElementById('puzzle-title');
    const questionEl = document.getElementById('puzzle-question');
    const answerEl = document.getElementById('puzzle-answer');
    const hintsEl = document.getElementById('puzzle-hints');

    if (titleEl) titleEl.textContent = 'Discover: ' + item.name;
    if (questionEl) questionEl.textContent = item.puzzle || item.question || '';
    if (answerEl) answerEl.value = '';
    if (hintsEl) hintsEl.textContent = '';

    popup.dataset.itemId = item.id;
    popup.dataset.hintsShown = '0';
    popup.dataset.puzzleType = 'study';
    popup.style.display = 'flex';
}

/**
 * Hide the puzzle popup.
 */
export function hidePuzzlePopup() {
    const popup = document.getElementById('puzzle-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

/**
 * Show a hint in the puzzle popup, with escalating knowledge cost.
 */
export function showHint() {
    const popup = document.getElementById('puzzle-popup');
    if (!popup) return;

    let config;
    try { config = getConfig(); } catch { return; }

    const item = config.items ? config.items.find(i => i.id === popup.dataset.itemId) : null;
    if (!item || !item.hints) return;

    const hintsShown = parseInt(popup.dataset.hintsShown || '0', 10);
    if (hintsShown >= item.hints.length) return;

    const hintContainer = document.getElementById('puzzle-hints');
    if (!hintContainer) return;

    // Hint cost: hint 1 free, hint 2 costs 1 knowledge, hint 3 costs 2
    const cost = hintsShown;
    if (cost > 0 && gameState.knowledge < cost) {
        logEvent('Not enough knowledge for hint (need ' + cost + ')', 'warning');
        return;
    }
    if (cost > 0) gameState.knowledge -= cost;

    const hint = item.hints[hintsShown];
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Hint ' + (hintsShown + 1) + ': ' + hint;
    hintContainer.appendChild(p);
    popup.dataset.hintsShown = String(hintsShown + 1);
}


// ─── Backward-compatible popup aliases ─────────────────────────────────────────

/**
 * Show puzzle for study unlock (backward compat with resources.js).
 * @param {object} item - Item config.
 */
export function showUnlockPuzzle(item) {
    showPuzzlePopup(item);
}

/**
 * Show puzzle for item unlock (backward compat with resources.js).
 * @param {object} item - Item config.
 */
export function showItemUnlockPuzzle(item) {
    showPuzzlePopup(item);
}

/**
 * Submit study puzzle answer (backward compat with game.js).
 * Returns the answer string; actual validation is in game.js/resources.js.
 */
export function submitUnlockPuzzleAnswer() {
    const answerEl = document.getElementById('puzzle-answer');
    const answer = answerEl ? answerEl.value.trim() : '';
    return answer;
}

/**
 * Submit item unlock puzzle answer (backward compat with game.js).
 */
export function submitItemUnlockPuzzleAnswer() {
    return submitUnlockPuzzleAnswer();
}

/**
 * Find next item to unlock via puzzle (backward compat with resources.js).
 * Returns the next item that has a puzzle and is not yet unlocked.
 */
export function findNextItemUnlock() {
    let config;
    try { config = getConfig(); } catch { return null; }

    if (!config.items) return null;

    for (const item of config.items) {
        if (item.puzzle &&
            !gameState.unlockedBlueprints.includes(item.id) &&
            item.chapter === gameState.currentChapter) {
            return item;
        }
    }
    return null;
}


// ─── Event Log ─────────────────────────────────────────────────────────────────

/**
 * Add an entry to the event log.
 * @param {string} message - Log message.
 * @param {string} [type='info'] - Log type for styling: info, warning, danger, success, milestone, event.
 */
export function logEvent(message, type) {
    if (!type) type = 'info';
    const log = document.getElementById('event-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'log-entry log-' + type;
    entry.textContent = '[Day ' + gameState.day + '] ' + message;
    log.prepend(entry);

    // Keep last 50 entries
    while (log.children.length > 50) {
        log.removeChild(log.lastChild);
    }
}

/**
 * Clear the event log.
 */
export function clearEventLog() {
    const log = document.getElementById('event-log');
    if (log) {
        while (log.firstChild) log.removeChild(log.firstChild);
    }
}


// ─── Achievement Toast ─────────────────────────────────────────────────────────

/**
 * Show a toast notification for an achievement.
 * @param {object} achievement - Achievement object with .name property.
 */
export function showAchievementToast(achievement) {
    const toast = document.getElementById('achievement-toast');
    const nameEl = document.getElementById('achievement-toast-name');
    if (!toast || !nameEl) return;

    nameEl.textContent = achievement.name || achievement;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}


// ─── Milestone Event ───────────────────────────────────────────────────────────

/**
 * Show a milestone event. Logs to event log with milestone styling.
 * @param {object} event - Event object with .description or .name property.
 */
export function showMilestoneEvent(event, applyChoiceCallback) {
    const desc = event.description || event.name || 'Unknown milestone';
    logEvent('MILESTONE: ' + desc, 'milestone');

    // Auto-apply the first choice's effects if a callback was provided
    if (applyChoiceCallback && event.choices && event.choices.length > 0) {
        applyChoiceCallback(event.choices[0]);
    }
}


// ─── Game Over / Victory ───────────────────────────────────────────────────────

/**
 * Show the game over popup.
 */
export function showGameOver() {
    const popup = document.getElementById('game-over-popup');
    if (popup) popup.style.display = 'flex';
}

/**
 * Show the victory popup.
 */
export function showVictory() {
    const popup = document.getElementById('victory-popup');
    if (popup) popup.style.display = 'flex';
}


// ─── Day/Night Cycle ───────────────────────────────────────────────────────────

/**
 * Update day/night visual overlay based on current time-of-day.
 */
/**
 * Dynamic sun arc lighting effect.
 *
 * The sun moves right → overhead → left across a half-circle arc.
 * progress 0.0 = midnight, 0.25 = sunrise (right), 0.5 = noon (top), 0.75 = sunset (left), 1.0 = midnight.
 *
 * A radial gradient follows the sun position with warm tint (sunrise/sunset)
 * or bright top-light (midday). Night uses a dark blue overlay.
 */
export function updateDayNightCycle() {
    const el = document.getElementById('day-night-cycle');
    if (!el) return;

    const daySpeed = gameState.settings?.daySpeed || 600;
    const progress = (gameState.time % daySpeed) / daySpeed;
    // progress: 0 = midnight, 0.25 = 6am sunrise, 0.5 = noon, 0.75 = 6pm sunset, 1.0 = midnight

    // Night: 0.0–0.20 and 0.80–1.0
    if (progress < 0.20 || progress >= 0.80) {
        // Deep night — dark blue overlay, slightly lighter toward top
        const nightDepth = (progress < 0.20)
            ? 1 - (progress / 0.20)      // 0.0→0.20: fading from deep night to pre-dawn
            : (progress - 0.80) / 0.20;  // 0.80→1.0: deepening into night
        const alpha = 0.15 + nightDepth * 0.30;  // 0.15 (twilight edge) to 0.45 (deep midnight)
        el.style.background = `radial-gradient(ellipse 120% 80% at 50% 20%, rgba(10,10,40,${(alpha * 0.5).toFixed(3)}), rgba(0,0,20,${alpha.toFixed(3)}))`;
        // Clear sun glow on cards at night
        const container = document.getElementById('game-container');
        if (container) container.style.setProperty('--sun-glow', '0 0 0 transparent');
        return;
    }

    // Daytime: 0.20–0.80
    // Map to sun angle: 0.20=sunrise(right), 0.50=noon(top), 0.80=sunset(left)
    const dayProgress = (progress - 0.20) / 0.60;  // 0→1 across the day

    // Sun position along an arc (right → top → left)
    // X: 90% (right) → 50% (center) → 10% (left)
    const sunX = 90 - dayProgress * 80;
    // Y: arc — lowest at edges, highest (5%) at midday
    const arcAngle = dayProgress * Math.PI;
    const sunY = 85 - Math.sin(arcAngle) * 80;  // 85% at horizon → 5% at zenith

    // Color temperature shifts through the day
    let tintR, tintG, tintB, tintAlpha;
    let ambientAlpha;

    if (dayProgress < 0.20) {
        // Sunrise — warm amber/pink glow from the right
        const t = dayProgress / 0.20;
        tintR = 255;
        tintG = Math.round(120 + t * 80);  // 120→200 (deep amber → golden)
        tintB = Math.round(40 + t * 60);   // 40→100
        tintAlpha = 0.25 - t * 0.12;       // 0.25→0.13 (strong at horizon, fading as sun rises)
        ambientAlpha = 0.10 - t * 0.08;    // slight overall darkness fading away
    } else if (dayProgress > 0.80) {
        // Sunset — warm orange/red glow from the left
        const t = (dayProgress - 0.80) / 0.20;
        tintR = 255;
        tintG = Math.round(170 - t * 60);  // 170→110 (golden → deep orange)
        tintB = Math.round(70 - t * 40);   // 70→30
        tintAlpha = 0.13 + t * 0.15;       // 0.13→0.28 (intensifying into dusk)
        ambientAlpha = t * 0.10;            // darkness creeping in
    } else {
        // Midday — gentle warm overhead light
        const midT = Math.abs(dayProgress - 0.5) / 0.3; // 0 at noon, 1 at edges
        tintR = 255;
        tintG = 245;
        tintB = 210;
        tintAlpha = 0.06 + (1 - midT) * 0.04; // 0.06→0.10 brightest at noon
        ambientAlpha = 0;
    }

    const tint = `rgba(${tintR},${tintG},${tintB},${tintAlpha.toFixed(3)})`;
    const clear = 'rgba(0,0,0,0)';
    const ambient = ambientAlpha > 0 ? `rgba(10,10,30,${ambientAlpha.toFixed(3)})` : clear;

    // Radial gradient centered on sun position — large ellipse radiating warmth outward
    el.style.background = `radial-gradient(ellipse 80% 70% at ${sunX.toFixed(1)}% ${sunY.toFixed(1)}%, ${tint}, ${clear} 70%), linear-gradient(to bottom, ${clear}, ${ambient})`;

    // Apply sun glow tint to game card edges
    // Sunrise: glow on right edge. Sunset: glow on left edge. Midday: subtle top glow.
    const container = document.getElementById('game-container');
    if (container) {
        let glowX, glowAlpha;
        if (dayProgress < 0.20) {
            // Sunrise — warm glow on right side
            const t = dayProgress / 0.20;
            glowX = 8;
            glowAlpha = (0.35 - t * 0.15).toFixed(3);  // 0.35→0.20
        } else if (dayProgress > 0.80) {
            // Sunset — red/orange glow on left side
            const t = (dayProgress - 0.80) / 0.20;
            glowX = -8;
            glowAlpha = (0.20 + t * 0.20).toFixed(3);  // 0.20→0.40
        } else {
            // Midday — no directional glow
            glowX = 0;
            glowAlpha = 0;
        }

        if (glowAlpha > 0) {
            container.style.setProperty('--sun-glow',
                `${glowX}px 0 20px rgba(${tintR},${tintG},${tintB},${glowAlpha})`);
        } else {
            container.style.setProperty('--sun-glow', '0 0 0 transparent');
        }
    }
}


// ─── Weather Effects ─────────────────────────────────────────────────────────

const _weather = {
    canvas: null,
    ctx: null,
    particles: [],
    pileBottom: [],   // snow/frost accumulation per column on bottom edge
    pileTop: [],      // per column on top edge
    pileLeft: [],     // per row on left edge
    pileRight: [],    // per row on right edge
    drops: [],
    leaves: [],
    currentWeather: null,
    animRunning: false,
    initialized: false,
};

function initWeatherCanvas() {
    if (_weather.initialized) return;
    _weather.canvas = document.getElementById('weather-canvas');
    if (!_weather.canvas) return;
    _weather.ctx = _weather.canvas.getContext('2d');
    _weather.initialized = true;
    resizeWeatherCanvas();
    window.addEventListener('resize', resizeWeatherCanvas);
}

function resizeWeatherCanvas() {
    if (!_weather.canvas) return;
    _weather.canvas.width = window.innerWidth;
    _weather.canvas.height = window.innerHeight;
    const cols = Math.ceil(window.innerWidth / 4);
    const rows = Math.ceil(window.innerHeight / 4);
    _weather.pileBottom = new Array(cols).fill(0);
    _weather.pileTop = new Array(cols).fill(0);
    _weather.pileLeft = new Array(rows).fill(0);
    _weather.pileRight = new Array(rows).fill(0);
}

/**
 * Called from game tick — syncs weather state and ensures animation loop is running.
 */
export function updateWeatherEffects() {
    initWeatherCanvas();
    if (!_weather.ctx) return;

    const weather = gameState.currentWeather || 'Clear';
    if (weather !== _weather.currentWeather) {
        _weather.currentWeather = weather;
        _weather.particles = [];
        _weather.leaves = [];
    }

    // Start the 60fps render loop if not already running
    if (!_weather.animRunning) {
        _weather.animRunning = true;
        requestAnimationFrame(weatherRenderLoop);
    }
}

function weatherRenderLoop() {
    if (!_weather.ctx || !_weather.canvas) return;

    const weather = (_weather.currentWeather || 'clear').toLowerCase();
    const W = _weather.canvas.width;
    const H = _weather.canvas.height;
    const ctx = _weather.ctx;

    // Spawn particles each frame
    if (weather === 'rain' || weather === 'storm') {
        const count = weather === 'storm' ? 4 : 2;
        for (let i = 0; i < count; i++) {
            _weather.particles.push({
                x: Math.random() * (W + 40) - 20,
                y: -10,
                speed: 8 + Math.random() * 6,
                length: 12 + Math.random() * 18,
                wind: weather === 'storm' ? -2.5 + Math.random() * 0.5 : -0.5,
                alpha: 0.2 + Math.random() * 0.15,
            });
        }
    } else if (weather === 'snow') {
        if (Math.random() < 0.15) {
            _weather.particles.push({
                x: Math.random() * W,
                y: -5,
                speed: 0.4 + Math.random() * 0.8,
                size: 1.5 + Math.random() * 2,
                drift: (Math.random() - 0.5) * 0.4,
                wobble: Math.random() * Math.PI * 2,
                alpha: 0.4 + Math.random() * 0.4,
            });
        }
    } else if (weather === 'wind') {
        if (Math.random() < 0.008) {
            _weather.leaves.push({
                x: W + 10,
                y: H - 90 - Math.random() * 80,
                speed: 1.5 + Math.random() * 2.5,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.12,
                size: 5 + Math.random() * 5,
                color: ['#8B6914', '#6B8E23', '#CD853F', '#A0522D'][Math.floor(Math.random() * 4)],
                wobble: Math.random() * Math.PI * 2,
                alpha: 0.5 + Math.random() * 0.3,
            });
        }
    }

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Rain / Storm
    if (weather === 'rain' || weather === 'storm') {
        ctx.lineWidth = 1.5;
        _weather.particles = _weather.particles.filter(p => {
            p.y += p.speed;
            p.x += p.wind;
            if (p.y > H || p.x < 0) {
                // Droplet on random position when hitting bottom/side
                if (Math.random() < 0.03) {
                    _weather.drops.push({
                        x: p.x, y: 70 + Math.random() * (H - 200),
                        r: 2 + Math.random() * 3, alpha: 0.2, life: 200 + Math.random() * 300
                    });
                }
                // Edge accumulation — water streaks
                if (Math.random() < 0.01) {
                    // Bottom edge drip
                    _weather.drops.push({
                        x: Math.random() * W, y: H - 52 + Math.random() * 4,
                        r: 1.5 + Math.random() * 2, alpha: 0.15, life: 300 + Math.random() * 200
                    });
                }
                if (Math.random() < 0.005) {
                    // Left edge drip (storm blows rain left)
                    _weather.drops.push({
                        x: 2 + Math.random() * 4, y: Math.random() * H,
                        r: 1 + Math.random() * 1.5, alpha: 0.12, life: 250 + Math.random() * 200
                    });
                }
                return false;
            }
            ctx.strokeStyle = `rgba(180,215,255,${p.alpha})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.wind * 3, p.y + p.length);
            ctx.stroke();
            return true;
        });
    }

    // Snow
    if (weather === 'snow') {
        _weather.particles = _weather.particles.filter(p => {
            p.y += p.speed;
            p.wobble += 0.015;
            p.x += p.drift + Math.sin(p.wobble) * 0.3;

            // Accumulate on edges when hitting them
            const col = Math.floor(p.x / 4);
            const row = Math.floor(p.y / 4);
            const maxPile = 12;

            // Hit bottom edge
            if (p.y >= H - 50 - (_weather.pileBottom[col] || 0)) {
                if (col >= 0 && col < _weather.pileBottom.length)
                    _weather.pileBottom[col] = Math.min(maxPile, (_weather.pileBottom[col] || 0) + 0.12);
                return false;
            }
            // Hit left edge
            if (p.x <= 6 + (_weather.pileLeft[row] || 0)) {
                if (row >= 0 && row < _weather.pileLeft.length)
                    _weather.pileLeft[row] = Math.min(maxPile, (_weather.pileLeft[row] || 0) + 0.08);
                return false;
            }
            // Hit right edge
            if (p.x >= W - 6 - (_weather.pileRight[row] || 0)) {
                if (row >= 0 && row < _weather.pileRight.length)
                    _weather.pileRight[row] = Math.min(maxPile, (_weather.pileRight[row] || 0) + 0.08);
                return false;
            }

            ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            return true;
        });

        // Top edge: snow accumulates passively (flakes spawn at top)
        for (let i = 0; i < _weather.pileTop.length; i++) {
            if (Math.random() < 0.001)
                _weather.pileTop[i] = Math.min(8, (_weather.pileTop[i] || 0) + 0.05);
        }
    }

    // Edge piles (draw even when not snowing — melts slowly)
    const meltRate = weather === 'snow' ? 0 : 0.003;
    const piles = [_weather.pileBottom, _weather.pileTop, _weather.pileLeft, _weather.pileRight];
    if (meltRate > 0) {
        for (const pile of piles) {
            for (let i = 0; i < pile.length; i++) {
                if (pile[i] > 0) pile[i] = Math.max(0, pile[i] - meltRate);
            }
        }
    }

    const hasPile = piles.some(pile => pile.some(h => h > 0.3));
    if (hasPile) {
        const fillColor = weather === 'snow' ? 'rgba(240,245,255,0.7)' : 'rgba(240,245,255,0.5)';
        ctx.fillStyle = fillColor;

        // Bottom pile
        if (_weather.pileBottom.some(h => h > 0.3)) {
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let i = 0; i < _weather.pileBottom.length; i++) {
                ctx.lineTo(i * 4, H - 48 - (_weather.pileBottom[i] || 0));
            }
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fill();
        }

        // Top pile
        if (_weather.pileTop.some(h => h > 0.3)) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (let i = 0; i < _weather.pileTop.length; i++) {
                ctx.lineTo(i * 4, (_weather.pileTop[i] || 0));
            }
            ctx.lineTo(W, 0);
            ctx.closePath();
            ctx.fill();
        }

        // Left pile
        if (_weather.pileLeft.some(h => h > 0.3)) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (let i = 0; i < _weather.pileLeft.length; i++) {
                ctx.lineTo((_weather.pileLeft[i] || 0), i * 4);
            }
            ctx.lineTo(0, H);
            ctx.closePath();
            ctx.fill();
        }

        // Right pile
        if (_weather.pileRight.some(h => h > 0.3)) {
            ctx.beginPath();
            ctx.moveTo(W, 0);
            for (let i = 0; i < _weather.pileRight.length; i++) {
                ctx.lineTo(W - (_weather.pileRight[i] || 0), i * 4);
            }
            ctx.lineTo(W, H);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Rain droplets on glass
    if (_weather.drops.length > 0) {
        ctx.lineWidth = 0.5;
        _weather.drops = _weather.drops.filter(d => {
            d.life--;
            d.alpha *= 0.998;
            if (d.life <= 0 || d.alpha < 0.015) return false;
            ctx.strokeStyle = `rgba(180,210,240,${d.alpha})`;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.stroke();
            return true;
        });
    }

    // Wind leaves
    if (_weather.leaves.length > 0) {
        _weather.leaves = _weather.leaves.filter(l => {
            l.x -= l.speed;
            l.wobble += 0.04;
            l.y += Math.sin(l.wobble) * 0.8;
            l.rot += l.rotSpeed;
            if (l.x < -20) return false;
            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.rotate(l.rot);
            ctx.globalAlpha = l.alpha;
            ctx.fillStyle = l.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, l.size, l.size * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(-l.size, 0);
            ctx.lineTo(l.size, 0);
            ctx.stroke();
            ctx.restore();
            ctx.globalAlpha = 1;
            return true;
        });
    }

    // Fog
    if (weather === 'fog') {
        ctx.fillStyle = 'rgba(180,190,200,0.04)';
        ctx.fillRect(0, 0, W, H);
    }

    // Keep animating while game is active
    if (weather !== 'clear' && weather !== 'heatwave' && weather !== 'drought'
        || _weather.particles.length > 0 || _weather.drops.length > 0
        || _weather.leaves.length > 0 || hasPile) {
        requestAnimationFrame(weatherRenderLoop);
    } else {
        ctx.clearRect(0, 0, W, H);
        _weather.animRunning = false;
    }
}


// ─── Time Display ────────────────────────────────────────────────────────────

/**
 * Update time display in HUD — shows fake in-game 24h clock.
 * Uses gameState.time % daySpeed so the clock wraps each game day.
 */
export function updateTimeDisplay() {
    const el = document.getElementById('time-display');
    if (!el) return;

    const daySpeed = gameState.settings?.daySpeed || 600;
    const timeInDay = gameState.time % daySpeed;
    const hours = Math.floor((timeInDay / daySpeed) * 24);
    const minutes = Math.floor(((timeInDay / daySpeed) * 24 - hours) * 60);
    el.textContent = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

/**
 * Update time emoji in HUD — reflects in-game time of day.
 */
export function updateTimeEmoji() {
    const el = document.getElementById('time-emoji');
    if (!el) return;

    const daySpeed = gameState.settings?.daySpeed || 600;
    const progress = (gameState.time % daySpeed) / daySpeed;

    if (progress < 0.25) el.textContent = '\u{1F305}';       // 00:00-06:00 sunrise
    else if (progress < 0.5) el.textContent = '\u{2600}\uFE0F'; // 06:00-12:00 daytime
    else if (progress < 0.75) el.textContent = '\u{1F307}';  // 12:00-18:00 sunset
    else el.textContent = '\u{1F319}';                        // 18:00-24:00 night
}


// ─── Section Update Stubs (backward compat for game.js) ───────────────────────

/**
 * Update the working section display (backward compat with crafting.js/resources.js).
 * In the new layout, this is replaced by gathering progress bars within the Settlement tab.
 */
export function updateWorkingSection() {
    // No-op in new layout -- gathering progress is shown inline in gather buttons
}

/**
 * Update gathering button visibility (backward compat with crafting.js/game.js).
 */
export function updateGatheringVisibility() {
    updateGatheringButtons();
}

/**
 * Update the trading section (backward compat with game.js).
 */
export function updateTradingSection() {
    const container = document.getElementById('trader-list');
    if (!container) return;

    const traders = gameState.traderVisits || [];
    const key = traders.map(t => (t.name || '') + ':' + (t.offers ? t.offers.length : 0)).join(',');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!gameState.traderVisits || gameState.traderVisits.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No traders currently visiting.';
        container.appendChild(p);
        return;
    }

    for (const trader of gameState.traderVisits) {
        const card = document.createElement('div');
        card.className = 'trade-card';

        const strong = document.createElement('strong');
        strong.textContent = trader.name || 'Wandering Trader';
        card.appendChild(strong);

        if (trader.offers) {
            const info = document.createElement('p');
            info.style.cssText = 'font-size:0.8em; color:#bdc3c7;';
            info.textContent = trader.offers.length + ' items available';
            card.appendChild(info);
        }

        container.appendChild(card);
    }
}

/**
 * Update the exploration section (backward compat with game.js).
 */
export function updateExplorationSection() {
    updateExplorationTab();
}

/**
 * Update the quests section (backward compat with game.js).
 */
export function updateQuestsSection() {
    const container = document.getElementById('quest-list');
    if (!container) return;

    const quests = gameState.activeQuests || [];
    const key = quests.map(q => q.id || q.name || '').join(',');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!gameState.activeQuests || gameState.activeQuests.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No active quests.';
        container.appendChild(p);
        return;
    }

    for (const quest of gameState.activeQuests) {
        const card = document.createElement('div');
        card.className = 'quest-card';

        const strong = document.createElement('strong');
        strong.textContent = quest.name || quest.id;
        card.appendChild(strong);

        if (quest.description) {
            const desc = document.createElement('p');
            desc.style.cssText = 'font-size:0.8em; color:#bdc3c7; margin:4px 0;';
            desc.textContent = quest.description;
            card.appendChild(desc);
        }

        container.appendChild(card);
    }
}

/**
 * Update the achievements section (backward compat with game.js).
 */
export function updateAchievementsSection() {
    const container = document.getElementById('achievement-list');
    if (!container) return;

    const key = (gameState.achievements || []).length.toString();
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!gameState.achievements || gameState.achievements.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No achievements yet.';
        container.appendChild(p);
        return;
    }

    for (const ach of gameState.achievements) {
        const name = typeof ach === 'string' ? ach : (ach.name || ach.id);
        const card = document.createElement('div');
        card.className = 'achievement-card';

        const check = document.createElement('span');
        check.style.color = '#2ecc71';
        check.textContent = '\u2713 ';
        card.appendChild(check);

        const text = document.createTextNode(name);
        card.appendChild(text);

        container.appendChild(card);
    }
}

/**
 * Update the population section (backward compat with game.js).
 */
export function updatePopulationSection() {
    const container = document.getElementById('population-list');
    if (!container) return;

    const members = gameState.populationMembers || [];
    const key = members.map(m => (m.name || '') + ':' + Math.round(m.health || 0) + ':' + Math.round(m.happiness || 0) + ':' + (m.sick ? 1 : 0) + ':' + (m.assignment || '')).join(',');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (members.length === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'font-size:0.75em; color:#4a5568;';
        p.textContent = 'No population members yet.';
        container.appendChild(p);
        return;
    }

    for (const member of members) {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 10px; margin-bottom:4px; background:rgba(0,255,255,0.04); border:1px solid rgba(0,255,255,0.12); border-radius:6px; font-size:0.75em; flex-wrap:wrap; gap:4px;';

        // Name + status
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-weight:700; color:#00ffff; min-width:60px;';
        nameSpan.textContent = member.name || 'Survivor';
        if (member.sick) {
            const sickBadge = document.createElement('span');
            sickBadge.style.cssText = 'color:#e74c3c; font-size:0.85em; margin-left:6px;';
            sickBadge.textContent = '\uD83E\uDE7A Sick (' + (member.sickDaysRemaining || '?') + 'd)';
            nameSpan.appendChild(sickBadge);
        }
        card.appendChild(nameSpan);

        // Stats row
        const statsSpan = document.createElement('span');
        statsSpan.style.cssText = 'display:flex; gap:8px; color:#7f8c8d; font-size:0.9em;';

        // Health bar
        const healthColor = member.health > 60 ? '#2ecc71' : member.health > 30 ? '#f39c12' : '#e74c3c';
        const healthSpan = document.createElement('span');
        healthSpan.style.color = healthColor;
        healthSpan.textContent = '\u2764\uFE0F ' + Math.round(member.health || 0);
        statsSpan.appendChild(healthSpan);

        // Happiness
        const happyColor = member.happiness > 60 ? '#2ecc71' : member.happiness > 30 ? '#f39c12' : '#e74c3c';
        const happySpan = document.createElement('span');
        happySpan.style.color = happyColor;
        happySpan.textContent = '\uD83D\uDE0A ' + Math.round(member.happiness || 0);
        statsSpan.appendChild(happySpan);

        // Assignment
        if (member.assignment) {
            const assignSpan = document.createElement('span');
            assignSpan.style.color = '#3498db';
            assignSpan.textContent = '\uD83D\uDEE0\uFE0F ' + member.assignment;
            statsSpan.appendChild(assignSpan);
        }

        card.appendChild(statsSpan);

        // Skills (collapsed by default, show top skill)
        const skills = member.skills || {};
        const topSkill = Object.entries(skills).sort((a, b) => b[1] - a[1])[0];
        if (topSkill) {
            const skillSpan = document.createElement('span');
            skillSpan.style.cssText = 'color:#9b59b6; font-size:0.85em; width:100%;';
            const skillList = Object.entries(skills)
                .map(([k, v]) => capitalize(k) + ':' + v)
                .join('  ');
            skillSpan.textContent = skillList;
            card.appendChild(skillSpan);
        }

        container.appendChild(card);
    }
}

/**
 * Update the factions section (backward compat with game.js).
 */
export function updateFactionsSection() {
    const container = document.getElementById('faction-list');
    if (!container) return;

    const factions = gameState.factions || [];
    const key = factions.map(f => (f.id || '') + ':' + (f.trust || 0)).join(',');
    if (_skipIfUnchanged(container, key)) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!gameState.factions || gameState.factions.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No factions discovered yet.';
        container.appendChild(p);
        return;
    }

    for (const faction of gameState.factions) {
        const card = document.createElement('div');
        card.className = 'faction-card';

        const strong = document.createElement('strong');
        strong.textContent = faction.name || faction.id;
        card.appendChild(strong);

        const trust = document.createElement('span');
        trust.style.cssText = 'margin-left:10px; font-size:0.8em; color:#7f8c8d;';
        trust.textContent = 'Trust: ' + (faction.trust || 0);
        card.appendChild(trust);

        container.appendChild(card);
    }
}

/**
 * Update the stats section (backward compat with game.js).
 */
export function updateStatsSection() {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;

    const s = gameState.stats || {};
    const entries = [
        ['Days Survived', gameState.day],
        ['Population', gameState.population],
        ['Blueprints', gameState.unlockedBlueprints.length],
        ['Knowledge', gameState.knowledge],
        ['Total Gathered', s.totalGathered || 0],
        ['Total Crafted', s.totalCrafted || 0],
        ['Total Explored', s.totalExplored || 0],
        ['Total Traded', s.totalTraded || 0],
        ['Total Studied', s.totalStudied || 0]
    ];

    const key = entries.map(e => e[1]).join(',');
    if (_skipIfUnchanged(statsGrid, key)) return;

    while (statsGrid.firstChild) statsGrid.removeChild(statsGrid.firstChild);

    for (const pair of entries) {
        const div = document.createElement('div');
        div.style.cssText = 'padding:4px 8px; background:rgba(0,255,255,0.04); border:1px solid rgba(0,255,255,0.08); border-radius:4px;';

        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = 'color:#7f8c8d; font-size:0.85em;';
        labelDiv.textContent = pair[0];

        const valueDiv = document.createElement('div');
        valueDiv.style.cssText = 'color:#00ffff; font-weight:700;';
        valueDiv.textContent = pair[1];

        div.appendChild(labelDiv);
        div.appendChild(valueDiv);
        statsGrid.appendChild(div);
    }

    // Score
    const score = calculateScore();
    const scoreEl = document.getElementById('score-value');
    if (scoreEl) scoreEl.textContent = score;

    const rankEl = document.getElementById('score-rank');
    if (rankEl) rankEl.textContent = getScoreRank(score);
}

function calculateScore() {
    const s = gameState.stats || {};
    return (gameState.day * 10) +
           (gameState.population * 50) +
           (gameState.unlockedBlueprints.length * 20) +
           (gameState.knowledge * 5) +
           ((s.totalCrafted || 0) * 3) +
           ((s.totalExplored || 0) * 10) +
           (gameState.achievements.length * 100);
}

function getScoreRank(score) {
    if (score >= 10000) return 'Legendary Survivor';
    if (score >= 5000) return 'Master Builder';
    if (score >= 2000) return 'Seasoned Explorer';
    if (score >= 1000) return 'Resourceful Settler';
    if (score >= 500) return 'Apprentice Crafter';
    if (score >= 100) return 'Newcomer';
    return 'Scavenger';
}

/**
 * Get a shareable stats string (backward compat with game.js).
 * @returns {string} Formatted stats string for clipboard.
 */
export function getShareableStats() {
    const s = gameState.stats || {};
    const score = calculateScore();
    return [
        'Post-Apocalyptic Survival - Day ' + gameState.day,
        'Score: ' + score + ' (' + getScoreRank(score) + ')',
        'Pop: ' + gameState.population + ' | Knowledge: ' + gameState.knowledge,
        'Blueprints: ' + gameState.unlockedBlueprints.length + ' | Achievements: ' + gameState.achievements.length,
        'Gathered: ' + (s.totalGathered || 0) + ' | Crafted: ' + (s.totalCrafted || 0),
        'Explored: ' + (s.totalExplored || 0) + ' | Traded: ' + (s.totalTraded || 0)
    ].join('\n');
}


// ─── Master Update ─────────────────────────────────────────────────────────────

// ─── Network Tab ────────────────────────────────────────────────────────────

/**
 * Render the Network tab content.
 * Shows settlement list, founding controls, supply line management.
 * Only updates when called explicitly (not every tick).
 *
 * Note: innerHTML is used with trusted internal game state data only (no user
 * or network-sourced content), matching the rendering pattern used by all
 * other tab update functions in this module.
 */
export function updateNetworkTab() {
    const networkMap = document.getElementById('network-map');
    const supplyLinesDiv = document.getElementById('supply-lines');
    if (!networkMap || !supplyLinesDiv) return;

    const settlements = getSettlementList();
    const supplyLines = getSupplyLines();
    const canFoundSettlement = isSettlementUnlocked();
    const canCreateSupplyLine = isSupplyLinesUnlocked();
    const currentSettlement = getCurrentSettlement();

    // Fingerprint: settlement data + supply lines
    const sKey = settlements.map(s => s.id + ':' + s.population + ':' + s.food + ':' + s.water + ':' + s.craftedCount).join(',');
    const slKey = supplyLines.map(sl => sl.from + '-' + sl.to).join(',');
    const key = sKey + '|' + slKey + '|' + canFoundSettlement + '|' + canCreateSupplyLine;
    if (_skipIfUnchanged(networkMap, key)) return;

    // ── Settlement List ──────────────────────────────────────────────────
    const parts = [];
    parts.push('<div style="width:100%;">');

    // Current settlement header
    parts.push('<div style="margin-bottom:12px; padding:8px; background:rgba(0,255,255,0.05); border:1px solid rgba(0,255,255,0.2); border-radius:6px;">');
    parts.push('<div style="font-size:0.9em; color:#00ffff; margin-bottom:4px;">Current Settlement</div>');
    parts.push(`<div style="font-size:1.1em; font-weight:bold;">${escapeHtml(currentSettlement.name)}</div>`);
    parts.push('<div style="font-size:0.75em; color:#8892b0; margin-top:4px;">');
    parts.push(`Infrastructure: Lv ${getInfrastructureLevel()} | Trade: Lv ${getTradeLevel()} | `);
    parts.push(`Total Pop: ${getTotalPopulation()}</div>`);
    parts.push('</div>');

    // Settlement list
    parts.push('<div id="settlement-list" style="margin-bottom:12px;">');
    for (const s of settlements) {
        const border = s.isCurrent ? 'border-left:3px solid #00ffff;' : 'border-left:3px solid #2d3748;';
        parts.push(`<div style="padding:6px 8px; margin-bottom:4px; background:rgba(0,0,0,0.2); border-radius:4px; ${border}">`);
        parts.push('<div style="display:flex; justify-content:space-between; align-items:center;">');
        parts.push('<div>');
        parts.push(`<span style="font-size:0.85em; font-weight:bold;">${escapeHtml(s.name)}</span>`);
        if (s.isCurrent) parts.push(' <span style="font-size:0.7em; color:#00ffff;">(here)</span>');
        parts.push('<div style="font-size:0.7em; color:#8892b0;">');
        parts.push(`Pop: ${s.population} | Food: ${s.food} | Water: ${s.water} | Buildings: ${s.craftedCount} | Day ${s.day}`);
        parts.push('</div></div>');
        if (!s.isCurrent) {
            parts.push(`<button data-action="switch" data-settlement-id="${s.id}" `);
            parts.push('style="padding:4px 8px; font-size:0.7em; background:rgba(0,255,255,0.1); border:1px solid rgba(0,255,255,0.3); color:#00ffff; border-radius:4px; cursor:pointer;">');
            parts.push('Switch</button>');
        }
        parts.push('</div></div>');
    }
    parts.push('</div>');

    // Found new settlement form
    parts.push('<div style="padding:8px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:8px;">');
    parts.push(`<div style="font-size:0.8em; margin-bottom:6px; color:${canFoundSettlement ? '#00ffff' : '#4a5568'};">`);
    parts.push(`Found New Settlement ${canFoundSettlement ? '' : '(Infrastructure Lv 3 required)'}`);
    parts.push('</div>');
    parts.push('<div style="display:flex; gap:6px;">');
    parts.push('<input type="text" id="new-settlement-name" placeholder="Settlement name" ');
    parts.push('style="flex:1; padding:4px 6px; font-size:0.75em; background:rgba(0,0,0,0.3); border:1px solid rgba(0,255,255,0.2); color:#ecf0f1; border-radius:4px; font-family:Orbitron,sans-serif;" ');
    parts.push(`${canFoundSettlement ? '' : 'disabled'}>`);
    parts.push('<button id="found-settlement-btn" ');
    parts.push(`style="padding:4px 10px; font-size:0.75em; background:${canFoundSettlement ? 'rgba(0,255,255,0.15)' : 'rgba(0,0,0,0.3)'}; `);
    parts.push(`border:1px solid ${canFoundSettlement ? 'rgba(0,255,255,0.4)' : 'rgba(0,255,255,0.1)'}; `);
    parts.push(`color:${canFoundSettlement ? '#00ffff' : '#4a5568'}; border-radius:4px; cursor:${canFoundSettlement ? 'pointer' : 'not-allowed'};" `);
    parts.push(`${canFoundSettlement ? '' : 'disabled'}>Found</button>`);
    parts.push('</div></div>');

    parts.push('</div>');
    networkMap.innerHTML = parts.join('');

    // ── Supply Lines ─────────────────────────────────────────────────────
    const slParts = [];

    if (supplyLines.length > 0) {
        slParts.push('<div style="margin-bottom:10px;">');
        for (const sl of supplyLines) {
            slParts.push('<div style="padding:6px 8px; margin-bottom:4px; background:rgba(0,0,0,0.2); border-radius:4px; display:flex; justify-content:space-between; align-items:center;">');
            slParts.push('<div style="font-size:0.75em;">');
            slParts.push(`<span style="color:#00ffff;">${sl.amount} ${escapeHtml(sl.resource)}/day</span> `);
            slParts.push(`${escapeHtml(sl.fromName)} &rarr; ${escapeHtml(sl.toName)}`);
            slParts.push('</div>');
            slParts.push(`<button data-action="remove-supply-line" data-supply-line-id="${sl.id}" `);
            slParts.push('style="padding:2px 8px; font-size:0.65em; background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.3); color:#ff6b6b; border-radius:4px; cursor:pointer;">');
            slParts.push('Remove</button>');
            slParts.push('</div>');
        }
        slParts.push('</div>');
    } else {
        slParts.push('<div style="font-size:0.75em; color:#4a5568; margin-bottom:10px;">No supply lines established.</div>');
    }

    // Create supply line form (only if unlocked and >= 2 settlements)
    if (settlements.length >= 2) {
        slParts.push('<div style="padding:8px; background:rgba(0,0,0,0.2); border-radius:6px;">');
        slParts.push(`<div style="font-size:0.8em; margin-bottom:6px; color:${canCreateSupplyLine ? '#00ffff' : '#4a5568'};">`);
        slParts.push(`Create Supply Line ${canCreateSupplyLine ? '' : '(Infrastructure Lv 4 + Trade Lv 2 required)'}`);
        slParts.push('</div>');

        const disabledAttr = canCreateSupplyLine ? '' : 'disabled';
        const selectStyle = 'padding:4px; font-size:0.7em; background:rgba(0,0,0,0.3); border:1px solid rgba(0,255,255,0.2); color:#ecf0f1; border-radius:4px; font-family:Orbitron,sans-serif;';

        slParts.push('<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">');

        // From settlement
        slParts.push(`<select id="sl-from" style="${selectStyle}" ${disabledAttr}>`);
        for (const s of settlements) {
            slParts.push(`<option value="${s.id}"${s.isCurrent ? ' selected' : ''}>${escapeHtml(s.name)}</option>`);
        }
        slParts.push('</select>');

        slParts.push('<span style="font-size:0.75em; color:#8892b0;">&rarr;</span>');

        // To settlement
        slParts.push(`<select id="sl-to" style="${selectStyle}" ${disabledAttr}>`);
        for (const s of settlements) {
            if (!s.isCurrent) {
                slParts.push(`<option value="${s.id}">${escapeHtml(s.name)}</option>`);
            }
        }
        slParts.push('</select>');

        // Resource
        const resources = ['food', 'water', 'wood', 'stone', 'clay', 'fiber', 'ore', 'herbs', 'fruit', 'sticks'];
        slParts.push(`<select id="sl-resource" style="${selectStyle}" ${disabledAttr}>`);
        for (const r of resources) {
            slParts.push(`<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`);
        }
        slParts.push('</select>');

        // Amount
        slParts.push(`<input type="number" id="sl-amount" value="5" min="1" max="50" style="${selectStyle} width:50px;" ${disabledAttr}>`);

        // Create button
        slParts.push('<button id="create-supply-line-btn" ');
        slParts.push(`style="padding:4px 10px; font-size:0.7em; background:${canCreateSupplyLine ? 'rgba(0,255,255,0.15)' : 'rgba(0,0,0,0.3)'}; `);
        slParts.push(`border:1px solid ${canCreateSupplyLine ? 'rgba(0,255,255,0.4)' : 'rgba(0,255,255,0.1)'}; `);
        slParts.push(`color:${canCreateSupplyLine ? '#00ffff' : '#4a5568'}; border-radius:4px; cursor:${canCreateSupplyLine ? 'pointer' : 'not-allowed'};" `);
        slParts.push(`${disabledAttr}>Create</button>`);

        slParts.push('</div></div>');
    }

    // Supply line list container for event delegation
    supplyLinesDiv.innerHTML = '<div id="supply-line-list">' + slParts.join('') + '</div>';
}

/** Escape HTML special characters for safe insertion into innerHTML. */
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/**
 * Pre-render ALL tabs so their content is ready before the player sees anything.
 * Called once during initialization, behind the splash screen.
 */
export function preRenderAllTabs() {
    updateHUD();
    updateDayNightCycle();
    updateTimeDisplay();
    updateTimeEmoji();
    updateTabBadges();
    updateSettlementTab();
    updateBookTab();
    updateCraftingTab();
    updateProductionTab();
    updateExplorationTab();
    updateWorldTab();
    updateNetworkTab();
    updateCraftingQueueDisplay();
    updateGatheringButtons();
}

/**
 * Master display update function. Called by the game loop every tick.
 * Updates the HUD always, and only renders the active tab for performance.
 */
export function updateDisplay() {
    updateHUD();
    updateDayNightCycle();
    updateTabBadges();

    // Only update the active tab for performance
    const activeTab = document.querySelector('.tab-panel.active');
    if (!activeTab) return;

    switch (activeTab.id) {
        case 'tab-settlement':
            updateSettlementTab();
            // World pseudo-tab lives inside settlement tab
            if (document.getElementById('world-view')?.style.display !== 'none') {
                updateWorldTab();
            }
            break;
        case 'tab-book':
            updateBookTab();
            break;
        case 'tab-crafting':
            updateCraftingTab();
            break;
        case 'tab-production':
            updateProductionTab();
            break;
        case 'tab-exploration':
            updateExplorationTab();
            break;
        case 'tab-world':
            updateWorldTab();
            break;
        case 'tab-network':
            // Network tab updates only when explicitly called or when tab is active
            updateNetworkTab();
            break;
    }

    // Queue display always updates (visible on crafting tab)
    updateCraftingQueueDisplay();
}


// ─── Initialization ────────────────────────────────────────────────────────────

/**
 * Initialize the UI systems. Call once after DOM is ready and game config is loaded.
 */
export function initUI() {
    initTabs();
}


// ─── Utilities ─────────────────────────────────────────────────────────────────

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelToLabel(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/Multiplier$|Rate$|Bonus$/, '')
        .trim()
        .toLowerCase()
        .replace(/^./, c => c.toUpperCase());
}
