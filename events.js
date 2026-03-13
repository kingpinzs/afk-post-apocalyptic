import { gameState, getConfig, notifyTab } from './gameState.js';
import { logEvent, updateDisplay, showMilestoneEvent, showFlashback } from './ui.js';
import { addResource } from './resources.js';
import { getEffect, hasEffect } from './effects.js';

let activeEvents = [];

export function checkForEvents() {
    const config = getConfig();
    const events = config.events || [];
    events.forEach(event => {
        if (Math.random() < event.probability && !activeEvents.some(e => e.id === event.id)) {
            triggerEvent(event);
        }
    });

    // Check for lore flashback events (separate pool)
    checkForLoreFlashbacks();
}

/**
 * Check for random lore flashback events. These are rare "a memory surfaces"
 * moments independent of study. Each lore event fires at most once.
 */
function checkForLoreFlashbacks() {
    const config = getConfig();
    const loreEvents = config.loreEvents || [];
    if (loreEvents.length === 0) return;

    // Initialize seenLoreEvents if needed
    if (!gameState.seenLoreEvents) gameState.seenLoreEvents = [];

    for (const loreEvent of loreEvents) {
        // Skip already seen
        if (gameState.seenLoreEvents.includes(loreEvent.id)) continue;

        // Roll probability
        const prob = loreEvent.probability || 0.05;
        if (Math.random() < prob) {
            // Trigger this lore flashback
            gameState.seenLoreEvents.push(loreEvent.id);

            // Add to collected lore
            if (!gameState.collectedLore) gameState.collectedLore = [];
            if (!gameState.collectedLore.some(l => l.id === loreEvent.id)) {
                gameState.collectedLore.push({
                    id: loreEvent.id,
                    chronologicalOrder: loreEvent.chronologicalOrder,
                    text: loreEvent.loreText,
                    source: 'event'
                });
            }

            // Show the flashback
            showFlashback(loreEvent.loreText);
            notifyTab('book');
            return; // Only one per day
        }
    }
}

function triggerEvent(event) {
    logEvent(`Event: ${event.name} - ${event.description}`);

    // Difficulty eventSeverity scales negative effects (higher = harsher)
    const config = getConfig();
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const severity = preset?.eventSeverity || 1.0;

    Object.entries(event.effect).forEach(([key, value]) => {
        // Scale negative resource effects by severity, leave positive effects unchanged
        const scaledValue = (typeof value === 'number' && value < 0)
            ? Math.floor(value * severity)
            : value;

        if (key === 'gatheringEfficiency') {
            // For gathering debuffs (value < 1), make them harsher with severity
            const scaledGathering = value < 1
                ? Math.max(0.1, 1 - (1 - value) * severity)
                : value;
            gameState.gatheringModifiers.push({ eventId: event.id, value: scaledGathering });
            recalculateGatheringEfficiency();
        } else if (key in gameState.resources) {
            addResource(key, scaledValue);
        }
    });

    if (event.duration) {
        activeEvents.push({...event, remainingDuration: event.duration});
    }

    updateDisplay();
}

export function updateActiveEvents() {
    activeEvents = activeEvents.filter(event => {
        event.remainingDuration--;
        if (event.remainingDuration <= 0) {
            endEvent(event);
            return false;
        }
        return true;
    });
}

function endEvent(event) {
    logEvent(`The effects of "${event.name}" have worn off.`);

    // Remove modifiers for this event and recalculate
    gameState.gatheringModifiers = gameState.gatheringModifiers.filter(m => m.eventId !== event.id);
    recalculateGatheringEfficiency();

    updateDisplay();
}

function recalculateGatheringEfficiency() {
    let efficiency = 1;
    for (const modifier of gameState.gatheringModifiers) {
        efficiency *= modifier.value;
    }
    gameState.gatheringEfficiency = efficiency;
}

export function resetActiveEvents() {
    activeEvents = [];
}

export function getActiveEvents() {
    return activeEvents;
}

export function setActiveEvents(events) {
    activeEvents = events;
}

