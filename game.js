import { gameState, loadGameConfig, getConfig, computeUnlockedResources } from './gameState.js';
import { updateDisplay, updateTimeDisplay, updateTimeEmoji, updateDayNightCycle, logEvent, submitUnlockPuzzleAnswer, submitItemUnlockPuzzleAnswer, showUnlockPuzzle, showItemUnlockPuzzle, findNextItemUnlock, showGameOver, clearEventLog, updateGatheringVisibility, updateTradingSection, updateExplorationSection, updateQuestsSection, updateAchievementsSection, updatePopulationSection, updateFactionsSection } from './ui.js';
import { updateTrading, executeTrade } from './trading.js';
import { gatherResource, consumeResources, capResources, checkPopulationGrowth, study, clearActiveIntervals, resetGathering } from './resources.js';
import { updateCraftableItems, processQueue, clearCraftingInterval } from './crafting.js';
import { updateAutomationControls, runAutomation } from './automation.js';
import { checkForEvents, updateActiveEvents, resetActiveEvents, updateWeather, checkMilestoneEvents } from './events.js';
import { saveGame, loadGame, hasSave, deleteSave } from './save.js';
import { initializePopulationMembers, updatePopulation, addPopulationMember } from './population.js';
import { initAudio, initMuteState, playClick, playGameOver, playVictory, toggleMute, isMuted } from './audio.js';
import { updateExplorations, startExploration } from './exploration.js';
import { checkQuestAvailability, checkQuestCompletion } from './quests.js';
import { checkAchievements } from './achievements.js';
import { getEffect } from './effects.js';
import { toggleTechTree } from './techtree.js';
import { initializeFactions, checkFactionAppearance, updateFactions, sendGift, establishTradeAgreement } from './factions.js';

let saveInterval = null;

function showGameUI() {
    document.getElementById('title-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('inventory').style.display = 'block';
        document.getElementById('bottom-nav').style.display = 'flex';
    }, 1000);
}

function hideGameUI() {
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('inventory').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('title-screen').style.opacity = '1';
}

