/**
 * settlements.js
 *
 * Core multi-settlement management system (v2 architecture).
 *
 * Settlements are independent colonies the player can found once they reach
 * sufficient infrastructure.  Each settlement has its own resource pools,
 * population, buildings (SINGLE + MULTIPLE), weather, seasons, etc.
 *
 * Certain "global" data travels with the player when switching settlements:
 * knowledge, unlocked blueprints, tool levels, currency, achievements,
 * completedQuests, and aggregate stats.
 *
 * Settlement snapshots are stored in gameState.settlements[].  The currently
 * active settlement is identified by gameState.settlementId.
 *
 * v2 key differences from v1:
 *   - No craftedItems — buildings stored in gameState.buildings (SINGLE),
 *     gameState.multipleBuildings (MULTIPLE), gameState.tools (portable)
 *   - Resources stored in gameState.resources.X (not gameState.food etc.)
 *   - Infrastructure/trade levels from getBuildingLevel('infrastructure')
 *     and getBuildingLevel('trade')
 *   - resetSettlementState() clears settlement-local state properly
 */

import { gameState, getBuildingLevel, getTotalCraftedCount, resetSettlementState } from './gameState.js';
import { logEvent } from './ui.js';
import { clearActiveIntervals, resetGathering } from './resources.js';
import { clearCraftingInterval } from './crafting.js';
import { resetActiveEvents } from './events.js';

// ---------------------------------------------------------------------------
// Initialisation — call once at game start to bootstrap settlement state
// ---------------------------------------------------------------------------

/**
 * Ensure the settlement array is properly initialised.
 * Safe to call multiple times (idempotent).
 */
export function initSettlements() {
    if (!gameState.settlements) {
        gameState.settlements = [];
    }

    // Register the first settlement if it doesn't exist yet
    if (gameState.settlements.length === 0) {
        gameState.settlements.push({
            id: gameState.settlementId || 'settlement_1',
            name: gameState.settlementName || 'Camp',
            biome: gameState.biome || 'forest',
            founded: gameState.day || 1
        });
    }
}

// ---------------------------------------------------------------------------
// Settlement unlock check
// ---------------------------------------------------------------------------

/**
 * Return the infrastructure chain level for the current settlement.
 * In v2, this is simply the level of the 'infrastructure' SINGLE building chain.
 */
export function getInfrastructureLevel() {
    return getBuildingLevel('infrastructure');
}

/**
 * Return the trade chain level for the current settlement.
 * In v2, this is the level of the 'trade' SINGLE building chain.
 */
export function getTradeLevel() {
    return getBuildingLevel('trade');
}

/**
 * Check whether the player can found new settlements.
 * Requires infrastructure chain level >= 3.
 */
export function isSettlementUnlocked() {
    return getInfrastructureLevel() >= 3;
}

/**
 * Check whether supply lines are unlocked.
 * Requires infrastructure chain level >= 4 and trade chain level >= 2.
 */
export function isSupplyLinesUnlocked() {
    return getInfrastructureLevel() >= 4 && getTradeLevel() >= 2;
}

// ---------------------------------------------------------------------------
// Settlement Snapshot Keys
// ---------------------------------------------------------------------------

/**
 * The set of gameState keys that belong to a single settlement and must be
 * saved/restored when switching.  These reflect the v2 state structure.
 *
 * Everything else is either "global" (travels with the player) or computed
 * at runtime.
 */
const SETTLEMENT_SNAPSHOT_KEYS = [
    // Resources (nested object)
    'resources',
    // Buildings
    'buildings',
    'multipleBuildings',
    // Population
    'population', 'availableWorkers', 'populationMembers',
    // Time
    'day', 'time',
    // Season / Weather
    'currentSeason', 'currentWeather',
    // Crafting
    'craftingQueue',
    // Automation
    'automationAssignments',
    // Gathering
    'gatheringEfficiency', 'gatheringModifiers', 'unlockedResources',
    // Study
    'currentChapter', 'studyProgress', 'pendingPuzzle', 'studyGateProgress',
    // Events
    'activeEvents', 'seenMilestones',
    // Trading
    'traderVisits', 'activeTrades',
    // Exploration
    'explorations', 'discoveredLocations', 'discoveredSettlementSites',
    // Quests
    'activeQuests',
    // Factions
    'factions',
    // Stats (per-settlement)
    'stats'
];

// ---------------------------------------------------------------------------
// Settlement CRUD
// ---------------------------------------------------------------------------

/**
 * Build a snapshot of the current settlement's state from gameState.
 * Complex objects are deep-copied to prevent cross-settlement mutation.
 */
