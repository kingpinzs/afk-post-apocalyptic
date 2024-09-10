// automation.js

import { gameState } from './gameState.js';
import { updateDisplay } from './ui.js';

export function updateAutomationControls() {
    const automationControlsContainer = document.getElementById('automation-controls');
    automationControlsContainer.innerHTML = '';
    Object.entries(gameState.craftedItems).forEach(([itemId, item]) => {
        if (item.effect.foodProductionRate || item.effect.waterProductionRate) {
            const div = document.createElement('div');
            div.innerHTML = `
                <p>${item.name}: <span id="${itemId}-assigned">0</span> assigned</p>
                <button id="${itemId}-assign">+</button>
                <button id="${itemId}-unassign">-</button>
            `;
            automationControlsContainer.appendChild(div);

            document.getElementById(`${itemId}-assign`).addEventListener('click', () => assignWorker(itemId));
            document.getElementById(`${itemId}-unassign`).addEventListener('click', () => unassignWorker(itemId));
        }
    });
}

function assignWorker(resource) {
    if (gameState.availableWorkers > 0) {
        gameState.automationAssignments[resource] = (gameState.automationAssignments[resource] || 0) + 1;
        gameState.availableWorkers--;
        updateAutomationDisplay();
        updateDisplay();
    }
}

function unassignWorker(itemId) {
    if (gameState.automationAssignments[itemId] > 0) {
        gameState.automationAssignments[itemId] -= 1;
        gameState.unassignedPopulation += 1;
        updateAutomationDisplay();
    }
}

function updateAutomationDisplay() {
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        const assignedElement = document.getElementById(`${itemId}-assigned`);
        if (assignedElement) {
            assignedElement.textContent = count;
        }
    });
    updateDisplay();
}