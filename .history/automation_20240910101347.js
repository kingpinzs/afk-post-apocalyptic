import { gameState, getConfig } from './gameState.js';
import { updateDisplay, logEvent } from './ui.js';

export function updateAutomationControls() {
    const config = getConfig();
    const automationControlsContainer = document.getElementById('automation-controls');
    automationControlsContainer.innerHTML = '';
    
    config.items.forEach(item => {
        if (gameState.craftedItems[item.id] && (item.effect.foodProductionRate || item.effect.waterProductionRate)) {
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
}

function assignWorker(itemId) {
    if (gameState.availableWorkers > 0) {
        gameState.automationAssignments[itemId] = (gameState.automationAssignments[itemId] || 0) + 1;
        gameState.availableWorkers--;
        updateAutomationDisplay();
        updateDisplay();
    }
}

function unassignWorker(itemId) {
    if (gameState.automationAssignments[itemId] > 0) {
        gameState.automationAssignments[itemId] -= 1;
        gameState.availableWorkers += 1;
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

export function runAutomation() {
    const config = getConfig();
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        const item = config.items.find(i => i.id === itemId);
        if (item && count > 0) {
            if (item.effect.foodProductionRate) {
                const foodProduced = item.effect.foodProductionRate * count;
                gameState.food = Math.min(100, gameState.food + foodProduced);
                logEvent(`${item.name} produced ${foodProduced.toFixed(1)} food.`);
            }
            if (item.effect.waterProductionRate) {
                const waterProduced = item.effect.waterProductionRate * count;
                gameState.water = Math.min(100, gameState.water + waterProduced);
                logEvent(`${item.name} produced ${waterProduced.toFixed(1)} water.`);
            }
        }
    });
    updateDisplay();
}