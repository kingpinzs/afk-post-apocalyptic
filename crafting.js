import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay, updateWorkingSection } from './ui.js';
import { updateAutomationControls } from './automation.js';

const craftingQueue = [];

export function updateCraftableItems() {
    if (!gameState.unlockedFeatures.includes('crafting')) {
        document.getElementById('crafting').style.display = 'none';
        return;
    }

    document.getElementById('crafting').style.display = 'block';
    const config = getConfig();
    const craftableItemsContainer = document.getElementById('craftable-items');
    craftableItemsContainer.innerHTML = '';
    
    config.items.forEach(item => {
        if (!gameState.craftedItems[item.id] && gameState.unlockedFeatures.includes(item.id) && areDependenciesMet(item)) {
            const canCraft = Object.entries(item.requirements).every(([resource, amount]) => gameState[resource] >= amount);
            const button = document.createElement('button');
            button.textContent = `Craft ${item.name} (${Object.entries(item.requirements).map(([resource, amount]) => `${amount} ${resource}`).join(', ')})`;
            button.disabled = !canCraft || gameState.availableWorkers === 0;
            button.addEventListener('click', () => startCrafting(item));
            craftableItemsContainer.appendChild(button);
        }
    });
}

function areDependenciesMet(item) {
    return item.dependencies.every(depId => gameState.craftedItems[depId]);
}

function startCrafting(item) {
    if (gameState.availableWorkers === 0) {
        logEvent("No available workers to start crafting.");
        return;
    }

    // Deduct resources
    Object.entries(item.requirements).forEach(([resource, amount]) => {
        gameState[resource] -= amount;
    });

    gameState.availableWorkers--;
    gameState.craftingQueue.push({
        item: item,
        progress: 0,
        duration: item.craftingTime
    });

    updateCraftableItems();
    updateDisplay();
    processQueue();
}

export function processQueue() {
    if (gameState.craftingQueue.length === 0) return;

    const currentCraft = gameState.craftingQueue[0];
    gameState.currentWork = { type: 'crafting', item: currentCraft.item };
    updateWorkingSection();

    const progressInterval = setInterval(() => {
        currentCraft.progress += 100;
        updateWorkingSection(currentCraft.progress / currentCraft.duration);

        if (currentCraft.progress >= currentCraft.duration) {
            clearInterval(progressInterval);
            completeCrafting(currentCraft.item);
        }
    }, 100);
}

function completeCrafting(item) {
    gameState.craftedItems[item.id] = true;
    logEvent(`Crafted ${item.name}!`);
    
    gameState.availableWorkers++;
    gameState.currentWork = null;
    gameState.craftingQueue.shift();
    
    updateCraftableItems();
    updateDisplay();
    updateWorkingSection();
    updateAutomationControls();

    if (gameState.craftingQueue.length > 0) {
        processQueue();
    }
}




function updateCraftingQueue() {
    const queueContainer = document.getElementById('crafting-queue');
    queueContainer.innerHTML = '';
    craftingQueue.forEach(craftingItem => {
        const itemElement = document.createElement('div');
        itemElement.className = 'crafting-item';
        itemElement.innerHTML = `
            <span>${craftingItem.item.name}</span>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        `;
        queueContainer.appendChild(itemElement);
    });
}



function craftItem(item) {
    Object.entries(item.requirements).forEach(([resource, amount]) => {
        gameState[resource] -= amount;
    });
    gameState.craftedItems[item.id] = item;
    logEvent(`Crafted ${item.name}!`);
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
}

// Make sure showPuzzle is exported
export function showPuzzle(item) {
    const puzzlePopup = document.getElementById('puzzle-popup');
    document.getElementById('puzzle-title').textContent = `Craft ${item.name}`;
    document.getElementById('puzzle-description').textContent = item.puzzle;
    document.getElementById('puzzle-answer').value = '';
    puzzlePopup.style.display = 'block';
    puzzlePopup.dataset.itemId = item.id;
}
