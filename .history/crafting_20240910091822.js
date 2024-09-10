import { gameState, knowledgeData } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { updateAutomationControls } from './automation.js';

const craftingQueue = [];
const craftingTimes = {
    axe: 30000,    // 30 seconds
    shelter: 60000, // 1 minute
    farm: 120000,   // 2 minutes
    well: 90000     // 1.5 minutes
};


export function updateCraftableItems() {
    const craftableItemsContainer = document.getElementById('craftable-items');
    craftableItemsContainer.innerHTML = '';
    knowledgeData.items.forEach(item => {
        if (!gameState.craftedItems[item.id]) {
            const canCraft = Object.entries(item.requirements).every(([resource, amount]) => gameState[resource] >= amount);
            const button = document.createElement('button');
            button.textContent = `Craft ${item.name} (${Object.entries(item.requirements).map(([resource, amount]) => `${amount} ${resource}`).join(', ')})`;
            button.disabled = !canCraft || craftingQueue.length >= gameState.population;
            button.addEventListener('click', () => startCrafting(item));
            craftableItemsContainer.appendChild(button);
        }
    });
}


export function submitPuzzleAnswer() {
    const puzzlePopup = document.getElementById('puzzle-popup');
    const itemId = puzzlePopup.dataset.itemId;
    const item = knowledgeData.items.find(i => i.id === itemId);
    if (document.getElementById('puzzle-answer').value.toLowerCase() === item.puzzleAnswer.toLowerCase()) {
        craftItem(item);
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