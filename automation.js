import { gameState, getConfig, adjustAvailableWorkers, getPrestigeMultiplier } from './gameState.js';
import { updateDisplay, logEvent } from './ui.js';
import { addResource } from './resourceManager.js';
import { trainWorker } from './resources.js';

export function updateAutomationControls() {
    const config = getConfig();
    const automationControlsContainer = document.getElementById('automation-controls');
    automationControlsContainer.innerHTML = '';

    config.items.forEach(item => {
        if (
            gameState.craftedItems[item.id] &&
            item.effect &&
            (item.effect.foodProductionRate || item.effect.waterProductionRate)
        ) {
            const div = document.createElement('div');
            div.className = 'automation-control';
            div.innerHTML = `
                <p>${item.name}: <span id="${item.id}-assigned">0</span> assigned</p>
                <button id="${item.id}-assign">+</button>
                <button id="${item.id}-unassign">-</button>
            `;
            automationControlsContainer.appendChild(div);
            document.getElementById(`${item.id}-assign`).addEventListener('click', () => assignWorker(item.id));
            document.getElementById(`${item.id}-unassign`).addEventListener('click', () => unassignWorker(item.id));
        }
    });

    // Auto-gather wood when axe is crafted
    if (gameState.craftedItems.axe) {
        addResourceControl('wood', 'Chop Wood');
    }

    // Auto-train workers
    const trainDiv = document.createElement('div');
    trainDiv.className = 'automation-control';
    trainDiv.innerHTML = `
        <p>Train Worker: <span id="train_worker-assigned">${gameState.automationAssignments['train_worker'] || 0}</span> assigned</p>
        <button id="train_worker-assign">+</button>
        <button id="train_worker-unassign">-</button>
    `;
    automationControlsContainer.appendChild(trainDiv);
    document.getElementById('train_worker-assign').addEventListener('click', () => assignWorker('train_worker'));
    document.getElementById('train_worker-unassign').addEventListener('click', () => unassignWorker('train_worker'));
}

function addResourceControl(resource, label) {
    const container = document.getElementById('automation-controls');
    const id = `gather_${resource}`;
    const div = document.createElement('div');
    div.className = 'automation-control';
    div.innerHTML = `
        <p>${label}: <span id="${id}-assigned">${gameState.automationAssignments[id] || 0}</span> assigned</p>
        <button id="${id}-assign">+</button>
        <button id="${id}-unassign">-</button>
    `;
    container.appendChild(div);
    document.getElementById(`${id}-assign`).addEventListener('click', () => assignWorker(id));
    document.getElementById(`${id}-unassign`).addEventListener('click', () => unassignWorker(id));
}

function assignWorker(itemId) {
    if (gameState.availableWorkers > 0) {
        gameState.automationAssignments[itemId] = (gameState.automationAssignments[itemId] || 0) + 1;
        adjustAvailableWorkers(-1);
        updateAutomationDisplay();
        updateDisplay();
    }
}

function unassignWorker(itemId) {
    if (gameState.automationAssignments[itemId] > 0) {
        gameState.automationAssignments[itemId] -= 1;
        adjustAvailableWorkers(1);
        updateAutomationDisplay();
        updateDisplay();
    }
}

function updateAutomationDisplay() {
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        const assignedElement = document.getElementById(`${itemId}-assigned`);
        if (assignedElement) {
            assignedElement.textContent = count;
        }
    });
}

export function runAutomation(seconds = 1) {
    const config = getConfig();
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        if (count <= 0) return;

        gameState.automationProgress[itemId] = (gameState.automationProgress[itemId] || 0) + seconds;

        while (gameState.automationProgress[itemId] >= 10) {
            gameState.automationProgress[itemId] -= 10;

            const mult = getPrestigeMultiplier();
            if (itemId.startsWith('gather_')) {
                const resource = itemId.replace('gather_', '');
                addResource(resource, count * mult);
                logEvent(`Workers gathered ${count * mult} ${resource}.`);
            } else if (itemId === 'train_worker') {
                trainWorker();
            } else {
                const item = config.items.find(i => i.id === itemId);
                if (item && item.effect) {
                    Object.entries(item.effect).forEach(([key]) => {
                        if (key.endsWith('ProductionRate')) {
                            const resource = key.replace('ProductionRate', '');
                            addResource(resource, count * mult);
                            if (resource === 'food' || resource === 'water') {
                                gameState[resource] = Math.min(100, gameState[resource]);
                            }
                            logEvent(`${item.name} produced ${count * mult} ${resource}.`);
                        }
                    });
                }
            }
        }
    });
    updateDisplay();
}

export function hasActiveAutomation() {
    return Object.values(gameState.automationAssignments).some(v => v > 0);
}
