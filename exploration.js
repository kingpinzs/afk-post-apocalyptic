import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { addResource } from './resources.js';
import { getEffect } from './effects.js';

/**
 * Check if exploration is unlocked (watchtower is built).
 * @returns {boolean}
 */
export function isExplorationUnlocked() {
    return !!gameState.craftedItems.watchtower;
}

/**
 * Get available exploration locations based on knowledge and items.
 * Hidden locations only surface when the space_program's resourceDiscoveryChance > 0.
 * @returns {Array} Filtered array of location config objects.
 */
export function getAvailableLocations() {
    const config = getConfig();
    const locations = config.explorationLocations || [];

    return locations.filter(loc => {
        // Already fully explored?
        const exploration = (gameState.explorations || []).find(e => e.id === loc.id);
        if (exploration && exploration.completed) return false;

        // Knowledge requirement
        if (loc.knowledgeRequired && gameState.knowledge < loc.knowledgeRequired) return false;

        // Item requirement
        if (loc.requiresItem && !gameState.craftedItems[loc.requiresItem]) return false;

        // resourceDiscoveryChance (space_program) unlocks hidden locations
        if (loc.hidden) {
            const discoveryChance = getEffect('resourceDiscoveryChance');
            if (discoveryChance <= 0) return false;
        }

        return true;
    });
}

/**
 * Start exploring a location (consumes a worker for a duration).
 * @param {string} locationId
 * @returns {boolean} True if exploration started successfully.
 */
export function startExploration(locationId) {
    if (gameState.availableWorkers <= 0) {
        logEvent("No available workers for exploration.");
        return false;
    }

    const config = getConfig();
    const location = (config.explorationLocations || []).find(l => l.id === locationId);
    if (!location) return false;

    // Check if already exploring this location
    const existing = (gameState.explorations || []).find(e => e.id === locationId);
    if (existing && existing.inProgress) {
        logEvent("Already exploring this location.");
        return false;
    }

    gameState.availableWorkers--;

    // navigationEfficiencyMultiplier (telescope) reduces exploration time
    let duration = location.explorationTime;
    const navEff = getEffect('navigationEfficiencyMultiplier');
    if (navEff > 1) duration = Math.max(1, Math.floor(duration / navEff));

    const exploration = {
        id: locationId,
        name: location.name,
        inProgress: true,
        completed: false,
        daysRemaining: duration,
        startDay: gameState.day
    };

    gameState.explorations = gameState.explorations || [];
    // Replace existing entry or push new one
    const idx = gameState.explorations.findIndex(e => e.id === locationId);
    if (idx >= 0) {
        gameState.explorations[idx] = exploration;
    } else {
        gameState.explorations.push(exploration);
    }

    logEvent(`Started exploring ${location.name}. Estimated ${duration} days.`);
    updateDisplay();
    return true;
}

/**
 * Update exploration progress (called once per day).
 * Decrements daysRemaining and triggers completion when it hits 0.
 */
export function updateExplorations() {
    if (!isExplorationUnlocked()) return;

    const config = getConfig();
    const locations = config.explorationLocations || [];

    (gameState.explorations || []).forEach(exploration => {
        if (!exploration.inProgress) return;

        exploration.daysRemaining--;

        if (exploration.daysRemaining <= 0) {
            exploration.inProgress = false;
            exploration.completed = true;
            gameState.availableWorkers++;

            const location = locations.find(l => l.id === exploration.id);
            if (location) {
                completeExploration(location);
            }
        }
    });
}

/**
 * Apply the rewards for a completed exploration.
 * Uses resourceDiscoveryMultiplier (watchtower) to scale rewards
 * and resourceDiscoveryRate (alchemist_lab) for bonus rolls.
 * @param {Object} location - The location config object.
 */
function completeExploration(location) {
    logEvent(`Exploration of ${location.name} complete!`);

    // resourceDiscoveryMultiplier (watchtower) increases reward amounts
    const discoveryMult = getEffect('resourceDiscoveryMultiplier');

    // resourceDiscoveryRate (alchemist_lab) chance for bonus resources
    const discoveryRate = getEffect('resourceDiscoveryRate');

    // Apply rewards
    if (location.rewards) {
        Object.entries(location.rewards).forEach(([resource, amount]) => {
            let finalAmount = Math.ceil(amount * discoveryMult);

            // Bonus from discovery rate
            if (discoveryRate > 0 && Math.random() < discoveryRate) {
                finalAmount = Math.ceil(finalAmount * 1.5);
                logEvent(`Bonus discovery! Extra ${resource} found.`);
            }

            if (resource === 'knowledge') {
                gameState.knowledge += finalAmount;
                gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
            } else if (resource in gameState) {
                addResource(resource, finalAmount);
            }
            logEvent(`Found ${finalAmount} ${resource}.`);
        });
    }

    // Show lore text
    if (location.lore) {
        logEvent(`Lore: ${location.lore}`);
    }

    // Track stats
    gameState.stats.totalExplored = (gameState.stats.totalExplored || 0) + 1;

    updateDisplay();
}
