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

import { gameState, getConfig, getResourceCap, getTotalHousing, computeUnlockedResources } from './gameState.js';
import { getEffect, getTotalAssignedWorkers } from './effects.js';
import { getSettlementList, getCurrentSettlement, isSettlementUnlocked, isSupplyLinesUnlocked, getInfrastructureLevel, getTradeLevel, getTotalPopulation } from './settlements.js';
import { getSupplyLines } from './network.js';


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
    updateBuiltBuildings();
    updateGatheringButtons();
    updateQuickStats();
}

function updateBuiltBuildings() {
    const container = document.getElementById('built-buildings');
    if (!container) return;

    let config;
    try { config = getConfig(); } catch { container.textContent = ''; return; }

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
 * Exported for backward compatibility with crafting.js/game.js.
 */
export function updateGatheringButtons() {
    const container = document.getElementById('gathering-buttons');
    if (!container) return;

    computeUnlockedResources();
    // Use the full list from state
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

        // Check if this button already exists (preserve progress bars during gathers)
        const existingBtn = document.getElementById('gather-' + resource);
        if (existingBtn) {
            // Update existing button state without destroying the DOM
            existingBtn.disabled = atCap || noWorkers;
            const countSpan = existingBtn.parentElement.querySelector('.resource-count');
            if (countSpan) countSpan.textContent = current + '/' + cap;
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
        btn.textContent = 'Gather ' + capitalize(resource);

        const countSpan = document.createElement('span');
        countSpan.className = 'resource-count';
        countSpan.textContent = current + '/' + cap;

        const barsContainer = document.createElement('div');
        barsContainer.id = resource + '-bars';
        barsContainer.style.cssText = 'flex:1;min-width:0;';

        gatherAction.appendChild(btn);
        gatherAction.appendChild(countSpan);
        gatherAction.appendChild(barsContainer);
        container.appendChild(gatherAction);
    }
}

function updateQuickStats() {
    const container = document.getElementById('quick-stats');
    if (!container) return;

    const stats = gameState.stats || {};

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
}

function updateStudySection() {
    const progressBar = document.getElementById('study-progress');
    if (progressBar) progressBar.value = gameState.studyProgress || 0;

    const gateInfo = document.getElementById('study-gate-info');
    if (gateInfo) {
        if (gameState.pendingPuzzle) {
            gateInfo.textContent = 'Puzzle waiting! Answer to unlock a blueprint.';
            gateInfo.style.color = '#e2b714';
        } else {
            gateInfo.textContent = '';
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
            ? config.items.filter(i => gameState.unlockedBlueprints.includes(i.id) && matchCategory(i, cat)).length
            : 0;
        const label = btn.dataset.label || btn.textContent.replace(/\s*\(\d+\)$/, '');
        btn.dataset.label = label;
        btn.textContent = count > 0 ? `${label} (${count})` : label;
    });

    // Get active category
    const activeBtn = document.querySelector('.cat-btn.active');
    const category = activeBtn ? activeBtn.dataset.category : 'tools';

    // Filter unlocked blueprints by category
    const items = config.items
        ? config.items.filter(i =>
            gameState.unlockedBlueprints.includes(i.id) &&
            matchCategory(i, category)
          )
        : [];

    while (container.firstChild) container.removeChild(container.firstChild);

    if (items.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No items available in this category. Unlock more blueprints by studying the Book.';
        container.appendChild(p);
        return;
    }

    for (const item of items) {
        const costText = formatCost(item.cost || {});
        const canAfford = checkCost(item.cost || {});
        const effectText = formatEffectsText(item.effect || {});

        const wrapper = document.createElement('div');
        wrapper.className = 'craft-btn-wrapper';

        const btn = document.createElement('button');
        btn.className = 'craft-item-btn';
        btn.dataset.itemId = item.id;
        btn.disabled = !canAfford;
        btn.textContent = item.name;
        if (costText) {
            const costSpan = document.createElement('span');
            costSpan.style.cssText = 'font-size:0.85em; color:#7f8c8d; margin-left:6px;';
            costSpan.textContent = '[' + costText + ']';
            btn.appendChild(costSpan);
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'item-tooltip';

        const tooltipName = document.createElement('div');
        tooltipName.className = 'tooltip-name';
        tooltipName.textContent = item.name;
        tooltip.appendChild(tooltipName);

        if (item.description) {
            const tooltipDesc = document.createElement('div');
            tooltipDesc.className = 'tooltip-desc';
            tooltipDesc.textContent = item.description;
            tooltip.appendChild(tooltipDesc);
        }

        if (effectText) {
            const tooltipEffect = document.createElement('div');
            tooltipEffect.className = 'tooltip-effect';
            tooltipEffect.textContent = effectText;
            tooltip.appendChild(tooltipEffect);
        }

        if (item.craftTime) {
            const tooltipTime = document.createElement('div');
            tooltipTime.className = 'tooltip-time';
            tooltipTime.textContent = 'Time: ' + item.craftTime + 's';
            tooltip.appendChild(tooltipTime);
        }

        wrapper.appendChild(btn);
        wrapper.appendChild(tooltip);
        container.appendChild(wrapper);
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

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!gameState.explorations || gameState.explorations.length === 0) {
        const p = document.createElement('p');
        p.className = 'dim';
        p.textContent = 'No active expeditions.';
        container.appendChild(p);
        return;
    }

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
export function updateDayNightCycle() {
    const el = document.getElementById('day-night-cycle');
    if (!el) return;

    let config;
    try { config = getConfig(); } catch { return; }

    const dayLength = config.constants ? (config.constants.DAY_LENGTH || 600) : 600;
    const isNight = gameState.time > dayLength / 2;
    el.classList.toggle('night', isNight);
}


// ─── Time Display (backward compat) ───────────────────────────────────────────

/**
 * Update time display in HUD. In the new layout, time is embedded in the day display.
 * Kept for backward compatibility with game.js.
 */
export function updateTimeDisplay() {
    // The new HUD doesn't have a separate time-display span.
    // If one exists (from old HTML), update it.
    const el = document.getElementById('time-display');
    if (!el) return;

    let config;
    try { config = getConfig(); } catch { return; }

    const dayLength = config.constants ? (config.constants.DAY_LENGTH || 600) : 600;
    const hours = Math.floor((gameState.time / dayLength) * 24);
    const minutes = Math.floor(((gameState.time / dayLength) * 24 - hours) * 60);
    el.textContent = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

/**
 * Update time emoji in HUD (backward compat).
 */
export function updateTimeEmoji() {
    const el = document.getElementById('time-emoji');
    if (!el) return;

    let config;
    try { config = getConfig(); } catch { return; }

    const dayLength = config.constants ? (config.constants.DAY_LENGTH || 600) : 600;
    const progress = gameState.time / dayLength;

    if (progress < 0.25) el.textContent = '\u{1F305}';
    else if (progress < 0.5) el.textContent = '\u{2600}\uFE0F';
    else if (progress < 0.75) el.textContent = '\u{1F307}';
    else el.textContent = '\u{1F319}';
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
 * Master display update function. Called by the game loop every tick.
 * Updates the HUD always, and only renders the active tab for performance.
 */
export function updateDisplay() {
    updateHUD();
    updateDayNightCycle();

    // Only update the active tab for performance
    const activeTab = document.querySelector('.tab-panel.active');
    if (!activeTab) return;

    switch (activeTab.id) {
        case 'tab-settlement':
            updateSettlementTab();
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
