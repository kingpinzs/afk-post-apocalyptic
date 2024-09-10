// game.js

import { gameState, loadGameConfig, getConfig } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, logEvent } from './ui.js';
import { gatherResource, consumeResources, produceResources, checkPopulationGrowth, study } from './resources.js';
import { updateCraftableItems, submitPuzzleAnswer, processQueue } from './crafting.js';
import { updateAutomationControls, runAutomation } from './automation.js';

async function initializeGame() {
    await loadGameConfig();
    const config = getConfig();

    updateCraftableItems();
    updateAutomationControls();

    // Event listeners
    config.resources.forEach(resource => {
        document.getElementById(`gather-${resource}`).addEventListener('click', () => gatherResource(resource));
    });
    document.getElementById('study').addEventListener('click', study);
    document.getElementById('submit-puzzle').addEventListener('click', submitPuzzleAnswer);

    // Start game loop
    setInterval(gameLoop, 1000); // Update every second
}

function gameLoop() {
    updateTime();
    if (gameState.time === 0) { // Start of a new day
        consumeResources();
        produceResources();
        checkPopulationGrowth();
    }
    checkSurvival();
    updateDisplay();
    //processQueue();
}

function updateTime() {
    gameState.time = (gameState.time + 1) % (CONSTANTS.DAY_LENGTH * 60);
    if (gameState.time === 0) {
        gameState.day += 1;
    }
    updateTimeEmoji();
    updateTimeDisplay();
}

function checkSurvival() {
    if (gameState.food <= 0 || gameState.water <= 0) {
        alert('Game Over! Your population did not survive.');
        resetGame();
    }
}

function resetGame() {
    Object.assign(gameState, {
        food: 100,
        water: 100,
        wood: 0,
        stone: 0,
        knowledge: 0,
        population: 1,
        unassignedPopulation: 0,
        day: 1,
        time: 0,
        craftedItems: {},
        automationAssignments: {}
    });
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
}

// Initialize the game
initializeGame();