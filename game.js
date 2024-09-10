import { gameState, loadGameConfig, getConfig } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, logEvent, submitUnlockPuzzleAnswer } from './ui.js';
import { gatherResource, consumeResources, produceResources, checkPopulationGrowth, study } from './resources.js';
import { updateCraftableItems, processQueue } from './crafting.js';
import { updateAutomationControls, runAutomation } from './automation.js';

async function initializeGame() {
    await loadGameConfig();
    const config = getConfig();

    updateCraftableItems();
    updateAutomationControls();
    createGatheringActions(config.resources);

    // Event listeners
    // config.resources.forEach(resource => {
    //     document.getElementById(`gather-${resource}`).addEventListener('click', () => gatherResource(resource));
    // });
    document.getElementById('study').addEventListener('click', study);
    document.getElementById('submit-puzzle').addEventListener('click', submitUnlockPuzzleAnswer);

    // Start game loop
    setInterval(gameLoop, 1000); // Update every second
}

function createGatheringActions(resources) {
    const actionsContainer = document.getElementById('actions');
    //actionsContainer.innerHTML = ''; // Clear existing content

    resources.forEach(resource => {
        const gatherAction = document.createElement('div');
        gatherAction.className = 'gather-action';

        const button = document.createElement('button');
        button.id = `gather-${resource}`;
        button.textContent = `Gather ${resource.charAt(0).toUpperCase() + resource.slice(1)}`;
        button.addEventListener('click', () => gatherResource(resource));

        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-bar-container';

        const progressBar = document.createElement('div');
        progressBar.id = `${resource}-progress-bar`;
        progressBar.className = 'progress-bar';

        progressBarContainer.appendChild(progressBar);
        gatherAction.appendChild(button);
        gatherAction.appendChild(progressBarContainer);
        actionsContainer.appendChild(gatherAction);
    });
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
    processQueue();
}

function updateTime() {
    const config = getConfig();
    gameState.time = (gameState.time + 1) % config.constants.DAY_LENGTH;
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