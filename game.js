/**
 * game.js
 *
 * Main entry point and game loop for the post-apocalyptic survival game.
 * v2 — chain-based architecture. Orchestrates initialization, the main
 * game loop (per-second ticks with configurable day speed), event wiring,
 * and game lifecycle (new game, continue, reset).
 *
 * The game loop runs once per second. Day advancement is controlled by
 * gameState.settings.daySpeed (seconds per day, default 600 = 10 real minutes).
 */

// ─── Imports ──────────────────────────────────────────────────────────────────

import { gameState, loadGameConfig, getConfig, getConfigSafe, computeUnlockedResources, getWorkbenchLevel, resetSettlementState, notifyTab, getResourceCap } from './gameState.js';
import { gatherResource, consumeResources, capResources, checkPopulationGrowth, study, submitPuzzleAnswer, submitPuzzleChoice, clearActiveIntervals, resetGathering, getGatherCount, skipPuzzle, getPuzzleHint } from './resources.js';
import { getCraftableItems, startCrafting, getUpgradeOptions, clearCraftingInterval, getCraftingQueue } from './crafting.js';
import { runDailyProduction, getProductionSummary, assignWorkerToSingle, assignWorkerToMultiple, unassignAllWorkers } from './automation.js';
import { checkForEvents, updateActiveEvents, resetActiveEvents, updateWeather, checkMilestoneEvents } from './events.js';
import { updateDisplay, logEvent, initUI, switchTab, updateHUD, showPuzzlePopup, hidePuzzlePopup, showGameOver, showVictory, showAchievementToast, updateGatheringButtons, updateCraftingQueueDisplay, updateSettlementTab, updateBookTab, updateCraftingTab, updateProductionTab, updateExplorationTab, updateWorldTab, clearEventLog, updateDayNightCycle, updateTimeDisplay, updateTimeEmoji, updateGatheringVisibility, updateTradingSection, updateExplorationSection, updateQuestsSection, updateAchievementsSection, updatePopulationSection, updateFactionsSection, updateStatsSection, getShareableStats, showUnlockPuzzle, showItemUnlockPuzzle, submitUnlockPuzzleAnswer, submitItemUnlockPuzzleAnswer, findNextItemUnlock, updateWorkingSection, updateNetworkTab, showFlashback, startLoreSlideshow, navigateLoreSlideshow, closeLoreSlideshow, preRenderAllTabs } from './ui.js';
import { saveGame, loadGame, hasSave, deleteSave, exportSave, importSave } from './save.js';
import { updatePopulation, initializePopulationMembers, addPopulationMember } from './population.js';
import { initAudio, initMuteState, playClick, playGameOver, playVictory, playGather, playCraft, playUnlock, playWrong, toggleMute, isMuted } from './audio.js';
import { getEffect } from './effects.js';
import { isExplorationUnlocked, getAvailableLocations, startExploration, updateExplorations } from './exploration.js';
import { checkQuestAvailability, checkQuestCompletion } from './quests.js';
import { checkAchievements } from './achievements.js';
import { initializeFactions, checkFactionAppearance, updateFactions, sendGift, establishTradeAgreement } from './factions.js';
import { isTradingUnlocked, updateTrading, executeTrade } from './trading.js';
import { toggleTechTree } from './techtree.js';
import { initSettlements, createSettlement, switchSettlement } from './settlements.js';
import { initNetwork, createSupplyLine, removeSupplyLine, processSupplyLines } from './network.js';


// ─── Module State ─────────────────────────────────────────────────────────────

let gameLoopInterval = null;
let dayTickCounter = 0;
let mealsEatenToday = 0;  // Tracks meals consumed this day (0-3)
let saveInterval = null;


// ─── Game Initialization ──────────────────────────────────────────────────────

