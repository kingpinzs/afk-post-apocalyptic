import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay, showMilestoneEvent } from './ui.js';
import { addResource } from './resources.js';

let activeEvents = [];

export function checkForEvents() {
    const config = getConfig();
    config.events.forEach(event => {
        if (Math.random() < event.probability && !activeEvents.some(e => e.id === event.id)) {
            triggerEvent(event);
        }
    });
}

function triggerEvent(event) {
    logEvent(`Event: ${event.name} - ${event.description}`);

    Object.entries(event.effect).forEach(([key, value]) => {
        if (key === 'gatheringEfficiency') {
            // Track modifiers as a list and recalculate from scratch
            gameState.gatheringModifiers.push({ eventId: event.id, value: value });
            recalculateGatheringEfficiency();
        } else if (key in gameState) {
            addResource(key, value);
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
        // resourceDiscoveryMultiplier (watchtower) and navigationEfficiencyMultiplier (telescope) mitigate negative weather
        let mitigationFactor = 1;
        for (const item of Object.values(gameState.craftedItems)) {
            if (item?.effect?.resourceDiscoveryMultiplier) mitigationFactor *= 0.8; // reduces negative by 20%
            if (item?.effect?.navigationEfficiencyMultiplier) mitigationFactor *= 0.85; // reduces negative by 15%
        }

        Object.entries(effects).forEach(([key, value]) => {
            if (key === 'gatheringEfficiency') return; // Already handled
            if (key in gameState && typeof value === 'number') {
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
                triggered = !!gameState.craftedItems[milestone.trigger.item];
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

function applyMilestoneChoice(choice) {
    Object.entries(choice.effects).forEach(([key, value]) => {
        if (key === 'population') {
            gameState.population = Math.max(1, gameState.population + value);
            if (value > 0) gameState.availableWorkers += value;
            logEvent(`Population changed by ${value > 0 ? '+' : ''}${value}.`);
        } else if (key in gameState) {
            addResource(key, value);
            logEvent(`${key.charAt(0).toUpperCase() + key.slice(1)} changed by ${value > 0 ? '+' : ''}${value}.`);
        }
    });
    updateDisplay();
}
