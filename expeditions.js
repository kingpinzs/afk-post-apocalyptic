import { gameState, getConfig, adjustAvailableWorkers } from './gameState.js';
import { logEvent } from './ui.js';
import { addResource } from './resourceManager.js';
import { triggerRandomEvent } from './events.js';

export function initExpeditions() {
    const btn = document.getElementById('start-expedition');
    if (btn) {
        btn.addEventListener('click', startExpedition);
    }
    updateExpeditionUI();
}

export function startExpedition() {
    if (gameState.availableWorkers <= 0) {
        logEvent('No available workers for an expedition.');
        return;
    }
    const config = getConfig();
    const duration = config.constants.EXPEDITION_DURATION || 30;
    gameState.expeditions.push({ remaining: duration });
    adjustAvailableWorkers(-1);
    logEvent('An expedition has set out.');
    updateExpeditionUI();
}

function completeExpedition() {
    adjustAvailableWorkers(1);
    const config = getConfig();
    if (Math.random() < 0.2) {
        triggerRandomEvent();
    } else {
        const rewards = config.resources;
        const resource = rewards[Math.floor(Math.random() * rewards.length)];
        const amount = Math.round(Math.random() * 5 + 5);
        addResource(resource, amount);
        logEvent(`Expedition returned with ${amount} ${resource}.`);
    }
}

export function updateExpeditions(seconds = 1) {
    const completed = [];
    gameState.expeditions.forEach(exp => {
        exp.remaining -= seconds;
        if (exp.remaining <= 0) completed.push(exp);
    });
    completed.forEach(exp => {
        completeExpedition();
    });
    if (completed.length > 0) {
        gameState.expeditions = gameState.expeditions.filter(e => e.remaining > 0);
        updateExpeditionUI();
    }
}

export function hasExpeditions() {
    return gameState.expeditions.length > 0;
}

function updateExpeditionUI() {
    const list = document.getElementById('expedition-list');
    if (!list) return;
    list.innerHTML = '';
    gameState.expeditions.forEach((exp, index) => {
        const li = document.createElement('div');
        li.textContent = `Expedition ${index + 1}: ${exp.remaining}s remaining`;
        list.appendChild(li);
    });
}