async function initializeGame() {
  // ── Load config first ──────────────────────────────────────────────
  await loadGameConfig();

  // Config-dependent early init
  try {
    const config = getConfig();

    // Phase 8: Multi-settlement initialisation
    initSettlements();
    initNetwork();

    // Compute initial resource visibility
    computeUnlockedResources();
    updateGatheringVisibility();
  } catch (err) {
    console.error('[init] Config-dependent init failed:', err);
  }

  // ── Everything below is pure DOM wiring — must always run ──────────
  // Sound toggle — restore persisted mute preference
  initMuteState();
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) {
    soundBtn.textContent = isMuted() ? '\u{1F507}' : '\u{1F50A}';
    soundBtn.addEventListener('click', () => {
      initAudio();
      toggleMute();
      soundBtn.textContent = isMuted() ? '\u{1F507}' : '\u{1F50A}';
    });
  }

  // ── Puzzle Popup Handlers (Multiple Choice) ────────────────────────────
  document.getElementById('puzzle-choices')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.puzzle-choice');
    if (!btn || btn.disabled) return;
    initAudio();

    const popup = document.getElementById('puzzle-popup');
    const type = popup?.dataset.puzzleType;

    if (type === 'study') {
      const choiceIndex = parseInt(btn.dataset.choice, 10);
      submitPuzzleChoice(choiceIndex);
    }
  });

  document.getElementById('puzzle-skip')?.addEventListener('click', () => {
    const popup = document.getElementById('puzzle-popup');
    const type = popup?.dataset.puzzleType;

    if (type === 'study') {
      skipPuzzle();
    } else if (type === 'unlock') {
      gameState.pendingPuzzle = { type: 'unlock', puzzleId: popup.dataset.puzzleId };
      popup.style.display = 'none';
    } else if (type === 'item_unlock') {
      gameState.pendingPuzzle = { type: 'item_unlock', itemId: popup.dataset.itemId };
      popup.style.display = 'none';
    } else {
      popup.style.display = 'none';
    }
  });

  document.getElementById('puzzle-hint')?.addEventListener('click', () => {
    initAudio();
    getPuzzleHint();
  });

  // ── Flashback Popup Handler ───────────────────────────────────────────
  document.getElementById('flashback-close')?.addEventListener('click', () => {
    const popup = document.getElementById('flashback-popup');
    if (popup) popup.style.display = 'none';
  });

  // ── Lore Archive Handlers ─────────────────────────────────────────────
  document.getElementById('lore-play-btn')?.addEventListener('click', () => {
    startLoreSlideshow();
  });

  document.getElementById('lore-prev')?.addEventListener('click', () => {
    navigateLoreSlideshow(-1);
  });

  document.getElementById('lore-next')?.addEventListener('click', () => {
    navigateLoreSlideshow(1);
  });

  document.getElementById('lore-slideshow-close')?.addEventListener('click', () => {
    closeLoreSlideshow();
  });

  // ── Memories Back Button ────────────────────────────────────────────
  document.getElementById('lore-back-btn')?.addEventListener('click', () => {
    const archive = document.getElementById('lore-archive');
    const bookMain = document.getElementById('book-main-content');
    if (archive) archive.classList.remove('active');
    if (bookMain) bookMain.style.display = '';
    // De-highlight the Memories nav button
    document.querySelector('.memories-btn.active')?.classList.remove('active');
  });

  // ── World pseudo-tab (inside Camp) ─────────────────────────────────────
  document.getElementById('world-view-btn')?.addEventListener('click', () => {
    const worldView = document.getElementById('world-view');
    const campMain = document.getElementById('camp-main-content');
    if (worldView) worldView.style.display = '';
    if (campMain) campMain.style.display = 'none';
  });

  document.getElementById('world-back-btn')?.addEventListener('click', () => {
    const worldView = document.getElementById('world-view');
    const campMain = document.getElementById('camp-main-content');
    if (worldView) worldView.style.display = 'none';
    if (campMain) campMain.style.display = '';
  });

  // ── Game Over / Victory Handlers ──────────────────────────────────────
  document.getElementById('restart-game')?.addEventListener('click', () => {
    document.getElementById('game-over-popup').style.display = 'none';
    resetGame();
  });

  document.getElementById('victory-continue')?.addEventListener('click', () => {
    document.getElementById('victory-popup').style.display = 'none';
    gameState.sandboxMode = true;
    logEvent('Sandbox mode activated! Population cap removed. Keep building!');
  });

  document.getElementById('victory-restart')?.addEventListener('click', () => {
    document.getElementById('victory-popup').style.display = 'none';
    resetGame();
  });

  // ── Tech Tree Toggle ──────────────────────────────────────────────────
  document.getElementById('tech-tree-toggle')?.addEventListener('click', () => {
    toggleTechTree();
  });

  // ── Restart Game Button (in World > Settings) ────────────────────────
  document.getElementById('restart-game-btn')?.addEventListener('click', () => {
    const popup = document.getElementById('restart-confirm-popup');
    if (popup) popup.style.display = 'flex';
  });
  document.getElementById('restart-confirm-yes')?.addEventListener('click', () => {
    document.getElementById('restart-confirm-popup').style.display = 'none';
    resetGame();
  });
  document.getElementById('restart-confirm-no')?.addEventListener('click', () => {
    document.getElementById('restart-confirm-popup').style.display = 'none';
  });

  // ── Dev Tools ──────────────────────────────────────────────────────────
  setupDevTools();

  // ── Study Button ──────────────────────────────────────────────────────
  document.getElementById('study-btn')?.addEventListener('click', () => {
    initAudio();
    study();
  });

  // ── Gathering Buttons (delegated) ─────────────────────────────────────
  document.getElementById('gathering-buttons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.gather-btn') || e.target.closest('button[id^="gather-"]');
    if (btn) {
      initAudio();
      const resource = btn.dataset.resource || btn.id?.replace('gather-', '');
      if (resource) gatherResource(resource);
    }
  });

  // ── Crafting Category Buttons (delegated) ─────────────────────────────
  document.getElementById('crafting-categories')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (btn) {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCraftingTab();
    }
  });

  // ── Crafting Item Clicks (delegated) ──────────────────────────────────
  document.getElementById('crafting-items')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.craft-btn') || e.target.closest('button[data-item-id]');
    if (btn && btn.dataset.itemId) {
      initAudio();
      const upgradeId = btn.dataset.upgradeInstanceId || null;
      if (startCrafting(btn.dataset.itemId, upgradeId)) {
        playCraft();
        logEvent(`Started crafting: ${btn.dataset.itemName || btn.dataset.itemId}`, 'craft');
        updateCraftingTab();
        updateCraftingQueueDisplay();
      }
    }
  });

  // ── Production Worker Assignment (delegated) ──────────────────────────
  document.getElementById('production-assignments')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.worker-btn') || e.target.closest('button[data-chain-id]');
    if (btn) {
      initAudio();
      const chainId = btn.dataset.chainId;
      const instanceId = btn.dataset.instanceId;
      const delta = parseInt(btn.dataset.delta);
      if (instanceId) {
        assignWorkerToMultiple(chainId, instanceId, delta);
      } else {
        assignWorkerToSingle(chainId, delta);
      }
      updateProductionTab();
    }
  });

  // ── Trade Button Delegation ───────────────────────────────────────────
  document.getElementById('trader-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-trader-idx]');
    if (!btn) return;
    initAudio();
    executeTrade(parseInt(btn.dataset.traderIdx), parseInt(btn.dataset.tradeIdx));
    updateTradingSection();
  });

  // ── Exploration Button Delegation ─────────────────────────────────────
  document.getElementById('exploration-locations')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-location-id]');
    if (!btn) return;
    initAudio();
    startExploration(btn.dataset.locationId);
    updateExplorationSection();
  });

  // ── Faction Button Delegation ─────────────────────────────────────────
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

  // ── Share Stats Button ────────────────────────────────────────────────
  document.getElementById('share-stats-btn')?.addEventListener('click', () => {
    const text = getShareableStats();
    navigator.clipboard.writeText(text).then(() => {
      logEvent('Stats copied to clipboard!');
      const btn = document.getElementById('share-stats-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Stats to Clipboard'; }, 2000);
    }).catch(() => {
      logEvent('Could not copy stats. Try manually.');
    });
  });

  // ── Manual Save (dispatched from inline script via custom event) ──────
  window.addEventListener('manual-save', () => {
    if (gameState.gameStarted && !gameState.isGameOver) {
      saveGame();
      showSaveIndicator();
      logEvent('Game saved manually.');
    }
  });

  // ── Export/Import Save Handlers ──────────────────────────────────────
  document.getElementById('export-save-btn')?.addEventListener('click', () => {
    const data = exportSave();
    if (!data) {
      logEvent('No save data to export.');
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postapoc_save_day${gameState.day}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const status = document.getElementById('export-save-status');
    if (status) {
      status.textContent = 'Save exported!';
      setTimeout(() => { status.textContent = ''; }, 3000);
    }
  });

  document.getElementById('import-save-btn')?.addEventListener('click', () => {
    document.getElementById('import-save-file')?.click();
  });

  document.getElementById('import-save-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (importSave(text)) {
        logEvent('Save imported. Reloading...');
        window.location.reload();
      } else {
        logEvent('Import failed: incompatible save version.');
      }
    } catch (err) {
      logEvent('Import failed: invalid file.');
      console.error('[import] Failed:', err);
    }
    e.target.value = ''; // reset file input
  });

  // ── Tech Tree Button ────────────────────────────────────────────────
  document.getElementById('tech-tree-btn')?.addEventListener('click', () => {
    toggleTechTree();
  });
  document.getElementById('tech-tree-close')?.addEventListener('click', () => {
    toggleTechTree();
  });

  // ── Auto-save on Tab Close / Background ───────────────────────────────
  window.addEventListener('beforeunload', () => {
    if (gameState.gameStarted) saveGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState.gameStarted) saveGame();
  });

  // ── Mod File Handlers ─────────────────────────────────────────────────
  document.getElementById('mod-file')?.addEventListener('change', async (e) => {
    await handleModFile(e, 'mod-status');
  });
  document.getElementById('camp-mod-file')?.addEventListener('change', async (e) => {
    await handleModFile(e, 'camp-mod-status');
  });

  // ── Phase 8: Network Tab Event Handlers ─────────────────────────────
  // All buttons are dynamically rendered by updateNetworkTab(), so we use
  // event delegation on the static parent containers (#network-map, #supply-lines).

  // Network map area: Found Settlement button + Switch Settlement buttons
  document.getElementById('network-map')?.addEventListener('click', (e) => {
    // Found New Settlement button
    const foundBtn = e.target.closest('#found-settlement-btn');
    if (foundBtn) {
      initAudio();
      playClick();
      const nameInput = document.getElementById('new-settlement-name');
      const name = (nameInput ? nameInput.value.trim() : '') ||
                   ('Settlement ' + ((gameState.settlements || []).length + 1));
      const newId = createSettlement(name);
      if (newId) {
        // After creating the new settlement, refresh all UI
        initializePopulationMembers();
        initializeFactions();
        computeUnlockedResources();
        updateGatheringVisibility();
        updateDisplay();
        updateNetworkTab();
        // Re-fetch nameInput since DOM was re-rendered
        const newNameInput = document.getElementById('new-settlement-name');
        if (newNameInput) newNameInput.value = '';
      }
      return;
    }

    // Switch Settlement button
    const switchBtn = e.target.closest('button[data-action="switch"]');
    if (switchBtn) {
      initAudio();
      playClick();
      const targetId = switchBtn.dataset.settlementId;
      if (targetId && switchSettlement(targetId)) {
        // Refresh all UI for the newly-loaded settlement
        initializePopulationMembers();
        initializeFactions();
        computeUnlockedResources();
        updateGatheringVisibility();
        updateDisplay();
        updateDayNightCycle();
        updateTradingSection();
        updateExplorationSection();
        updateQuestsSection();
        updateAchievementsSection();
        updatePopulationSection();
        updateFactionsSection();
        updateStatsSection();
        updateNetworkTab();
      }
      return;
    }
  });

  // Supply lines area: Create Supply Line + Remove Supply Line buttons
  document.getElementById('supply-lines')?.addEventListener('click', (e) => {
    // Create Supply Line button
    const createBtn = e.target.closest('#create-supply-line-btn');
    if (createBtn) {
      initAudio();
      playClick();
      const from = document.getElementById('sl-from')?.value;
      const to = document.getElementById('sl-to')?.value;
      const resource = document.getElementById('sl-resource')?.value;
      const amount = parseInt(document.getElementById('sl-amount')?.value || '5', 10);
      if (from && to && resource) {
        createSupplyLine(from, to, resource, amount);
        updateNetworkTab();
      }
      return;
    }

    // Remove Supply Line button
    const removeBtn = e.target.closest('button[data-action="remove-supply-line"]');
    if (removeBtn) {
      initAudio();
      playClick();
      removeSupplyLine(removeBtn.dataset.supplyLineId);
      updateNetworkTab();
      return;
    }
  });

  // ── Initialize UI Tabs ────────────────────────────────────────────────
  initUI();

  // Delegate gathering button clicks (buttons are created by updateGatheringButtons in ui.js)
  const gatherContainer = document.getElementById('gathering-buttons');
  if (gatherContainer) {
    gatherContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.gather-btn');
      if (!btn || btn.disabled) return;
      initAudio();
      gatherResource(btn.dataset.resource);
    });
  }

  // ── Auto-start or auto-continue (no title screen) ──────────────────
  // Show game UI immediately (behind splash screen)
  document.getElementById('game-container').style.display = 'block';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('bottom-nav').style.display = 'flex';

  if (hasSave()) {
    // Continue from saved game
    if (loadGame()) {
      gameState.gameStarted = true;
      initSettlements();
      initNetwork();
      initializePopulationMembers();
      initializeFactions();
      computeUnlockedResources();
      updateGatheringVisibility();
      preRenderAllTabs();
      checkQuestAvailability();
      startGameLoop();
      startAutoSave();
      logEvent('Game loaded.');

      // Show welcome-back popup after splash dismisses
      if (gameState._welcomeBackSummary) {
        const summary = gameState._welcomeBackSummary;
        delete gameState._welcomeBackSummary;
        setTimeout(() => showWelcomeBack(summary), 2500);
      }
    }
  } else {
    // New game — first time playing
    initSettlements();
    initNetwork();
    initializePopulationMembers();
    initializeFactions();
    gameState.gameStarted = true;
    computeUnlockedResources();
    updateGatheringVisibility();
    preRenderAllTabs();
    checkQuestAvailability();

    logEvent('You wake up alone in the wilderness. You have nothing but a worn book.', 'story');
    logEvent('Study the Book to learn how to survive.', 'info');

    startGameLoop();
    startAutoSave();

    // Show tutorial on first play
    if (!localStorage.getItem('postapoc_tutorial_seen')) {
      setTimeout(() => {
        const overlay = document.getElementById('tutorial-overlay');
        if (overlay) overlay.classList.add('active');
      }, 2500);
    }
  }

  // ── Dismiss splash after pre-render + font load ──────────────────
  const waitForFonts = new Promise(resolve => {
    if (window.__fontsLoaded) return resolve();
    const check = setInterval(() => {
      if (window.__fontsLoaded) { clearInterval(check); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(); }, 3000);
  });
  const minDelay = new Promise(r => setTimeout(r, 2000));
  Promise.all([waitForFonts, minDelay]).then(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('dismissed');
      setTimeout(() => { splash.style.display = 'none'; }, 900);
    }
  });
}