async function initializeGame() {
    await loadGameConfig();
    const config = getConfig();

    // Show continue button if save exists
    if (hasSave()) {
        document.getElementById('continue-game').style.display = 'inline-block';
    }

    updateCraftableItems();
    updateAutomationControls();
    createGatheringActions(config.resources);
    computeUnlockedResources();
    updateGatheringVisibility();

    // Sound toggle — restore persisted mute preference
    initMuteState();
    const soundBtn = document.getElementById('sound-toggle');
    soundBtn.textContent = isMuted() ? '🔇' : '🔊';
    soundBtn.addEventListener('click', () => {
        initAudio();
        toggleMute();
        soundBtn.textContent = isMuted() ? '🔇' : '🔊';
    });

    // Puzzle submit — sound only on correct answer (handled inside submit functions)
    document.getElementById('submit-puzzle').addEventListener('click', () => {
        initAudio();
        const type = document.getElementById('puzzle-popup').dataset.puzzleType;
        if (type === 'item_unlock') submitItemUnlockPuzzleAnswer();
        else submitUnlockPuzzleAnswer();
    });

    document.getElementById('puzzle-answer').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('submit-puzzle').click();
        }
    });

    document.getElementById('skip-puzzle').addEventListener('click', () => {
        document.getElementById('puzzle-popup').style.display = 'none';
    });

    document.getElementById('restart-game').addEventListener('click', () => {
        document.getElementById('game-over-popup').style.display = 'none';
        resetGame();
    });

    // Victory popup handlers
    document.getElementById('victory-continue').addEventListener('click', () => {
        document.getElementById('victory-popup').style.display = 'none';
        // Enable sandbox mode: removes population cap, keep building freely
        gameState.sandboxMode = true;
        logEvent('Sandbox mode activated! Population cap removed. Keep building!');
    });

    document.getElementById('victory-restart').addEventListener('click', () => {
        document.getElementById('victory-popup').style.display = 'none';
        // Award prestige points before resetting
        const prestigeGain = calculatePrestigeGain();
        const stored = JSON.parse(localStorage.getItem('postapoc_prestige') || '{"points":0}');
        stored.points += prestigeGain;
        localStorage.setItem('postapoc_prestige', JSON.stringify(stored));
        logEvent(`Earned ${prestigeGain} prestige point${prestigeGain !== 1 ? 's' : ''}!`);
        resetGame();
        applyPrestigeBonuses();
    });

    // Tech tree toggle
    document.getElementById('tech-tree-toggle')?.addEventListener('click', () => {
        toggleTechTree();
    });

    // Difficulty selection — wire up before the start-game handler
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            gameState.difficulty = btn.dataset.difficulty;
        });
    });

    // New game button
    document.getElementById('start-game').addEventListener('click', () => {
        initAudio();
        playClick();
        showGameUI();
        // Show tutorial on first play
        if (!localStorage.getItem('postapoc_tutorial_seen')) {
            document.getElementById('tutorial-overlay').classList.add('active');
        }
        gameState.gameStarted = true;
        initializePopulationMembers();
        initializeFactions();
        checkQuestAvailability();
        startAutoSave();
    });

    // Continue game button
    document.getElementById('continue-game').addEventListener('click', () => {
        initAudio();
        playClick();
        if (loadGame()) {
            gameState.gameStarted = true;
            initializePopulationMembers();
            initializeFactions();
            showGameUI();
            computeUnlockedResources();
            updateGatheringVisibility();
            updateDisplay();
            updateCraftableItems();
            updateAutomationControls();
            updateDayNightCycle();
            updateTradingSection();
            updateExplorationSection();
            updateQuestsSection();
            updateAchievementsSection();
            updateFactionsSection();
            checkQuestAvailability();
            startAutoSave();
            logEvent('Game loaded.');

            // Trigger any pending unlock puzzles (fixes saves where puzzles were missed)
            const config = getConfig();
            const pendingPuzzle = config.unlockPuzzles.find(p =>
                !gameState.unlockedFeatures.includes(p.unlocks) &&
                gameState.knowledge >= p.knowledgeRequired
            );
            if (pendingPuzzle) {
                showUnlockPuzzle(pendingPuzzle);
            } else {
                const nextItem = findNextItemUnlock(config);
                if (nextItem) {
                    showItemUnlockPuzzle(nextItem);
                }
            }
        }
    });

    // Study button
    document.getElementById('study').addEventListener('click', () => {
        initAudio();
        study();
    });

    // Trade button delegation — handles all trade buttons inside #trader-list
    document.getElementById('trader-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-trader-idx]');
        if (!btn) return;
        initAudio();
        executeTrade(parseInt(btn.dataset.traderIdx), parseInt(btn.dataset.tradeIdx));
        updateTradingSection();
    });

    // Exploration button delegation — handles all explore buttons inside #exploration-locations
    document.getElementById('exploration-locations')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-location-id]');
        if (!btn) return;
        initAudio();
        startExploration(btn.dataset.locationId);
        updateExplorationSection();
    });

    // Faction button delegation — handles gift and trade agreement buttons inside #faction-list
    document.getElementById('faction-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-faction-id]');
        if (!btn) return;
        initAudio();
        const factionId = btn.dataset.factionId;
        const action = btn.dataset.action;
        if (action === 'gift') {
            sendGift(factionId, 'food', 10);
        } else if (action === 'trade') {
            establishTradeAgreement(factionId);
        }
        updateFactionsSection();
    });

    // Mod file handler — loads a custom JSON config and merges it with the base config
    document.getElementById('mod-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const customConfig = JSON.parse(text);

            // Validate basic structure — must provide at least one recognised key
            if (!customConfig.items && !customConfig.events && !customConfig.resources) {
                document.getElementById('mod-status').textContent = 'Invalid config: needs items, events, or resources';
                return;
            }

            // Merge custom data with the live base config
            const config = getConfig();
            if (customConfig.items) {
                config.items = [...config.items, ...customConfig.items];
            }
            if (customConfig.events) {
                config.events = [...config.events, ...customConfig.events];
            }
            if (customConfig.explorationLocations) {
                config.explorationLocations = [...(config.explorationLocations || []), ...customConfig.explorationLocations];
            }
            if (customConfig.quests) {
                config.quests = [...(config.quests || []), ...customConfig.quests];
            }
            if (customConfig.achievements) {
                config.achievements = [...(config.achievements || []), ...customConfig.achievements];
            }

            document.getElementById('mod-status').textContent = `Loaded: ${file.name}`;
            logEvent(`Mod loaded: ${file.name}`);

            // Refresh craftable items list to include any new items from the mod
            updateCraftableItems();
        } catch (err) {
            document.getElementById('mod-status').textContent = 'Error: Invalid JSON file';
            console.error('[mod] Failed to load mod:', err);
        }
    });

    // Camp tab mod file handler — mirrors the title-screen mod loader
    document.getElementById('camp-mod-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const customConfig = JSON.parse(text);

            if (!customConfig.items && !customConfig.events && !customConfig.resources) {
                document.getElementById('camp-mod-status').textContent = 'Invalid config: needs items, events, or resources';
                return;
            }

            const config = getConfig();
            if (customConfig.items) {
                config.items = [...config.items, ...customConfig.items];
            }
            if (customConfig.events) {
                config.events = [...config.events, ...customConfig.events];
            }
            if (customConfig.explorationLocations) {
                config.explorationLocations = [...(config.explorationLocations || []), ...customConfig.explorationLocations];
            }
            if (customConfig.quests) {
                config.quests = [...(config.quests || []), ...customConfig.quests];
            }
            if (customConfig.achievements) {
                config.achievements = [...(config.achievements || []), ...customConfig.achievements];
            }

            document.getElementById('camp-mod-status').textContent = `Loaded: ${file.name}`;
            logEvent(`Mod loaded: ${file.name}`);
            updateCraftableItems();
        } catch (err) {
            document.getElementById('camp-mod-status').textContent = 'Error: Invalid JSON file';
            console.error('[mod] Failed to load mod:', err);
        }
    });

    // Manual save button handler (dispatched from inline script via custom event)
    window.addEventListener('manual-save', () => {
        if (gameState.gameStarted && !gameState.isGameOver) {
            saveGame();
            showSaveIndicator();
            logEvent('Game saved manually.');
        }
    });

    // Start game loop
    setInterval(gameLoop, 1000);
}

