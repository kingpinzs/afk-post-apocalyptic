import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';

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
        if (key in gameState) {
            gameState[key] += value;
        } else if (key === 'gatheringEfficiency') {
            // Store the efficiency modifier
            gameState.gatheringEfficiency = (gameState.gatheringEfficiency || 1) * value;
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
    
    // Reverse the effects
    Object.entries(event.effect).forEach(([key, value]) => {
        if (key === 'gatheringEfficiency') {
            gameState.gatheringEfficiency /= value;
        }
        // For other effects, we don't reverse them as they were one-time bonuses
    });

    updateDisplay();
}