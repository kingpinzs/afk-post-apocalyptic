/**
 * network.js
 *
 * Inter-settlement supply line and network management (v2 architecture).
 *
 * Supply lines are recurring daily resource transfers between settlements.
 * They require infrastructure chain level >= 4 and trade chain level >= 2
 * in the SOURCE settlement.  Each supply line costs 1 worker from the source.
 *
 * Supply lines are stored in gameState.supplyLines[] and processed once
 * per day via processSupplyLines().
 *
 * v2 key differences from v1:
 *   - Infrastructure/trade levels from getBuildingLevel() instead of
 *     counting craftedItems
 *   - Resources accessed via gameState.resources.X (not gameState.food etc.)
 *   - Snapshot infrastructure/trade checks use snapshot.buildings.X.level
 */

import { gameState } from './gameState.js';
import { logEvent } from './ui.js';
import {
    getSettlementResource,
    modifySettlementResource,
    getSettlementList,
    isSupplyLinesUnlocked
} from './settlements.js';

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Ensure the supplyLines array exists on gameState.
 * Safe to call multiple times.
 */
export function initNetwork() {
    if (!gameState.supplyLines) {
        gameState.supplyLines = [];
    }
}

// ---------------------------------------------------------------------------
// Supply line CRUD
// ---------------------------------------------------------------------------

/**
 * Valid resources that can be transferred via supply lines.
 */
const TRANSFERABLE_RESOURCES = [
    'food', 'water', 'wood', 'stone', 'clay', 'fiber', 'ore', 'herbs', 'fruit',
    'sticks', 'sand', 'boards', 'metal', 'glass', 'leather', 'cloth', 'bricks',
    'fuel', 'medicine', 'paper', 'hides'
];

/**
 * Check if a given settlement (possibly not the current one) meets the
 * infrastructure and trade requirements for supply lines.
 *
 * For the current settlement, uses live gameState.buildings via getBuildingLevel().
 * For other settlements, checks the snapshot's buildings directly.
 *
 * @param {string} settlementId
 * @returns {boolean}
 */
function settlementCanSourceSupplyLine(settlementId) {
    if (settlementId === gameState.settlementId) {
        // Current settlement — use live state
        return isSupplyLinesUnlocked();
    }

    // Other settlement — check snapshot
    const entry = (gameState.settlements || []).find(s => s.id === settlementId);
    if (!entry || !entry._snapshot) return false;

    const snap = entry._snapshot;
    const infraLevel = snap.buildings?.infrastructure?.level || 0;
    const tradeLevel = snap.buildings?.trade?.level || 0;
    return infraLevel >= 4 && tradeLevel >= 2;
}

/**
 * Create a new supply line between two settlements.
 *
 * @param {string} fromSettlementId - Source settlement ID
 * @param {string} toSettlementId   - Destination settlement ID
 * @param {string} resource         - Resource to transfer
 * @param {number} amount           - Amount per day
 * @returns {string|null} The supply line ID, or null on failure.
 */
export function createSupplyLine(fromSettlementId, toSettlementId, resource, amount) {
    initNetwork();

    // Validate inputs
    if (!fromSettlementId || !toSettlementId || fromSettlementId === toSettlementId) {
        logEvent('Supply line must connect two different settlements.');
        return null;
    }

    if (!TRANSFERABLE_RESOURCES.includes(resource)) {
        logEvent(`Cannot create supply line for "${resource}".`);
        return null;
    }

    amount = Math.max(1, Math.floor(amount));
    if (amount <= 0 || isNaN(amount)) {
        logEvent('Supply line amount must be at least 1.');
        return null;
    }

    // Check that both settlements exist
    const settlements = gameState.settlements || [];
    const fromEntry = settlements.find(s => s.id === fromSettlementId);
    const toEntry = settlements.find(s => s.id === toSettlementId);
    if (!fromEntry || !toEntry) {
        logEvent('One or both settlements not found.');
        return null;
    }

    // Check infrastructure/trade requirements on the source settlement
    if (!settlementCanSourceSupplyLine(fromSettlementId)) {
        logEvent('Source settlement needs Infrastructure level 4+ and Trade level 2+ for supply lines.');
        return null;
    }

    // Check worker availability in source settlement
    if (fromSettlementId === gameState.settlementId) {
        if (gameState.availableWorkers < 1) {
            logEvent('No available workers in source settlement for the supply line.');
            return null;
        }
    } else {
        const snap = fromEntry._snapshot || {};
        const snapAvailable = (snap.availableWorkers || 0);
        if (snapAvailable < 1) {
            logEvent('No available workers in source settlement for the supply line.');
            return null;
        }
    }

    // Limit supply lines per route: max 3 per source-destination pair
    const existing = gameState.supplyLines.filter(
        sl => sl.from === fromSettlementId && sl.to === toSettlementId
    );
    if (existing.length >= 3) {
        logEvent('Maximum 3 supply lines between these settlements.');
        return null;
    }

    // Create the supply line
    const id = 'sl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    gameState.supplyLines.push({
        id: id,
        from: fromSettlementId,
        to: toSettlementId,
        resource: resource,
        amount: amount,
        active: true,
        createdDay: gameState.day || 1
    });

    // Deduct worker from source
    if (fromSettlementId === gameState.settlementId) {
        gameState.availableWorkers = Math.max(0, gameState.availableWorkers - 1);
    } else if (fromEntry._snapshot) {
        fromEntry._snapshot.availableWorkers = Math.max(0, (fromEntry._snapshot.availableWorkers || 0) - 1);
    }

    logEvent(`Supply line created: ${amount} ${resource}/day from "${fromEntry.name}" to "${toEntry.name}".`);
    return id;
}