export function updateWeather() {
    const config = getConfig();
    const weatherConfig = config.weather;
    if (!weatherConfig) return;

    // Determine season from day
    const totalSeasonLength = weatherConfig.seasonLength;
    const seasonIndex = Math.floor(((gameState.day - 1) % (totalSeasonLength * 4)) / totalSeasonLength);
    gameState.currentSeason = weatherConfig.seasons[seasonIndex];

    // Roll weather based on season weights
    const weights = weatherConfig.seasonWeatherWeights[gameState.currentSeason];
    const roll = Math.random();
    let cumulative = 0;
    for (const [type, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (roll <= cumulative) {
            gameState.currentWeather = type;
            break;
        }
    }

    // Apply weather effects
    const effects = weatherConfig.effects[gameState.currentWeather];
    if (effects) {
        // Apply gathering efficiency as a temporary modifier
        if (effects.gatheringEfficiency) {
            // Remove previous weather modifier
            gameState.gatheringModifiers = gameState.gatheringModifiers.filter(m => m.eventId !== '__weather');
            gameState.gatheringModifiers.push({ eventId: '__weather', value: effects.gatheringEfficiency });
            recalculateGatheringEfficiency();
        } else {
            // Clear weather modifier if no gathering effect
            gameState.gatheringModifiers = gameState.gatheringModifiers.filter(m => m.eventId !== '__weather');
            recalculateGatheringEfficiency();
        }

        // Apply resource effects
        // Use effect aggregation to check for weather mitigation from buildings
        // resourceDiscoveryMultiplier and navigationEfficiencyMultiplier mitigate negative weather
        let mitigationFactor = 1;
        if (hasEffect('resourceDiscoveryMultiplier')) mitigationFactor *= 0.8;  // reduces negative by 20%
        if (hasEffect('navigationEfficiencyMultiplier')) mitigationFactor *= 0.85; // reduces negative by 15%

        Object.entries(effects).forEach(([key, value]) => {
            if (key === 'gatheringEfficiency') return; // Already handled
            if (key in gameState.resources && typeof value === 'number') {
                if (value < 0) {
                    addResource(key, Math.ceil(value * mitigationFactor));
                } else {
                    addResource(key, value);
                }
            }
        });
    }
}

export function checkMilestoneEvents() {
    const config = getConfig();
    const milestones = config.milestoneEvents;
    if (!milestones) return;

    for (const milestone of milestones) {
        if (gameState.seenMilestones.includes(milestone.id)) continue;

        let triggered = false;
        switch (milestone.trigger.type) {
            case 'population':
                triggered = gameState.population >= milestone.trigger.threshold;
                break;
            case 'day':
                triggered = gameState.day >= milestone.trigger.threshold;
                break;
            case 'craftedItem':
                // Check if the item exists as an unlocked blueprint or is a built building/tool
                triggered = gameState.unlockedBlueprints.includes(milestone.trigger.item) ||
                    isBuildingBuilt(milestone.trigger.item);
                break;
            case 'knowledge':
                triggered = gameState.knowledge >= milestone.trigger.threshold;
                break;
        }

        if (triggered) {
            gameState.seenMilestones.push(milestone.id);
            showMilestoneEvent(milestone, applyMilestoneChoice);
            return; // Only show one per day
        }
    }
}

/**
 * Check if a building/tool with the given itemId is built somewhere.
 * @param {string} itemId
 * @returns {boolean}
 */
function isBuildingBuilt(itemId) {
    // Check SINGLE buildings
    for (const chainId of Object.keys(gameState.buildings)) {
        if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
            return true;
        }
    }

    // Check tools
    for (const chainId of Object.keys(gameState.tools)) {
        if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
            return true;
        }
    }

    // Check MULTIPLE buildings
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
        if ((gameState.multipleBuildings[chainId] || []).some(inst => inst.itemId === itemId)) {
            return true;
        }
    }

    return false;
}

function applyMilestoneChoice(choice) {
    Object.entries(choice.effects).forEach(([key, value]) => {
        if (key === 'population') {
            gameState.population = Math.max(1, gameState.population + value);
            if (value > 0) gameState.availableWorkers += value;
            logEvent(`Population changed by ${value > 0 ? '+' : ''}${value}.`);
        } else if (key in gameState.resources) {
            addResource(key, value);
            logEvent(`${key.charAt(0).toUpperCase() + key.slice(1)} changed by ${value > 0 ? '+' : ''}${value}.`);
        }
    });
    updateDisplay();
}
