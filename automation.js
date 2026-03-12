import { gameState, getConfig } from './gameState.js';
import { updateDisplay, logEvent } from './ui.js';
import { addResource } from './resources.js';
import { getEffect } from './effects.js';

/**
 * Maps production rate effect keys to their target resource.
 * Items with these effect keys produce the corresponding resource when workers
 * are assigned to them.
 */
const PRODUCTION_MAP = {
    foodProductionRate: 'food',
    waterProductionRate: 'water',
    stoneProductionRate: 'stone',
    oreProductionRate: 'ore',
    fruitProductionRate: 'fruit',
};

/**
 * Maps production rate keys to their production multiplier keys.
 * These multipliers scale the output of automated production.
 */
const PRODUCTION_MULTIPLIER_MAP = {
    foodProductionRate: ['foodProductionMultiplier', 'farmYieldMultiplier'],
    waterProductionRate: [],
    stoneProductionRate: [],
    oreProductionRate: [],
    fruitProductionRate: [],
};

/**
 * Checks if an item has any production rate that maps to a stockpileable resource.
 */
function getItemProductions(item) {
    if (!item?.effect) return [];
    const productions = [];
    for (const [rateKey, resource] of Object.entries(PRODUCTION_MAP)) {
        if (item.effect[rateKey]) {
            productions.push({ rateKey, resource, baseRate: item.effect[rateKey] });
        }
    }
    return productions;
}

export function updateAutomationControls() {
    const config = getConfig();
    const automationControlsContainer = document.getElementById('automation-controls');
    while (automationControlsContainer.firstChild) {
        automationControlsContainer.removeChild(automationControlsContainer.firstChild);
    }

    config.items.forEach(item => {
        if (!gameState.craftedItems[item.id]) return;
        const productions = getItemProductions(item);
        if (productions.length === 0) return;

        const div = document.createElement('div');
        div.className = 'automation-control';

        const infoDiv = document.createElement('div');

        const p = document.createElement('p');
        p.textContent = `${item.name}: `;
        const assignedSpan = document.createElement('span');
        assignedSpan.id = `${item.id}-assigned`;
        assignedSpan.textContent = gameState.automationAssignments[item.id] || '0';
        p.appendChild(assignedSpan);
        p.appendChild(document.createTextNode(' assigned'));
        infoDiv.appendChild(p);

        // Production feedback
        const count = gameState.automationAssignments[item.id] || 0;
        const feedbackP = document.createElement('p');
        feedbackP.className = 'automation-info';
        if (count > 0) {
            const parts = productions.map(prod => {
                const multiplied = getProductionAmount(prod, count);
                return `+${multiplied.toFixed(1)} ${prod.resource}/day`;
            });
            feedbackP.textContent = parts.join(', ');
        } else {
            feedbackP.textContent = 'No workers assigned';
            feedbackP.style.color = '#7f8c8d';
        }
        infoDiv.appendChild(feedbackP);

        const btnDiv = document.createElement('div');
        btnDiv.style.display = 'flex';
        btnDiv.style.gap = '5px';

        const assignBtn = document.createElement('button');
        assignBtn.id = `${item.id}-assign`;
        assignBtn.textContent = '+';
        assignBtn.disabled = gameState.availableWorkers === 0;

        const unassignBtn = document.createElement('button');
        unassignBtn.id = `${item.id}-unassign`;
        unassignBtn.textContent = '-';
        unassignBtn.disabled = count === 0;

        btnDiv.appendChild(assignBtn);
        btnDiv.appendChild(unassignBtn);

        div.appendChild(infoDiv);
        div.appendChild(btnDiv);
        automationControlsContainer.appendChild(div);

        assignBtn.addEventListener('click', () => assignWorker(item.id));
        unassignBtn.addEventListener('click', () => unassignWorker(item.id));
    });
}

function assignWorker(itemId) {
    if (gameState.availableWorkers > 0) {
        gameState.automationAssignments[itemId] = (gameState.automationAssignments[itemId] || 0) + 1;
        gameState.availableWorkers--;
        updateAutomationControls();
        updateDisplay();
    }
}

function unassignWorker(itemId) {
    if (gameState.automationAssignments[itemId] > 0) {
        gameState.automationAssignments[itemId] -= 1;
        gameState.availableWorkers += 1;
        updateAutomationControls();
        updateDisplay();
    }
}

/**
 * Compute the actual production amount for a given production entry,
 * applying all relevant multipliers.
 */
function getProductionAmount(prod, workerCount) {
    let amount = prod.baseRate * workerCount;

    // Apply production-specific multipliers
    const multiplierKeys = PRODUCTION_MULTIPLIER_MAP[prod.rateKey] || [];
    for (const mulKey of multiplierKeys) {
        amount *= getEffect(mulKey);
    }

    // productionSpeedMultiplier (assembly_line) — global production speed
    amount *= getEffect('productionSpeedMultiplier');

    // productivityMultiplier (brewery) — global productivity bonus
    const productivity = getEffect('productivityMultiplier');
    if (productivity > 1) amount *= productivity;

    // resourceDistributionMultiplier (railway) — increases automation output
    const distribution = getEffect('resourceDistributionMultiplier');
    if (distribution > 1) amount *= distribution;

    return amount;
}

export function runAutomation() {
    const config = getConfig();

    // --- Building production (assigned workers) ---
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        const item = config.items.find(i => i.id === itemId);
        if (!item || count <= 0) return;

        const productions = getItemProductions(item);
        for (const prod of productions) {
            const amount = getProductionAmount(prod, count);
            addResource(prod.resource, amount);
            logEvent(`${item.name} produced ${amount.toFixed(1)} ${prod.resource}.`);
        }
    });

    // --- Idle worker foraging (AFK passive income) ---
    // Idle workers passively gather small amounts of food and water each day.
    // This keeps the settlement alive while the player is away.
    const idleWorkers = gameState.availableWorkers;
    if (idleWorkers > 0) {
        const foodForaged = idleWorkers;
        const waterForaged = idleWorkers;
        addResource('food', foodForaged);
        addResource('water', waterForaged);
        logEvent(`${idleWorkers} idle worker${idleWorkers > 1 ? 's' : ''} foraged ${foodForaged} food and ${waterForaged} water.`);
    }

    updateDisplay();
}
