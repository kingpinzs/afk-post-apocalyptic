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
import { updateDisplay, logEvent, initUI, switchTab, updateHUD, showPuzzlePopup, hidePuzzlePopup, showGameOver, showVictory, showAchievementToast, updateGatheringButtons, updateCraftingQueueDisplay, updateSettlementTab, updateBookTab, updateCraftingTab, updateProductionTab, updateExplorationTab, updateWorldTab, clearEventLog, updateDayNightCycle, updateTimeDisplay, updateTimeEmoji, updateGatheringVisibility, updateTradingSection, updateExplorationSection, updateQuestsSection, updateAchievementsSection, updatePopulationSection, updateFactionsSection, updateStatsSection, getShareableStats, showUnlockPuzzle, showItemUnlockPuzzle, submitUnlockPuzzleAnswer, submitItemUnlockPuzzleAnswer, findNextItemUnlock, updateWorkingSection, updateNetworkTab, showFlashback, startLoreSlideshow, navigateLoreSlideshow, closeLoreSlideshow, preRenderAllTabs, updateWeatherEffects } from './ui.js';
import { saveGame, loadGame, hasSave, deleteSave, exportSave, importSave, simulateOfflineDays } from './save.js';
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

  // ── Built Buildings Upgrade Clicks (delegated) ────────────────────────
  document.getElementById('built-buildings')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-item-id]');
    if (btn && btn.dataset.itemId) {
      initAudio();
      const upgradeId = btn.dataset.upgradeInstanceId || null;
      if (startCrafting(btn.dataset.itemId, upgradeId)) {
        playCraft();
        logEvent(`Started crafting: ${btn.dataset.itemName || btn.dataset.itemId}`, 'craft');
        updateSettlementTab();
        updateCraftingQueueDisplay();
      }
    }
  });

  // ── Production Worker Assignment (delegated) ──────────────────────────
  document.getElementById('production-assignments')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.assign-worker-btn');
    if (btn) {
      initAudio();
      const chainId = btn.dataset.chain;
      const instanceId = btn.dataset.instance;
      const delta = btn.dataset.action === 'add' ? 1 : -1;
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

  // ── Auto-save & AFK Detection (browser + Android Capacitor) ──────────
  // Shared handlers for going AFK and coming back
  function onGoingAway() {
    if (!gameState.gameStarted || gameState._restarting) return;
    gameState._wentAfkAt = Date.now();
    saveGame();
  }

  function onComingBack() {
    if (!gameState.gameStarted || gameState._restarting || !gameState._wentAfkAt) return;
    handleAfkReturn();
  }

  // Browser: tab close
  window.addEventListener('beforeunload', () => {
    if (gameState.gameStarted && !gameState._restarting) saveGame();
  });

  // Browser: tab visibility (works in Chrome, Firefox, Safari)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onGoingAway();
    else onComingBack();
  });

  // Android Capacitor: app backgrounded/foregrounded
  // These fire on WebView pause/resume which visibilitychange may miss
  document.addEventListener('pause', onGoingAway);
  document.addEventListener('resume', onComingBack);

  // iOS Capacitor / PWA: page show/hide (bfcache, app switching)
  window.addEventListener('pagehide', onGoingAway);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) onComingBack(); // restored from bfcache
  });

  // Fallback: detect long gaps between game loop ticks
  // If the loop fires and >30s passed since last tick, treat as AFK return
  let lastTickTime = Date.now();
  const origSetInterval = gameLoopInterval; // will be set by startGameLoop
  const AFK_GAP_MS = 30000;
  window._checkTickGap = function () {
    const now = Date.now();
    const gap = now - lastTickTime;
    lastTickTime = now;
    if (gap > AFK_GAP_MS && gameState.gameStarted && !gameState._restarting) {
      // Big gap detected — browser throttled the interval while away
      if (!gameState._wentAfkAt) {
        gameState._wentAfkAt = now - gap;
      }
      handleAfkReturn();
    }
  };

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
        updateWeatherEffects();
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

  // Weather override
  document.getElementById('dev-weather')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      gameState.currentWeather = val;
      gameState._weatherOverride = val;
      logEvent(`[Dev] Weather forced to ${val}.`);
    } else {
      delete gameState._weatherOverride;
      logEvent('[Dev] Weather set to auto.');
    }
    updateDisplay();
    updateDayNightCycle();
    updateWeatherEffects();
  });

  // Season override
  document.getElementById('dev-season')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      gameState.currentSeason = val;
      gameState._seasonOverride = val;
      logEvent(`[Dev] Season forced to ${val}.`);
    } else {
      delete gameState._seasonOverride;
      logEvent('[Dev] Season set to auto.');
    }
    updateDisplay();
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

    // Check for long tick gaps (browser throttled while backgrounded)
    if (window._checkTickGap) window._checkTickGap();

    gameState.time++;
    dayTickCounter++;

    const daySpeed = gameState.settings?.daySpeed || 600;

    // === Per-Second Updates ===
    updateTimeEmoji();
    updateTimeDisplay();
    updateDayNightCycle();
    updateWeatherEffects();
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

  content.textContent = '';
  const wrap = document.createElement('div');

  // Time away header
  const timeRow = document.createElement('div');
  timeRow.style.cssText = 'text-align:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid rgba(0,255,255,0.15);';
  const dayText = document.createElement('div');
  dayText.style.cssText = 'font-size:1.8em; font-weight:700; color:#00ffff;';
  dayText.textContent = `${summary.daysAdvanced}`;
  timeRow.appendChild(dayText);
  const dayLabel = document.createElement('div');
  dayLabel.style.cssText = 'font-size:0.7em; color:#8494a7; text-transform:uppercase; letter-spacing:2px;';
  dayLabel.textContent = summary.daysAdvanced === 1 ? 'day passed' : 'days passed';
  timeRow.appendChild(dayLabel);
  if (summary.capped) {
    const capNote = document.createElement('div');
    capNote.style.cssText = 'font-size:0.6em; color:#f39c12; margin-top:4px;';
    capNote.textContent = `(capped from ${summary.rawDays} days)`;
    timeRow.appendChild(capNote);
  }
  wrap.appendChild(timeRow);

  // Resource changes
  const buildRow = (icon, label, before, after, color) => {
    const net = after - before;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const iconEl = document.createElement('span');
    iconEl.style.cssText = `font-size:1em;`;
    iconEl.textContent = icon;
    left.appendChild(iconEl);
    const labelEl = document.createElement('span');
    labelEl.style.cssText = `font-size:0.85em; color:${color}; font-weight:500;`;
    labelEl.textContent = label;
    left.appendChild(labelEl);
    row.appendChild(left);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const vals = document.createElement('span');
    vals.style.cssText = 'font-size:0.8em; color:#bdc3c7;';
    vals.textContent = `${before} \u2192 ${after}`;
    right.appendChild(vals);
    const netEl = document.createElement('span');
    const netColor = net > 0 ? '#2ecc71' : net < 0 ? '#e74c3c' : '#7f8c8d';
    const netSign = net > 0 ? '+' : '';
    netEl.style.cssText = `font-size:0.75em; padding:2px 6px; border-radius:4px; font-weight:600; color:${netColor}; background:${net > 0 ? 'rgba(46,204,113,0.12)' : net < 0 ? 'rgba(231,76,60,0.12)' : 'rgba(127,140,141,0.1)'};`;
    netEl.textContent = `${netSign}${net}`;
    right.appendChild(netEl);
    row.appendChild(right);

    return row;
  };

  const statsSection = document.createElement('div');
  statsSection.style.cssText = 'margin-bottom:10px;';
  statsSection.appendChild(buildRow('\uD83C\uDF3E', 'Food', summary.foodBefore, summary.foodAfter, '#f39c12'));
  statsSection.appendChild(buildRow('\uD83D\uDCA7', 'Water', summary.waterBefore, summary.waterAfter, '#3498db'));
  if (summary.populationBefore !== summary.populationAfter) {
    statsSection.appendChild(buildRow('\uD83D\uDC65', 'Population', summary.populationBefore, summary.populationAfter, '#bb86fc'));
  }
  wrap.appendChild(statsSection);

  // Production breakdown if workers produced anything
  if (summary.foodProduced > 0 || summary.waterProduced > 0) {
    const prodSection = document.createElement('div');
    prodSection.style.cssText = 'background:rgba(46,204,113,0.06); border:1px solid rgba(46,204,113,0.15); border-radius:8px; padding:8px 10px; margin-bottom:10px;';
    const prodTitle = document.createElement('div');
    prodTitle.style.cssText = 'font-size:0.6em; color:#2ecc71; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;';
    prodTitle.textContent = 'Worker Production';
    prodSection.appendChild(prodTitle);
    const prodDetails = document.createElement('div');
    prodDetails.style.cssText = 'font-size:0.8em; color:#e0e4e8;';
    const parts = [];
    if (summary.foodProduced > 0) parts.push(`+${summary.foodProduced} food`);
    if (summary.waterProduced > 0) parts.push(`+${summary.waterProduced} water`);
    prodDetails.textContent = parts.join('  \u00B7  ');
    prodSection.appendChild(prodDetails);
    wrap.appendChild(prodSection);
  }

  // Consumption breakdown
  if (summary.foodConsumed > 0 || summary.waterConsumed > 0) {
    const consSection = document.createElement('div');
    consSection.style.cssText = 'background:rgba(231,76,60,0.06); border:1px solid rgba(231,76,60,0.15); border-radius:8px; padding:8px 10px;';
    const consTitle = document.createElement('div');
    consTitle.style.cssText = 'font-size:0.6em; color:#e74c3c; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;';
    consTitle.textContent = 'Consumed';
    consSection.appendChild(consTitle);
    const consDetails = document.createElement('div');
    consDetails.style.cssText = 'font-size:0.8em; color:#e0e4e8;';
    const parts = [];
    if (summary.foodConsumed > 0) parts.push(`-${summary.foodConsumed} food`);
    if (summary.waterConsumed > 0) parts.push(`-${summary.waterConsumed} water`);
    consDetails.textContent = parts.join('  \u00B7  ');
    consSection.appendChild(consDetails);
    wrap.appendChild(consSection);
  }

  content.appendChild(wrap);
  popup.style.display = 'flex';

  document.getElementById('welcome-back-dismiss')?.addEventListener('click', () => {
    popup.style.display = 'none';
  }, { once: true });
}