function snapshotSettlement() {
    const snapshot = {};
    for (const key of SETTLEMENT_SNAPSHOT_KEYS) {
        const val = gameState[key];
        if (val === undefined || val === null) {
            snapshot[key] = val;
        } else if (typeof val === 'object') {
            snapshot[key] = JSON.parse(JSON.stringify(val));
        } else {
            snapshot[key] = val;
        }
    }

    // Also capture settlement identity
    snapshot.settlementId = gameState.settlementId;
    snapshot.settlementName = gameState.settlementName;
    snapshot.biome = gameState.biome;

    return snapshot;
}

/**
 * Restore a snapshot onto gameState, overwriting settlement-specific keys.
 * Uses deep-copy for objects to prevent mutation across snapshots.
 */
function restoreSettlement(snapshot) {
    for (const key of SETTLEMENT_SNAPSHOT_KEYS) {
        if (!(key in snapshot)) continue;
        const val = snapshot[key];
        if (val === undefined || val === null) {
            gameState[key] = val;
        } else if (typeof val === 'object') {
            gameState[key] = JSON.parse(JSON.stringify(val));
        } else {
            gameState[key] = val;
        }
    }

    // Restore settlement identity
    if (snapshot.settlementId) gameState.settlementId = snapshot.settlementId;
    if (snapshot.settlementName) gameState.settlementName = snapshot.settlementName;
    if (snapshot.biome) gameState.biome = snapshot.biome;
}

/**
 * Sync global state FROM gameState (call before switching away).
 * In v2, global fields live directly on gameState (knowledge, unlockedBlueprints,
 * tools, toolLevels, currency, achievements, completedQuests, etc.)
 * and are NOT in SETTLEMENT_SNAPSHOT_KEYS, so they persist across switches.
 * This function is a no-op checkpoint — kept for clarity and future extension.
 */
function syncGlobalFromState() {
    // Global fields are already on gameState and excluded from snapshot keys.
    // Nothing to do — they persist naturally when we only overwrite snapshot keys.
}

/**
 * Create a brand-new settlement.
 * Initialises it with fresh resource/population state.
 * Returns the new settlement's ID, or null if founding is not allowed.
 *
 * @param {string} name - The name for the new settlement.
 * @returns {string|null} The new settlement ID or null.
 */
export function createSettlement(name) {
    if (!isSettlementUnlocked()) {
        logEvent('Cannot found a settlement yet. Build more infrastructure (need level 3).');
        return null;
    }

    // Cap at 5 settlements for balance
    if (gameState.settlements.length >= 5) {
        logEvent('Maximum number of settlements reached (5).');
        return null;
    }

    // Save current settlement first
    saveCurrentSettlement();

    const id = 'settlement_' + Date.now();
    const settlementName = name || ('Settlement ' + (gameState.settlements.length + 1));

    // Register the settlement
    gameState.settlements.push({
        id: id,
        name: settlementName,
        biome: 'forest',
        founded: gameState.day || 1
    });

    // Clear live timers/intervals before resetting state
    clearActiveIntervals();
    clearCraftingInterval();
    resetGathering();
    resetActiveEvents();

    // Reset settlement-local state to fresh defaults
    // This preserves global fields (knowledge, blueprints, tools, currency, etc.)
    resetSettlementState();

    // Set the new settlement's identity
    gameState.settlementId = id;
    gameState.settlementName = settlementName;

    logEvent(`New settlement "${settlementName}" founded!`);

    return id;
}

/**
 * Save the current settlement's state into its slot in gameState.settlements.
 */
function saveCurrentSettlement() {
    syncGlobalFromState();
    const snapshot = snapshotSettlement();
    const entry = gameState.settlements.find(s => s.id === gameState.settlementId);
    if (entry) {
        entry._snapshot = snapshot;
    }
}

/**
 * Switch to a different settlement.
 * Saves current settlement, clears live intervals/timers, restores target.
 *
 * @param {string} settlementId - The ID of the settlement to switch to.
 * @returns {boolean} True if switch succeeded.
 */
export function switchSettlement(settlementId) {
    if (settlementId === gameState.settlementId) {
        return true; // already here
    }

    const target = gameState.settlements.find(s => s.id === settlementId);
    if (!target) {
        logEvent('Settlement not found.');
        return false;
    }

    // Save current state
    saveCurrentSettlement();

    // Clear live timers/intervals that are per-settlement
    clearActiveIntervals();
    clearCraftingInterval();
    resetGathering();
    resetActiveEvents();

    // Restore target settlement
    if (target._snapshot) {
        restoreSettlement(target._snapshot);
    } else {
        // No snapshot means this is a freshly created settlement with no prior state
        resetSettlementState();
        gameState.settlementId = settlementId;
        gameState.settlementName = target.name;
        gameState.biome = target.biome || 'forest';
    }

    logEvent(`Switched to "${target.name}".`);
    return true;
}

/**
 * Get a list of all settlements with summary info.
 * @returns {Array<Object>}
 */