// ─── Dev Tools ───────────────────────────────────────────────────────────────

function setupDevTools() {
  // Toggle dev tools panel
  const header = document.querySelector('#dev-tools-card .section-header');
  const content = document.getElementById('dev-tools-content');
  if (header && content) {
    header.addEventListener('click', () => {
      const open = content.style.display !== 'none';
      content.style.display = open ? 'none' : 'block';
      const arrow = header.querySelector('.toggle-arrow');
      if (arrow) arrow.textContent = open ? '\u25BC' : '\u25B2';
    });
  }

  // Day speed selector
  document.getElementById('dev-day-speed')?.addEventListener('change', (e) => {
    const speed = parseInt(e.target.value, 10);
    if (speed > 0) {
      gameState.settings.daySpeed = speed;
      logEvent(`[Dev] Day speed set to ${speed}s.`);
    }
  });

  // Skip days
  document.getElementById('dev-skip-day')?.addEventListener('click', () => {
    advanceDay();
    logEvent('[Dev] Skipped 1 day.');
    updateDisplay();
  });
  document.getElementById('dev-skip-week')?.addEventListener('click', () => {
    for (let i = 0; i < 7; i++) advanceDay();
    logEvent('[Dev] Skipped 7 days.');
    updateDisplay();
  });

  // Add resources (delegated, respects cap)
  document.getElementById('dev-tools-content')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.dev-add-res');
    if (btn) {
      const res = btn.dataset.res;
      const amt = parseInt(btn.dataset.amt, 10) || 50;
      const cap = getResourceCap(res);
      const current = gameState.resources[res] || 0;
      const added = Math.min(amt, cap - current);
      if (added > 0) {
        gameState.resources[res] = current + added;
        logEvent(`[Dev] Added ${added} ${res}.`);
      } else {
        logEvent(`[Dev] ${res} already at cap (${cap}).`);
      }
      updateDisplay();
    }
  });

  // Fill all resources to their caps
  document.getElementById('dev-fill-all')?.addEventListener('click', () => {
    const config = getConfig();
    const allRes = (config.resources?.raw || []).concat(['food', 'water']);
    allRes.forEach(r => {
      gameState.resources[r] = getResourceCap(r);
    });
    logEvent('[Dev] Filled all resources to cap.');
    updateDisplay();
  });

  // Clear study gate
  document.getElementById('dev-clear-gate')?.addEventListener('click', () => {
    gameState.studyGateProgress = {};
    logEvent('[Dev] Study gate cleared.');
    updateDisplay();
  });

  // Add knowledge
  document.getElementById('dev-add-knowledge')?.addEventListener('click', () => {
    gameState.knowledge += 20;
    gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
    logEvent('[Dev] Added 20 knowledge.');
    updateDisplay();
  });

  // Add population
  document.getElementById('dev-add-pop')?.addEventListener('click', () => {
    gameState.population++;
    gameState.availableWorkers++;
    addPopulationMember();
    logEvent('[Dev] Added 1 population.');
    updateDisplay();
  });

  // Unlock all blueprints
  document.getElementById('dev-unlock-all')?.addEventListener('click', () => {
    const config = getConfig();
    if (config.items) {
      config.items.forEach(item => {
        if (!gameState.unlockedBlueprints.includes(item.id)) {
          gameState.unlockedBlueprints.push(item.id);
        }
      });
    }
    computeUnlockedResources();
    logEvent('[Dev] Unlocked all blueprints.');
    updateDisplay();
  });

  // Dump gameState to console
  document.getElementById('dev-dump-state')?.addEventListener('click', () => {
    console.log('[Dev] gameState:', JSON.parse(JSON.stringify(gameState)));
    logEvent('[Dev] GameState logged to console (F12).');
  });

  // Heal all sick members
  document.getElementById('dev-heal-all')?.addEventListener('click', () => {
    (gameState.populationMembers || []).forEach(m => {
      if (m.sick) {
        m.sick = false;
        m.sickDaysRemaining = 0;
        m.health = Math.min(100, m.health + 30);
      }
    });
    // Recalculate workers
    const sickCount = 0;
    const exploringWorkers = (gameState.explorations || [])
      .filter(e => e.inProgress)
      .reduce((sum, e) => sum + (e.workersOut || 1), 0);
    let automationWorkers = 0;
    for (const count of Object.values(gameState.automationAssignments || {})) {
      automationWorkers += count || 0;
    }
    for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
      for (const instance of (gameState.multipleBuildings[chainId] || [])) {
        automationWorkers += instance.workersAssigned || 0;
      }
    }
    gameState.availableWorkers = Math.max(0, gameState.population - sickCount - exploringWorkers - automationWorkers);
    logEvent('[Dev] Healed all sick members.');
    updateDisplay();
  });

  // Sync day speed selector with current setting on load
  const speedSelect = document.getElementById('dev-day-speed');
  if (speedSelect) {
    const current = gameState.settings?.daySpeed || 600;
    const option = speedSelect.querySelector(`option[value="${current}"]`);
    if (option) option.selected = true;
  }
}