// ─── AFK / Tab-Return Handler ─────────────────────────────────────────────────

/**
 * Called when the player returns to the tab after being away.
 * Calculates elapsed real time, simulates missed game days, and shows summary.
 * Minimum 60 seconds away to trigger AFK catch-up (avoids spurious triggers).
 */
function handleAfkReturn() {
  const afkStart = gameState._wentAfkAt;
  delete gameState._wentAfkAt;
  if (!afkStart) return;

  const elapsedMs = Date.now() - afkStart;
  const MIN_AFK_MS = 60 * 1000; // 1 minute minimum to trigger AFK
  if (elapsedMs < MIN_AFK_MS) return;

  const daySpeed = gameState.settings?.daySpeed || 600;
  const offlineDays = Math.floor(elapsedMs / (1000 * daySpeed));
  if (offlineDays <= 0) return;

  const summary = simulateOfflineDays(offlineDays);
  console.info('[afk] Tab return after %ds (%d game days). Summary:', Math.round(elapsedMs / 1000), offlineDays, summary);

  // Reset the game loop tick counters to sync with new state
  dayTickCounter = 0;
  mealsEatenToday = 0;

  // Refresh UI
  computeUnlockedResources();
  updateGatheringVisibility();
  updateDisplay();

  // Show welcome-back popup
  showWelcomeBack(summary);
  logEvent(`You were away for ${offlineDays} day${offlineDays > 1 ? 's' : ''}. Check the summary!`);
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
  // Prevent beforeunload from re-saving
  gameState._restarting = true;

  // Stop everything
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

  // Delete save and clear tutorial flag so intro shows again
  deleteSave();
  localStorage.removeItem('postapoc_tutorial_seen');

  // Show splash screen with fresh loading animation, then reload
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.display = '';
    splash.classList.remove('dismissed');
    const statusText = document.getElementById('splash-status-text');
    if (statusText) statusText.textContent = 'Restarting';
  }

  // Hide game UI behind splash
  document.getElementById('game-container').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';

  // Close any open popups
  document.querySelectorAll('.popup').forEach(p => p.style.display = 'none');
  const gameOverPopup = document.getElementById('game-over-popup');
  if (gameOverPopup) gameOverPopup.style.display = 'none';
  const restartPopup = document.getElementById('restart-confirm-popup');
  if (restartPopup) restartPopup.style.display = 'none';

  // Reload the page after a brief splash display — full clean start
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}


// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Signal to the non-module debug script that the ES6 module loaded successfully
// window.__moduleLoaded = true;
// if (window.__dbg) window.__dbg('game.js module loaded successfully');

initializeGame().catch(err => {
  console.error('[bootstrap] initializeGame failed:', err);
});
