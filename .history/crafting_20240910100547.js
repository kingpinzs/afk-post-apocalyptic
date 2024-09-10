import { gameState, knowledgeData } from './gameState.js';
import { logEvent, updateDisplay, updateWorkingSection } from './ui.js';
import { updateAutomationControls } from './automation.js';

const craftingQueue = [];

export function updateCraftableItems() {
    const config = getConfig();
    const craftableItemsContainer = document.getElementById('craftable-items');
    craftableItemsContainer.innerHTML = '';
    config.items.forEach(item => {
        if (!gameState.craftedItems[item.id]) {
            const canCraft = Object.entries(item.requirements).every(([resource, amount]) => gameState[resource] >= amount);
            const button = document.createElement('button');
            button.textContent = `Craft ${item.name} (${Object.entries(item.requirements).map(([resource, amount]) => `${amount} ${resource}`).join(', ')})`;
            button.disabled = !canCraft || gameState.availableWorkers === 0;
            button.addEventListener('click', () => showPuzzle(item));
            craftableItemsContainer.appendChild(button);
        }
    });
}

function startCrafting(item) {
    if (craftingQueue.length >= gameState.population) {
        logEvent("Not enough workers to start crafting.");
        return;
    }

    // Deduct resources
    Object.entries(item.requirements).forEach(([resource, amount]) => {
        gameState[resource] -= amount;
    });

    // Add item to crafting queue
    const craftingItem = {
        item: item,
        progress: 0,
        duration: craftingTimes[item.id]
    };
    craftingQueue.push(craftingItem);

    // Update UI
    updateCraftableItems();
    updateCraftingQueue();
    updateDisplay();

    // Start crafting process
    processQueue();
}

function processQueue() {
    if (craftingQueue.length === 0) return;

    const queueContainer = document.getElementById('crafting-queue');
    queueContainer.innerHTML = '';

    craftingQueue.forEach((craftingItem, index) => {
        const itemElement = document.createElement('div');
        itemElement.className = 'crafting-item';
        itemElement.innerHTML = `
            <span>${craftingItem.item.name}</span>
            <div class="progress-bar-container">
                <div class="progress-bar"></div>
            </div>
        `;
        queueContainer.appendChild(itemElement);

        const progressBar = itemElement.querySelector('.progress-bar');
        const updateProgress = () => {
            craftingItem.progress += 100;
            const percentage = (craftingItem.progress / craftingItem.duration) * 100;
            progressBar.style.width = `${percentage}%`;

            if (craftingItem.progress >= craftingItem.duration) {
                completeCrafting(craftingItem, index);
            } else {
                setTimeout(updateProgress, 100);
            }
        };

        setTimeout(updateProgress, 100);
    });
}

function completeCrafting(craftingItem, index) {
    gameState.craftedItems[craftingItem.item.id] = craftingItem.item;
    logEvent(`Crafted ${craftingItem.item.name}!`);
    craftingQueue.splice(index, 1);
    updateCraftableItems();
    updateCraftingQueue();
    updateDisplay();
    updateAutomationControls();
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

export function submitPuzzleAnswer() {
    const puzzlePopup = document.getElementById('puzzle-popup');
    const itemId = puzzlePopup.dataset.itemId;
    const item = knowledgeData.items.find(i => i.id === itemId);
    if (document.getElementById('puzzle-answer').value.toLowerCase() === item.puzzleAnswer.toLowerCase()) {
        startCrafting(item);
        puzzlePopup.style.display = 'none';
    } else {
        alert('Incorrect answer. Try again!');
    }
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