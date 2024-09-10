import { gameState, getConfig } from './gameState.js';

export function updateDisplay() {
    document.getElementById('food').textContent = Math.floor(gameState.food);
    document.getElementById('water').textContent = Math.floor(gameState.water);
    document.getElementById('wood').textContent = gameState.wood;
    document.getElementById('stone').textContent = gameState.stone;
    document.getElementById('knowledge').textContent = gameState.knowledge;
    document.getElementById('food-bar').value = gameState.food;
    document.getElementById('water-bar').value = gameState.water;
    document.getElementById('population-count').textContent = gameState.population;
    document.getElementById('available-workers').textContent = gameState.availableWorkers;
    document.getElementById('day-count').textContent = gameState.day;
}

export function updateWorkingSection(progress = 0) {
    const currentWorkElement = document.getElementById('current-work');
    const workProgressContainer = document.getElementById('work-progress-container');
    const workProgressBar = document.getElementById('work-progress-bar');

    if (gameState.currentWork) {
        if (gameState.currentWork.type === 'gathering') {
            currentWorkElement.textContent = `Gathering ${gameState.currentWork.resource}`;
        } else if (gameState.currentWork.type === 'crafting') {
            currentWorkElement.textContent = `Crafting ${gameState.currentWork.item.name}`;
        }
        workProgressContainer.style.display = 'block';
        workProgressBar.style.width = `${progress * 100}%`;
    } else {
        currentWorkElement.textContent = 'Not working';
        workProgressContainer.style.display = 'none';
    }
}

export function updateTimeDisplay() {
    const config = getConfig();
    const hours = Math.floor(gameState.time / 60);
    const minutes = gameState.time % 60;
    document.getElementById('time-display').textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function updateTimeEmoji() {
    const config = getConfig();
    const timeEmojiElement = document.getElementById('time-emoji');
    if (gameState.time < config.constants.DAY_PHASE) {
        timeEmojiElement.textContent = '☀️';
    } else {
        timeEmojiElement.textContent = '🌙';
    }
}

export function logEvent(message) {
    const eventLog = document.getElementById('event-log');
    const li = document.createElement('li');
    li.textContent = message;
    eventLog.prepend(li);
    if (eventLog.children.length > 5) {
        eventLog.removeChild(eventLog.lastChild);
    }
}