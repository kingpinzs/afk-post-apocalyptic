import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { addResource } from './resources.js';
import { getEffect } from './effects.js';
import { removePopulationMember } from './population.js';

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
    const config = getConfig();
    const location = (config.explorationLocations || []).find(l => l.id === locationId);
    if (!location) return false;

    const workersNeeded = location.workersRequired || 1;

    if (gameState.availableWorkers < workersNeeded) {
        logEvent(`Need ${workersNeeded} workers for this exploration. Only ${gameState.availableWorkers} available.`);
        return false;
    }

    // Check if already exploring this location
    const existing = (gameState.explorations || []).find(e => e.id === locationId);
    if (existing && existing.inProgress) {
        logEvent("Already exploring this location.");
        return false;
    }

    gameState.availableWorkers -= workersNeeded;

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
        startDay: gameState.day,
        workersOut: workersNeeded
    };

    gameState.explorations = gameState.explorations || [];
    // Replace existing entry or push new one
    const idx = gameState.explorations.findIndex(e => e.id === locationId);
    if (idx >= 0) {
        gameState.explorations[idx] = exploration;
    } else {
        gameState.explorations.push(exploration);
    }

    logEvent(`Sent ${workersNeeded} workers to explore ${location.name}. Estimated ${duration} days.`);
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

            const location = locations.find(l => l.id === exploration.id);
            if (location) {
                completeExploration(location, exploration);
            } else {
                // Fallback: return workers if location config missing
                gameState.availableWorkers += (exploration.workersOut || 1);
            }
        }
    });
}

/**
 * Apply the rewards for a completed exploration and roll for hazards.
 * Uses resourceDiscoveryMultiplier (watchtower) to scale rewards
 * and resourceDiscoveryRate (alchemist_lab) for bonus rolls.
 * @param {Object} location - The location config object.
 * @param {Object} exploration - The exploration state object.
 */
function completeExploration(location, exploration) {
    const workersOut = exploration.workersOut || 1;
    const healthMult = getEffect('populationHealthMultiplier');

    // --- Exploration hazards ---
    // Each worker has a chance of dying or getting sick.
    // Longer/harder explorations are more dangerous.
    const dangerScale = location.explorationTime / 3; // baseline 3 days = 1x
    let workersLost = 0;
    let workersSickened = 0;

    for (let i = 0; i < workersOut; i++) {
        // Death chance: 5% base, scaled by danger, reduced by health upgrades
        const deathChance = 0.05 * dangerScale / Math.max(1, healthMult);
        if (Math.random() < deathChance) {
            workersLost++;
            continue;
        }
        // Sickness chance: 20% base, reduced by health upgrades
        const sickChance = 0.20 / Math.max(1, healthMult);
        if (Math.random() < sickChance) {
            workersSickened++;
        }
    }

    // Apply deaths
    for (let i = 0; i < workersLost; i++) {
        gameState.population = Math.max(1, gameState.population - 1);
        removePopulationMember();
    }

    // Apply sickness to random healthy members
    const healthyMembers = (gameState.populationMembers || []).filter(m => !m.sick);
    for (let i = 0; i < workersSickened && i < healthyMembers.length; i++) {
        healthyMembers[i].sick = true;
        healthyMembers[i].sickDaysRemaining = 3 + Math.floor(Math.random() * 3);
    }

    // Return surviving healthy workers (sick ones stay unavailable until recovered)
    const healthyReturning = workersOut - workersLost - workersSickened;
    gameState.availableWorkers += Math.max(0, healthyReturning);

    // Log results
    logEvent(`Exploration of ${location.name} complete!`);
    if (workersLost > 0) {
        logEvent(`${workersLost} worker${workersLost > 1 ? 's' : ''} did not return from ${location.name}.`);
    }
    if (workersSickened > 0) {
        const sickNames = healthyMembers.slice(0, workersSickened).map(m => m.name).join(', ');
        logEvent(`${sickNames} returned from exploration feeling ill.`);
    }
    if (healthyReturning > 0 && workersLost === 0 && workersSickened === 0) {
        logEvent(`All ${healthyReturning} workers returned safely.`);
    }

    // --- Apply rewards ---
    // resourceDiscoveryMultiplier (watchtower) increases reward amounts
    const discoveryMult = getEffect('resourceDiscoveryMultiplier');

    // resourceDiscoveryRate (alchemist_lab) chance for bonus resources
    const discoveryRate = getEffect('resourceDiscoveryRate');

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