export function getSettlementList() {
    return gameState.settlements.map(s => {
        const isCurrent = s.id === gameState.settlementId;
        // Use live state for current settlement, snapshot for others
        const snap = isCurrent ? null : (s._snapshot || {});

        const pop = isCurrent ? gameState.population : (snap.population || 1);
        const food = isCurrent ? gameState.resources.food : (snap.resources?.food || 0);
        const water = isCurrent ? gameState.resources.water : (snap.resources?.water || 0);
        const day = isCurrent ? gameState.day : (snap.day || 1);

        // Building count: use getTotalCraftedCount() for current, or count from snapshot
        let craftedCount;
        if (isCurrent) {
            craftedCount = getTotalCraftedCount();
        } else {
            craftedCount = _snapshotCraftedCount(snap);
        }

        // Infrastructure level
        let infraLevel;
        if (isCurrent) {
            infraLevel = getInfrastructureLevel();
        } else {
            infraLevel = _snapshotInfraLevel(snap);
        }

        // Trade level
        let tradeLevel;
        if (isCurrent) {
            tradeLevel = getTradeLevel();
        } else {
            tradeLevel = _snapshotTradeLevel(snap);
        }

        return {
            id: s.id,
            name: s.name,
            founded: s.founded,
            biome: s.biome || 'forest',
            isCurrent: isCurrent,
            population: pop,
            food: Math.floor(food),
            water: Math.floor(water),
            day: day,
            craftedCount: craftedCount,
            infraLevel: infraLevel,
            tradeLevel: tradeLevel
        };
    });
}

/**
 * Helper: compute infrastructure level from a snapshot's buildings.
 */
function _snapshotInfraLevel(snapshot) {
    return snapshot?.buildings?.infrastructure?.level || 0;
}

/**
 * Helper: compute trade level from a snapshot's buildings.
 */
function _snapshotTradeLevel(snapshot) {
    return snapshot?.buildings?.trade?.level || 0;
}

/**
 * Helper: count total crafted items from a snapshot's building data.
 */
function _snapshotCraftedCount(snapshot) {
    if (!snapshot) return 0;
    let count = 0;

    // SINGLE buildings with level > 0
    if (snapshot.buildings) {
        for (const chainId of Object.keys(snapshot.buildings)) {
            if (snapshot.buildings[chainId]?.level > 0) count++;
        }
    }

    // MULTIPLE building instances
    if (snapshot.multipleBuildings) {
        for (const chainId of Object.keys(snapshot.multipleBuildings)) {
            count += (snapshot.multipleBuildings[chainId] || []).length;
        }
    }

    return count;
}

/**
 * Get the current settlement's info.
 * @returns {Object}
 */
export function getCurrentSettlement() {
    const entry = gameState.settlements.find(s => s.id === gameState.settlementId);
    return entry || {
        id: gameState.settlementId,
        name: gameState.settlementName || 'Camp',
        biome: gameState.biome || 'forest',
        founded: 1
    };
}

/**
 * Called before saving the game to ensure all settlement data is fresh.
 */
export function prepareForSave() {
    saveCurrentSettlement();
}

/**
 * Get the total population across all settlements.
 */
export function getTotalPopulation() {
    let total = 0;
    for (const s of gameState.settlements) {
        if (s.id === gameState.settlementId) {
            total += gameState.population || 0;
        } else if (s._snapshot) {
            total += s._snapshot.population || 0;
        }
    }
    return total;
}

/**
 * Get a resource amount from a specific settlement (by snapshot).
 * For the current settlement, reads live gameState.resources.
 *
 * @param {string} settlementId
 * @param {string} resource
 * @returns {number}
 */
export function getSettlementResource(settlementId, resource) {
    if (settlementId === gameState.settlementId) {
        return gameState.resources[resource] || 0;
    }
    const entry = gameState.settlements.find(s => s.id === settlementId);
    if (entry && entry._snapshot && entry._snapshot.resources) {
        return entry._snapshot.resources[resource] || 0;
    }
    return 0;
}

/**
 * Modify a resource in a specific settlement.
 * For the current settlement, modifies live gameState.resources.
 * For others, modifies the snapshot's resources.
 *
 * @param {string} settlementId
 * @param {string} resource
 * @param {number} delta - amount to add (negative to subtract)
 */
export function modifySettlementResource(settlementId, resource, delta) {
    if (settlementId === gameState.settlementId) {
        gameState.resources[resource] = Math.max(0, (gameState.resources[resource] || 0) + delta);
    } else {
        const entry = gameState.settlements.find(s => s.id === settlementId);
        if (entry && entry._snapshot) {
            if (!entry._snapshot.resources) entry._snapshot.resources = {};
            entry._snapshot.resources[resource] = Math.max(
                0,
                (entry._snapshot.resources[resource] || 0) + delta
            );
        }
    }
}