// ─── Game Lifecycle ───────────────────────────────────────────────────────────


// ─── Game Loop ────────────────────────────────────────────────────────────────

function startGameLoop() {
  if (gameLoopInterval) clearInterval(gameLoopInterval);
  dayTickCounter = 0;
  mealsEatenToday = 0;

  gameLoopInterval = setInterval(() => {
    if (!gameState.gameStarted || gameState.isGameOver) return;

    gameState.time++;
    dayTickCounter++;

    const daySpeed = gameState.settings?.daySpeed || 600;

    // === Per-Second Updates ===
    updateTimeEmoji();
    updateTimeDisplay();
    updateDayNightCycle();
    checkQuestCompletion();
    checkSurvival();
    updateDisplay();

    // === Meal Consumption (3 meals spread across the day) ===
    const mealInterval = Math.floor(daySpeed / 3);
    const mealsExpected = Math.min(3, Math.floor(dayTickCounter / mealInterval));
    if (mealsExpected > mealsEatenToday) {
      consumeResources(mealsExpected - mealsEatenToday);
      mealsEatenToday = mealsExpected;
    }

    // === Flush deferred events once study finishes ===
    if (!gameState.isStudying && gameState._pendingEventCheck) {
      gameState._pendingEventCheck = false;
      checkForEvents();
      checkMilestoneEvents();
    }

    // === Day Advancement ===
    if (dayTickCounter >= daySpeed) {
      dayTickCounter = 0;
      advanceDay();
      mealsEatenToday = 0;
    }
  }, 1000);
}

