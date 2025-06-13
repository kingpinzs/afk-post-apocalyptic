import { gameState, loadGameConfig, getConfig, getPrestigeMultiplier } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, logEvent, submitUnlockPuzzleAnswer, closePuzzlePopup, openSettingsMenu, closeSettingsMenu, updateGatherButtons } from './ui.js';
import { gatherResource, scavenge, consumeResources, logDailyConsumption, produceResources, checkPopulationGrowth, trainWorker } from './resources.js';
import { updateCraftableItems, processQueue } from './crafting.js';
import { updateAutomationControls, runAutomation, hasActiveAutomation } from './automation.js';
import { prestigeGame, resetState } from './prestige.js';
import { checkForEvents, updateActiveEvents, advanceEventTime, hasActiveEvents } from './events.js';
import { initBook } from './book.js';
import { initAchievements } from './achievements.js';
import { startTutorial, checkTutorialProgress, nextStep, skipTutorial } from './tutorial.js';
import { recordResourceGain } from './stats.js';
import { initExpeditions, updateExpeditions, hasExpeditions } from './expeditions.js';

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
    const mult = getPrestigeMultiplier();
    Object.entries(gameState.automationAssignments).forEach(([itemId, count]) => {
        if (count <= 0) return;
        if (itemId.startsWith('gather_')) {
            const resource = itemId.replace('gather_', '');
            const gained = count * cycles * mult;
            gameState[resource] = (gameState[resource] || 0) + gained;
            recordResourceGain(resource, gained);
        } else {
            const item = config.items.find(i => i.id === itemId);
            if (item && item.effect) {
                Object.keys(item.effect).forEach(key => {
                    if (key.endsWith('ProductionRate')) {
                        const resource = key.replace('ProductionRate', '');
                        const gained = count * cycles * mult;
                        gameState[resource] = (gameState[resource] || 0) + gained;
                        recordResourceGain(resource, gained);
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
        checkForEvents();
        advanceEventTime(config.constants.DAY_LENGTH);
    }

    const prevSeason = gameState.seasonIndex;
    const daysPerSeason = config.constants.DAYS_PER_SEASON || 30;
    gameState.seasonIndex = Math.floor((gameState.day - 1) / daysPerSeason) % config.seasons.length;
    if (gameState.seasonIndex !== prevSeason) {
        logEvent(`The season has changed to ${config.seasons[gameState.seasonIndex].name}.`);
    }

    const remaining = seconds - daysPassed * config.constants.DAY_LENGTH;
    if (remaining > 0) {
        advanceEventTime(remaining);
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
    initAchievements();
    initExpeditions();
    updateDisplay();
    checkForEvents();

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
    const prestigeBtn = document.getElementById('prestige-btn');
    if (prestigeBtn) {
        prestigeBtn.addEventListener('click', prestigeGame);
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

    // Tutorial buttons
    const nextBtn = document.getElementById('tutorial-next');
    const skipBtn = document.getElementById('tutorial-skip');
    if (nextBtn) nextBtn.addEventListener('click', nextStep);
    if (skipBtn) skipBtn.addEventListener('click', skipTutorial);

    startTutorial();

    // Start game loop
    lastLoop = Date.now();
    scheduleNextLoop();
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

    // Scavenge mini-game button
    const scavengeAction = document.createElement('div');
    scavengeAction.className = 'gather-action';
    const scavengeBtn = document.createElement('button');
    scavengeBtn.id = 'scavenge';
    scavengeBtn.className = 'progress-button';
    scavengeBtn.innerHTML = '<span>Scavenge Ruins</span>';
    const scavengeBar = document.createElement('div');
    scavengeBar.className = 'progress-bar';
    scavengeBtn.appendChild(scavengeBar);
    scavengeBtn.addEventListener('click', scavenge);
    scavengeAction.appendChild(scavengeBtn);
    actionsContainer.appendChild(scavengeAction);
}

function gameLoop(delta) {
    const daysPassed = updateTime(delta);
    consumeResources(delta);
    for (let i = 0; i < daysPassed; i++) {
        logDailyConsumption();
        produceResources();
        checkPopulationGrowth();
        checkForEvents();
    }
    runAutomation(delta);
    updateActiveEvents(delta);
    updateExpeditions(delta);
    checkSurvival();
    checkTutorialProgress();
    updateDisplay();
    processQueue();
}

function updateTime(seconds) {
    const config = getConfig();
    const totalTime = gameState.time + seconds;
    const dayLength = config.constants.DAY_LENGTH;
    const daysPassed = Math.floor(totalTime / dayLength);
    gameState.time = totalTime % dayLength;
    if (daysPassed > 0) {
        gameState.day += daysPassed;
        gameState.daysSinceGrowth += daysPassed;
        checkSeasonChange();
    }
    updateTimeEmoji();
    updateTimeDisplay();
    return daysPassed;
}

function checkSeasonChange() {
    const config = getConfig();
    const days = config.constants.DAYS_PER_SEASON || 30;
    if ((gameState.day - 1) % days === 0 && gameState.day !== 1) {
        gameState.seasonIndex = (gameState.seasonIndex + 1) % config.seasons.length;
        const season = config.seasons[gameState.seasonIndex].name;
        logEvent(`The season has changed to ${season}.`);
    }
}

function checkSurvival() {
    if (gameState.food <= 0 || gameState.water <= 0) {
        alert('Game Over! Your population did not survive.');
        resetGame();
    }
}

function resetGame() {
    resetState();
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
}

let lastLoop = 0;

function isGameActive() {
    return (
        gameState.currentWork ||
        hasActiveAutomation() ||
        hasActiveEvents() ||
        hasExpeditions()
    );
}

function getUpdateInterval() {
    return isGameActive() ? 1000 : 5000;
}

function gameLoopWrapper() {
    const now = Date.now();
    const delta = (now - lastLoop) / 1000;
    lastLoop = now;
    gameLoop(delta);
    scheduleNextLoop();
}

function scheduleNextLoop() {
    setTimeout(gameLoopWrapper, getUpdateInterval());
}

async function startGame() {
    const loading = document.getElementById('loading-screen');
    if (loading) loading.style.display = 'flex';
    await initializeGame();
    if (loading) loading.style.display = 'none';
}

// Initialize the game
startGame();
