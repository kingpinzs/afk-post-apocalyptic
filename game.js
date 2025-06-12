import { gameState, loadGameConfig, getConfig } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, logEvent, submitUnlockPuzzleAnswer, closePuzzlePopup, openSettingsMenu, closeSettingsMenu, updateGatherButtons } from './ui.js';
import { gatherResource, consumeResources, produceResources, checkPopulationGrowth, trainWorker } from './resources.js';
import { updateCraftableItems, processQueue } from './crafting.js';
import { updateAutomationControls, runAutomation } from './automation.js';
import { checkForEvents, updateActiveEvents } from './events.js';
import { initBook } from './book.js';

async function initializeGame() {
    await loadGameConfig();
    const config = getConfig();

    updateCraftableItems();
    updateAutomationControls();
    createGatheringActions(config.resources);
    updateGatherButtons();
    initBook();

    // Event listeners
    // config.resources.forEach(resource => {
    //     document.getElementById(`gather-${resource}`).addEventListener('click', () => gatherResource(resource));
    // });
    document.getElementById('submit-puzzle').addEventListener('click', submitUnlockPuzzleAnswer);
    document.getElementById('close-puzzle').addEventListener('click', closePuzzlePopup);
    document.getElementById('settings-btn').addEventListener('click', openSettingsMenu);
    document.getElementById('close-settings').addEventListener('click', closeSettingsMenu);
    const trainBtn = document.getElementById('train-worker-btn');
    if (trainBtn) {
        trainBtn.addEventListener('click', trainWorker);
    }

    // Bottom navigation
    document.querySelectorAll('#bottom-nav .nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.target;
            document.querySelectorAll('.game-section').forEach(sec => sec.classList.remove('game-section-active'));
            document.getElementById(target).classList.add('game-section-active');
        });
    });

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
        button.className = 'progress-button';
        const textSpan = document.createElement('span');
        textSpan.textContent = `Gather ${resource.charAt(0).toUpperCase() + resource.slice(1)}`;
        button.appendChild(textSpan);
        const multSpan = document.createElement('span');
        multSpan.className = 'multiplier';
        button.appendChild(multSpan);

        const progressBar = document.createElement('div');
        progressBar.id = `${resource}-progress-bar`;
        progressBar.className = 'progress-bar';
        button.appendChild(progressBar);

        button.addEventListener('click', () => gatherResource(resource));

        gatherAction.appendChild(button);
        actionsContainer.appendChild(gatherAction);
    });
}

function gameLoop() {
    updateTime();
    if (gameState.time === 0) { // Start of a new day
        consumeResources();
        produceResources();
        checkPopulationGrowth();
        checkForEvents();
    }
    runAutomation();
    updateActiveEvents();
    checkSurvival();
    updateDisplay();
    processQueue();
}

function updateTime() {
    const config = getConfig();
    gameState.time = (gameState.time + 1) % config.constants.DAY_LENGTH;
    if (gameState.time === 0) {
        gameState.day += 1;
        gameState.daysSinceGrowth += 1;
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
        workers: 0,
        day: 1,
        time: 0,
        craftedItems: {},
        automationAssignments: {},
        availableWorkers: 0,
        gatherCount: 0,
        studyCount: 0,
        craftCount: 0,
        daysSinceGrowth: 0
    });
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
}

// Initialize the game
initializeGame();