function startAutoSave() {
    if (saveInterval) clearInterval(saveInterval);
    saveInterval = setInterval(() => {
        if (gameState.gameStarted && !gameState.isGameOver) {
            saveGame();
            showSaveIndicator();
        }
    }, 30000);
}

function showSaveIndicator() {
    const indicator = document.getElementById('save-indicator');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 1500);
}

function createGatheringActions(resources) {
    const actionsContainer = document.getElementById('actions-content');

    resources.forEach(resource => {
        const gatherAction = document.createElement('div');
        gatherAction.className = 'gather-action';
        gatherAction.dataset.resource = resource;

        const button = document.createElement('button');
        button.id = `gather-${resource}`;
        button.textContent = `Gather ${resource.charAt(0).toUpperCase() + resource.slice(1)}`;
        button.addEventListener('click', () => {
            initAudio();
            gatherResource(resource);
        });

        const barsContainer = document.createElement('div');
        barsContainer.id = `${resource}-bars`;
        barsContainer.style.cssText = 'flex:1;min-width:0;';

        gatherAction.appendChild(button);
        gatherAction.appendChild(barsContainer);
        actionsContainer.appendChild(gatherAction);
    });

    updateGatheringVisibility();
}

function gameLoop() {
    if (!gameState.gameStarted || gameState.isGameOver) return;

    updateTime();

    // Consume food/water at each meal time (breakfast, lunch, dinner)
    const config = getConfig();
    const mealTicks = config.constants.MEAL_TICKS || [0];
    if (mealTicks.includes(gameState.time)) {
        consumeResources(mealTicks.length);
    }

    // Day-start logic (after breakfast, so new pop eats at lunch/dinner)
    if (gameState.time === 0) {
        runAutomation();
        checkPopulationGrowth();
        updatePopulation();
        // Sync population members array with numeric population count
        while ((gameState.populationMembers?.length || 0) < gameState.population) {
            addPopulationMember();
        }
        checkForEvents();
        updateActiveEvents();
        updateWeather();
        checkMilestoneEvents();
        updateTrading();
        // Phase 4: daily systems
        updateExplorations();
        checkQuestAvailability();
        checkAchievements();
        // Phase 7: factions / diplomacy
        checkFactionAppearance();
        updateFactions();
        capResources();
    }
    // Phase 4: cheap per-tick quest completion check
    checkQuestCompletion();
    checkSurvival();
    updateDisplay();
    updateTradingSection();
    updateExplorationSection();
    updateQuestsSection();
    updateAchievementsSection();
    updatePopulationSection();
    updateFactionsSection();
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
    updateDayNightCycle();
}