function advanceDay() {
  gameState.day++;
  gameState.totalDaysPlayed++;
  gameState.stats.totalDaysInSettlement = (gameState.stats.totalDaysInSettlement || 0) + 1;

  // Meals are consumed gradually during the day (3 meal ticks in game loop).
  // Catch any remaining fraction if rounding left a meal unconsumed.
  if (mealsEatenToday < 3) {
    consumeResources(3 - mealsEatenToday);
    mealsEatenToday = 3;
  }

  // Production (workers produce resources)
  runDailyProduction();

  // Cap resources
  capResources();

  // Population update (health, happiness, skills, sickness)
  updatePopulation();

  // Snapshot counts for badge notifications
  const _prevPop = gameState.population;
  const _prevQuests = (gameState.activeQuests || []).length;
  const _prevAchievements = (gameState.achievements || []).length;
  const _prevFactions = (gameState.factions || []).length;
  const _prevTraders = (gameState.traderVisits || []).length;
  const _prevDiscovered = (gameState.discoveredLocations || []).length;

  // Population growth check
  checkPopulationGrowth();

  // Sync population members array with numeric population count
  while ((gameState.populationMembers?.length || 0) < gameState.population) {
    addPopulationMember();
  }

  // Weather update
  updateWeather();

  // Season advance (every 30 days)
  if (gameState.day % 30 === 0) {
    advanceSeason();
  }

  // Events — defer new event checks while the player is studying
  updateActiveEvents();
  if (!gameState.isStudying) {
    checkForEvents();
    checkMilestoneEvents();
  } else {
    gameState._pendingEventCheck = true;
  }

  // Exploration progress
  updateExplorations();

  // Factions
  checkFactionAppearance();
  updateFactions();

  // Trading
  if (isTradingUnlocked()) updateTrading();

  // Phase 8: Multi-settlement supply lines
  processSupplyLines();

  // Quests & achievements
  checkQuestAvailability();
  checkQuestCompletion();
  checkAchievements();

  // ── Badge notifications for changes that happened this day ──
  if (gameState.population > _prevPop) notifyTab('settlement', gameState.population - _prevPop);
  if ((gameState.activeQuests || []).length > _prevQuests) notifyTab('world');
  if ((gameState.achievements || []).length > _prevAchievements) notifyTab('world');
  if ((gameState.factions || []).length > _prevFactions) notifyTab('world');
  if ((gameState.traderVisits || []).length > _prevTraders) notifyTab('world');
  if ((gameState.discoveredLocations || []).length > _prevDiscovered) notifyTab('exploration');

  // Update section displays that need daily refresh
  updateTradingSection();
  updateExplorationSection();
  updateQuestsSection();
  updateAchievementsSection();
  updatePopulationSection();
  updateFactionsSection();
  updateStatsSection();
  updateNetworkTab();

  // Log day summary occasionally
  if (gameState.day % 5 === 0) {
    logEvent(
      `Day ${gameState.day} \u2014 Pop: ${gameState.population}, ` +
      `Food: ${Math.floor(gameState.resources.food)}, ` +
      `Water: ${Math.floor(gameState.resources.water)}`,
      'info'
    );
  }
}

