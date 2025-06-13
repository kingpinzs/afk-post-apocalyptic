import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay, showEventPopup } from './ui.js';
import { changeResource } from './resourceManager.js';

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
    showEventPopup(event);

    Object.entries(event.effect).forEach(([key, value]) => {
        if (key in gameState) {
            changeResource(key, value);
        } else if (key === 'gatheringEfficiency') {
            // Store the efficiency modifier
            gameState.gatheringEfficiency = (gameState.gatheringEfficiency || 1) * value;
        }
    });

    if (event.duration) {
        const config = getConfig();
        const durationSeconds = event.duration * config.constants.DAY_LENGTH;
        activeEvents.push({ ...event, remainingDuration: durationSeconds });
    }

    updateDisplay();
}

export function advanceEventTime(seconds) {
    activeEvents = activeEvents.filter(event => {
        event.remainingDuration -= seconds;
        if (event.remainingDuration <= 0) {
            endEvent(event);
            return false;
        }
        return true;
    });
}

export function updateActiveEvents(seconds = 1) {
    advanceEventTime(seconds);
}

export function hasActiveEvents() {
    return activeEvents.length > 0;
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

export function triggerRandomEvent() {
    const config = getConfig();
    const events = config.events;
    if (events.length === 0) return;
    const event = events[Math.floor(Math.random() * events.length)];
    triggerEvent(event);
}