/**
 * Remove (cancel) an existing supply line.
 * Returns the worker to the source settlement.
 *
 * @param {string} supplyLineId
 * @returns {boolean} True if removed successfully.
 */
export function removeSupplyLine(supplyLineId) {
    initNetwork();

    const idx = gameState.supplyLines.findIndex(sl => sl.id === supplyLineId);
    if (idx === -1) {
        logEvent('Supply line not found.');
        return false;
    }

    const sl = gameState.supplyLines[idx];

    // Return worker to source settlement
    if (sl.from === gameState.settlementId) {
        gameState.availableWorkers = (gameState.availableWorkers || 0) + 1;
    } else {
        const entry = (gameState.settlements || []).find(s => s.id === sl.from);
        if (entry && entry._snapshot) {
            entry._snapshot.availableWorkers = (entry._snapshot.availableWorkers || 0) + 1;
        }
    }

    // Find settlement names for the log message
    const fromEntry = (gameState.settlements || []).find(s => s.id === sl.from);
    const toEntry = (gameState.settlements || []).find(s => s.id === sl.to);
    const fromName = fromEntry ? fromEntry.name : sl.from;
    const toName = toEntry ? toEntry.name : sl.to;

    gameState.supplyLines.splice(idx, 1);

    logEvent(`Supply line removed: ${sl.resource} from "${fromName}" to "${toName}".`);
    return true;
}

/**
 * Get all active supply lines.
 * @returns {Array<Object>}
 */
export function getSupplyLines() {
    initNetwork();
    return gameState.supplyLines.map(sl => {
        const fromEntry = (gameState.settlements || []).find(s => s.id === sl.from);
        const toEntry = (gameState.settlements || []).find(s => s.id === sl.to);
        return {
            ...sl,
            fromName: fromEntry ? fromEntry.name : sl.from,
            toName: toEntry ? toEntry.name : sl.to
        };
    });
}

// ---------------------------------------------------------------------------
// Daily processing
// ---------------------------------------------------------------------------

/**
 * Process all active supply lines.  Called once per day from the game loop.
 *
 * For each supply line, if the source settlement has enough of the resource,
 * transfer the specified amount to the destination.  If the source doesn't
 * have enough, transfer what's available (partial transfer).
 */
export function processSupplyLines() {
    initNetwork();

    for (const sl of gameState.supplyLines) {
        if (!sl.active) continue;

        const available = getSettlementResource(sl.from, sl.resource);
        const transfer = Math.min(sl.amount, available);
        if (transfer <= 0) continue;

        // Deduct from source, add to destination
        modifySettlementResource(sl.from, sl.resource, -transfer);
        modifySettlementResource(sl.to, sl.resource, transfer);

        // Only log if it affects the current settlement
        if (sl.from === gameState.settlementId || sl.to === gameState.settlementId) {
            const fromEntry = (gameState.settlements || []).find(s => s.id === sl.from);
            const toEntry = (gameState.settlements || []).find(s => s.id === sl.to);
            const fromName = fromEntry ? fromEntry.name : sl.from;
            const toName = toEntry ? toEntry.name : sl.to;

            if (transfer < sl.amount) {
                logEvent(`Supply line: ${transfer}/${sl.amount} ${sl.resource} sent from "${fromName}" to "${toName}" (low stock).`);
            } else {
                logEvent(`Supply line: ${transfer} ${sl.resource} sent from "${fromName}" to "${toName}".`);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Network summary
// ---------------------------------------------------------------------------

/**
 * Get a high-level overview of the settlement network.
 * @returns {Object}
 */
export function getNetworkSummary() {
    const settlements = getSettlementList();
    const supplyLines = getSupplyLines();

    // Calculate total daily transfers per resource
    const dailyTransfers = {};
    for (const sl of supplyLines) {
        if (!dailyTransfers[sl.resource]) {
            dailyTransfers[sl.resource] = 0;
        }
        dailyTransfers[sl.resource] += sl.amount;
    }

    // Workers assigned to supply lines per settlement
    const workersAssigned = {};
    for (const sl of supplyLines) {
        workersAssigned[sl.from] = (workersAssigned[sl.from] || 0) + 1;
    }

    return {
        settlementCount: settlements.length,
        settlements: settlements,
        supplyLineCount: supplyLines.length,
        supplyLines: supplyLines,
        dailyTransfers: dailyTransfers,
        workersAssigned: workersAssigned
    };
}