function advanceSeason() {
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const currentIdx = seasons.indexOf(gameState.currentSeason);
  gameState.currentSeason = seasons[(currentIdx + 1) % 4];
  logEvent(`Season changed to ${gameState.currentSeason}.`, 'season');
}

function checkSurvival() {
  // Game over when food AND water are depleted and population is 0
  if (gameState.resources.food <= 0 && gameState.resources.water <= 0 && gameState.population <= 0) {
    gameState.isGameOver = true;
    playGameOver();
    showGameOver();
    deleteSave();
  }
}


// ─── Auto-Save ────────────────────────────────────────────────────────────────

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
  if (!indicator) return;
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 1500);
}


// ─── Welcome-Back Popup ──────────────────────────────────────────────────────

function showWelcomeBack(summary) {
  const popup = document.getElementById('welcome-back-popup');
  const content = document.getElementById('welcome-back-content');
  if (!popup || !content) return;

  const lines = [];
  lines.push(`You were away for <strong>${summary.daysAdvanced} game days</strong>.`);
  if (summary.capped) {
    lines.push(`<em>(capped from ${summary.rawDays} days)</em>`);
  }
  lines.push('');
  lines.push(`<span style="color:#f39c12">Food:</span> ${summary.foodBefore} &rarr; ${summary.foodAfter}`);
  lines.push(`<span style="color:#3498db">Water:</span> ${summary.waterBefore} &rarr; ${summary.waterAfter}`);
  if (summary.foodProduced > 0 || summary.waterProduced > 0) {
    lines.push('');
    lines.push(`Workers produced: +${summary.foodProduced} food, +${summary.waterProduced} water`);
  }
  if (summary.populationBefore !== summary.populationAfter) {
    lines.push(`<span style="color:#e74c3c">Population:</span> ${summary.populationBefore} &rarr; ${summary.populationAfter}`);
  }

  content.textContent = '';
  const div = document.createElement('div');
  // Build content safely from the summary data
  const p1 = document.createElement('p');
  p1.textContent = `You were away for ${summary.daysAdvanced} game days.`;
  if (summary.capped) {
    p1.textContent += ` (capped from ${summary.rawDays})`;
  }
  div.appendChild(p1);

  const stats = document.createElement('div');
  stats.style.cssText = 'margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:0.9em;';

  const addStat = (label, before, after, color) => {
    const row = document.createElement('div');
    row.style.cssText = `grid-column: 1 / -1; color:${color};`;
    row.textContent = `${label}: ${before} \u2192 ${after}`;
    stats.appendChild(row);
  };

  addStat('Food', summary.foodBefore, summary.foodAfter, '#f39c12');
  addStat('Water', summary.waterBefore, summary.waterAfter, '#3498db');
  if (summary.populationBefore !== summary.populationAfter) {
    addStat('Population', summary.populationBefore, summary.populationAfter, '#e74c3c');
  }

  if (summary.foodProduced > 0 || summary.waterProduced > 0) {
    const prod = document.createElement('div');
    prod.style.cssText = 'grid-column: 1 / -1; color:#2ecc71; margin-top:6px;';
    prod.textContent = `Workers produced: +${summary.foodProduced} food, +${summary.waterProduced} water`;
    stats.appendChild(prod);
  }

  div.appendChild(stats);
  content.appendChild(div);

  popup.style.display = 'flex';

  document.getElementById('welcome-back-dismiss')?.addEventListener('click', () => {
    popup.style.display = 'none';
  }, { once: true });
}