function checkSurvival() {
    if (gameState.food <= 0 || gameState.water <= 0) {
        gameState.isGameOver = true;
        playGameOver();
        showGameOver();
        deleteSave();
    }
}

function resetGame() {
    const config = getConfig();

    document.getElementById('puzzle-popup').style.display = 'none';

    clearCraftingInterval();
    clearActiveIntervals();
    resetActiveEvents();
    resetGathering();

    Object.assign(gameState, config.initialState, {
        unlockedFeatures: [],
        craftedItems: {},
        automationAssignments: {},
        activeWork: [],
        craftingQueue: [],
        isGameOver: false,
        maxKnowledge: 0,
        gameStarted: true,
        gatheringEfficiency: 1,
        gatheringModifiers: [],
        unlockedResources: ['food', 'water'],
        studyGate: null,
        // Phase 2
        currentSeason: 'spring',
        currentWeather: 'clear',
        seenMilestones: [],
        // Phase 3
        currency: 0,
        traderVisits: [],
        activeTrades: [],
        // Phase 4
        explorations: [],
        activeQuests: [],
        completedQuests: [],
        achievements: [],
        stats: { totalCrafted: 0, totalGathered: 0, totalStudied: 0, totalTraded: 0, totalExplored: 0 },
        // Phase 5
        difficulty: gameState.difficulty || 'normal',
        populationMembers: [],
        // Phase 6
        prestigePoints: 0,
        prestigeBonuses: {},
        sandboxMode: false,
        // Phase 7
        factions: [],
        saveVersion: 1
    });
    gameState.availableWorkers = gameState.population;

    initializePopulationMembers();

    clearEventLog();
    computeUnlockedResources();
    updateGatheringVisibility();
    updateDisplay();
    updateCraftableItems();
    updateAutomationControls();
    updateDayNightCycle();
    updateTradingSection();
    updateExplorationSection();
    updateQuestsSection();
    updateAchievementsSection();
    updatePopulationSection();
    updateFactionsSection();
    checkQuestAvailability();
    deleteSave();
}

// ---------------------------------------------------------------------------
// Phase 6: Prestige helpers
// ---------------------------------------------------------------------------

/**
 * Calculate how many prestige points the player earns on victory restart.
 * Formula: floor(craftedItems / 5) * globalPrestigeMultiplier, minimum 1.
 *
 * @returns {number} Prestige points to award.
 */
function calculatePrestigeGain() {
    const basePts      = Math.floor(Object.keys(gameState.craftedItems).length / 5);
    const prestigeMult = getEffect('globalPrestigeMultiplier');
    return Math.max(1, Math.floor(basePts * (prestigeMult || 1)));
}

/**
 * Read accumulated prestige points from localStorage and apply passive bonuses
 * to the fresh gameState.
 *
 * Each prestige point grants +5% gathering efficiency (stacks with
 * item-based modifiers via gameState.gatheringEfficiency).
 */
function applyPrestigeBonuses() {
    const stored = JSON.parse(localStorage.getItem('postapoc_prestige') || '{"points":0}');
    if (stored.points > 0) {
        gameState.prestigePoints      = stored.points;
        // Each prestige point improves starting gathering efficiency by 5 %
        gameState.gatheringEfficiency = 1 + (stored.points * 0.05);
        logEvent(`Prestige bonus active: x${gameState.gatheringEfficiency.toFixed(2)} gathering efficiency from ${stored.points} prestige point${stored.points !== 1 ? 's' : ''}.`);
    }
}

initializeGame();
