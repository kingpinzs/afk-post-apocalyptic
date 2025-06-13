import { gameState, loadGameConfig, getConfig } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, logEvent, submitUnlockPuzzleAnswer, closePuzzlePopup, openSettingsMenu, closeSettingsMenu, updateGatherButtons } from './ui.js';
import { gatherResource, consumeResources, logDailyConsumption, produceResources, checkPopulationGrowth, trainWorker } from './resources.js';
import { updateCraftableItems, processQueue } from './crafting.js';
import { updateAutomationControls, runAutomation } from './automation.js';
import { checkForEvents, updateActiveEvents } from './events.js';
import { initBook } from './book.js';

function saveGame(manual = false) {
    gameState.lastSaved = Date.now();
    localStorage.setItem('afkGameSave', JSON.stringify(gameState));
    if (manual) {
        logEvent('Game saved');
    }
}

function loadSavedGame() {
    const saved = localStorage.getItem('afkGameSave');
    if (saved) {
        Object.assign(gameState, JSON.parse(saved));
    }
}

function applyOfflineProgress() {
    const config = getConfig();
    if (!gameState.lastSaved) {
        gameState.lastSaved = Date.now();
        return;
    }
    const now = Date.now();
    const elapsed = Math.floor((now - gameState.lastSaved) / 1000);
    if (elapsed <= 0) return;

    const limit = config.constants.OFFLINE_PROGRESS_LIMIT || 28800;
    const seconds = Math.min(elapsed, limit);

    consumeResources(seconds);

    const cycles = Math.floor(seconds / 10);
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        if (count <= 0) return;
        if (itemId.startsWith('gather_')) {
            const resource = itemId.replace('gather_', '');
            gameState[resource] = (gameState[resource] || 0) + count * cycles;
        } else {
            const item = config.items.find(i => i.id === itemId);
            if (item && item.effect) {
                Object.keys(item.effect).forEach(key => {
                    if (key.endsWith('ProductionRate')) {
                        const resource = key.replace('ProductionRate', '');
                        gameState[resource] = (gameState[resource] || 0) + count * cycles;
                        if (resource === 'food' || resource === 'water') {
                            gameState[resource] = Math.min(100, gameState[resource]);
                        }
                    }
                });
            }
        }
    });

    const totalTime = gameState.time + seconds;
    const daysPassed = Math.floor(totalTime / config.constants.DAY_LENGTH);
    gameState.time = totalTime % config.constants.DAY_LENGTH;
    gameState.day += daysPassed;
    gameState.daysSinceGrowth += daysPassed;

    for (let i = 0; i < daysPassed; i++) {
        logDailyConsumption();
        produceResources();
        checkPopulationGrowth();
    }

    checkSurvival();
    gameState.lastSaved = now;
}

async function initializeGame() {
    await loadGameConfig();
    loadSavedGame();
    applyOfflineProgress();
    const config = getConfig();

    updateCraftableItems();
    updateAutomationControls();
    createGatheringActions(config.resources);
    updateGatherButtons();
    initBook();
    updateDisplay();

    // Event listeners
    // config.resources.forEach(resource => {
    //     document.getElementById(`gather-${resource}`).addEventListener('click', () => gatherResource(resource));
    // });
    document.getElementById('submit-puzzle').addEventListener('click', submitUnlockPuzzleAnswer);
    document.getElementById('close-puzzle').addEventListener('click', closePuzzlePopup);
    document.getElementById('settings-btn').addEventListener('click', openSettingsMenu);
    document.getElementById('close-settings').addEventListener('click', closeSettingsMenu);
    const saveBtn = document.getElementById('save-game-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveGame(true));
    }
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
    setInterval(saveGame, 30000); // Auto-save every 30 seconds
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
    consumeResources(1);
    if (gameState.time === 0) { // Start of a new day
        logDailyConsumption();
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
        daysSinceGrowth: 0,
        dailyFoodConsumed: 0,
        dailyWaterConsumed: 0
    });
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
}

// Initialize the game
initializeGame();