// ─── Gathering Action Buttons ─────────────────────────────────────────────────



// ─── Mod File Handler ─────────────────────────────────────────────────────────

async function handleModFile(e, statusElId) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const customConfig = JSON.parse(text);

    if (!customConfig.items && !customConfig.events && !customConfig.resources) {
      document.getElementById(statusElId).textContent = 'Invalid config: needs items, events, or resources';
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

    document.getElementById(statusElId).textContent = `Loaded: ${file.name}`;
    logEvent(`Mod loaded: ${file.name}`);
  } catch (err) {
    document.getElementById(statusElId).textContent = 'Error: Invalid JSON file';
    console.error('[mod] Failed to load mod:', err);
  }
}


// ─── Reset Game ───────────────────────────────────────────────────────────────

function resetGame() {
  // Close any open popups
  const puzzlePopup = document.getElementById('puzzle-popup');
  if (puzzlePopup) puzzlePopup.style.display = 'none';

  // Clear all intervals
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  clearActiveIntervals();
  clearCraftingInterval();
  resetGathering();
  resetActiveEvents();

  // Reset state to defaults using resetSettlementState (preserves structure)
  resetSettlementState();

  // Also reset global state for a full reset
  gameState.knowledge = 0;
  gameState.maxKnowledge = 0;
  gameState.unlockedBlueprints = [];
  gameState.currency = 0;
  gameState.achievements = [];
  gameState.completedQuests = [];
  gameState.totalDaysPlayed = 0;
  gameState.toolLevels = {
    cutting: 0, chopping: 0, mining: 0,
    construction: 0, farming: 0, fishing: 0, hunting: 0
  };
  for (const chainId of Object.keys(gameState.tools)) {
    gameState.tools[chainId] = { level: 0, itemId: null };
  }
  gameState.factions = [];
  gameState.settlements = [];
  gameState.supplyLines = [];
  gameState.collectedLore = [];
  gameState.seenLoreEvents = [];
  gameState.tabNotifications = {};
  gameState.isStudying = false;
  gameState._pendingEventCheck = false;

  gameState.isGameOver = false;
  gameState.gameStarted = true;
  gameState.sandboxMode = false;

  gameState.availableWorkers = gameState.population;

  // Re-initialise settlement/network systems
  initSettlements();
  initNetwork();

  // Initialize new population
  initializePopulationMembers();
  initializeFactions();

  // Delete save
  deleteSave();

  // Update all UI
  clearEventLog();
  computeUnlockedResources();
  updateGatheringVisibility();
  preRenderAllTabs();
  checkQuestAvailability();

  logEvent('You wake up alone in the wilderness. You have nothing but a worn book.', 'story');
  logEvent('Study the Book to learn how to survive.', 'info');

  // Restart game loop
  startGameLoop();
  startAutoSave();
}


// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Signal to the non-module debug script that the ES6 module loaded successfully
// window.__moduleLoaded = true;
// if (window.__dbg) window.__dbg('game.js module loaded successfully');

initializeGame().catch(err => {
  console.error('[bootstrap] initializeGame failed:', err);
});
