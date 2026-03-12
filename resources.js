/**
 * resources.js
 *
 * Handles gathering, consumption, population growth, and the unified study system.
 * v2 — chain-based architecture. Resources live in gameState.resources.X,
 * resource caps come from gameState.js getResourceCap(), tool speed multipliers
 * come from effects.js getEffect().
 *
 * Study system merges old book.js + resources.js study() into a single
 * chapter-based progression tied to knowledge buildings.
 */

import {
  gameState, getConfig, getResourceCap as _getResourceCap,
  computeUnlockedResources, getTotalHousing
} from './gameState.js';
import { getEffect } from './effects.js';
// UI imports — these may not all exist yet in the reworked codebase.
import { logEvent, updateDisplay, updateWorkingSection } from './ui.js';
// automation.js and crafting.js UI updates handled via updateDisplay() cycle
import { playGather, playUnlock } from './audio.js';

// Re-alias for internal use and backward-compatible re-export.
// gameState.js owns getResourceCap(); this module re-exports it so that
// other modules that historically imported it from resources.js still work.
const getResourceCap = _getResourceCap;


// ─── Interval / Gathering Tracking ───────────────────────────────────────────

let activeIntervals = [];

/** Active gathering sessions keyed by resource ID.
 *  Each value: { startTime, duration } for the most recent gather,
 *  but we also track worker count via gatherWorkers. */
const activeGathering = {};

/** How many workers are currently gathering each resource. */
const gatherWorkers = new Map();

function trackInterval(id) {
  activeIntervals.push(id);
}

function untrackInterval(id) {
  activeIntervals = activeIntervals.filter(i => i !== id);
}

/**
 * Clear all active intervals (gathering, studying, etc.) and reset worker tracking.
 * Called on game reset and settlement transitions.
 */
export function clearActiveIntervals() {
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
  gatherWorkers.clear();
  // Clear activeGathering flags
  for (const key of Object.keys(activeGathering)) {
    delete activeGathering[key];
  }
}

/**
 * Get the number of workers currently gathering a specific resource.
 * Used by UI to display worker counts on gather buttons.
 * @param {string} resource
 * @returns {number}
 */
export function getGatherCount(resource) {
  return gatherWorkers.get(resource) || 0;
}

/**
 * Reset all gathering state: clear worker counts, re-enable buttons, remove progress bars.
 * Called on game reset.
 */
export function resetGathering() {
  gatherWorkers.clear();
  for (const key of Object.keys(activeGathering)) {
    delete activeGathering[key];
  }

  // Reset UI for all raw resources
  let rawResources = [];
  try {
    const config = getConfig();
    rawResources = config.resources?.raw || [];
  } catch {
    // Config may not be loaded during early reset — skip UI cleanup
    return;
  }
  rawResources.forEach(resource => {
    const button = document.getElementById(`gather-${resource}`);
    if (button) {
      button.disabled = false;
      delete button.dataset.gathering;
    }
    const barsContainer = document.getElementById(`${resource}-bars`);
    if (barsContainer) {
      while (barsContainer.firstChild) barsContainer.removeChild(barsContainer.firstChild);
    }
  });
}


// ─── Worker Bar Colors ───────────────────────────────────────────────────────

const WORKER_COLORS = [
  '#00ffff', '#ff6b35', '#39ff14', '#ff3cac',
  '#ffe66d', '#7b68ee', '#ff4757', '#2ed573',
  '#1e90ff', '#ffa502'
];
let workerColorIndex = 0;


// ─── Tool Multiplier Mapping ─────────────────────────────────────────────────

/**
 * Get the tool speed multiplier for a given resource based on the
 * tool chain effects. Cutting tools speed fiber/herbs, chopping tools
 * speed wood, mining tools speed stone/ore/clay/sand, farming tools
 * speed food/fruit. Sticks and water have no tool requirement.
 *
 * @param {string} resource
 * @returns {number} Multiplier >= 1.0
 */
function getToolMultiplierForResource(resource) {
  switch (resource) {
    case 'fiber':
    case 'herbs':
      return getEffect('cuttingToolMultiplier', 1.0);
    case 'wood':
      return getEffect('choppingToolMultiplier', 1.0);
    case 'stone':
    case 'ore':
    case 'clay':
    case 'sand':
      return getEffect('miningToolMultiplier', 1.0);
    case 'food':
    case 'fruit':
      return getEffect('farmingToolMultiplier', 1.0);
    default:
      // sticks, water — no tool needed
      return 1.0;
  }
}


// ─── Gathering Time Calculation ──────────────────────────────────────────────

/**
 * Calculate effective gathering time for a resource (in ms).
 * Factors: base time, tool multiplier, difficulty bonus,
 * gathering efficiency (event modifiers), global tool/productivity effects.
 *
 * @param {string} resource
 * @returns {number} Time in milliseconds (minimum 500ms).
 */
function getGatheringTime(resource) {
  const config = getConfig();
  let baseTime = config.gatheringTimes[resource];
  if (!baseTime) baseTime = 3000; // fallback

  const toolMultiplier = getToolMultiplierForResource(resource);

  // Difficulty gathering bonus
  const preset = config.difficultyPresets?.[gameState.difficulty];
  const difficultyBonus = preset?.gatheringBonus || 1.0;

  // Study speed bonus applied to gathering as well? No — this is gathering-specific.
  const gatheringEfficiency = gameState.gatheringEfficiency || 1.0;

  // Global tool efficiency multiplier (e.g. blacksmith effect)
  const toolEff = getEffect('toolEfficiencyMultiplier', 1.0);

  // Global productivity multiplier (e.g. brewery effect)
  const productivity = getEffect('productivityMultiplier', 1.0);

  const effectiveTime = baseTime / (toolMultiplier * difficultyBonus * gatheringEfficiency * toolEff * productivity);

  return Math.max(500, effectiveTime); // Minimum 0.5s
}


// ─── Gathering ───────────────────────────────────────────────────────────────

/**
 * Start gathering a resource. Assigns a worker, shows a progress bar,
 * and completes after the calculated gathering time.
 *
 * @param {string} resource - One of the 11 raw resources.
 */
export function gatherResource(resource) {
  if (gameState.availableWorkers <= 0) {
    logEvent('No available workers to gather resources.');
    return;
  }

  // Don't gather if resource is already at cap
  const cap = getResourceCap(resource);
  if ((gameState.resources[resource] || 0) >= cap) {
    logEvent(`${resource.charAt(0).toUpperCase() + resource.slice(1)} storage is full.`);
    return;
  }

  const button = document.getElementById(`gather-${resource}`);

  // Assign worker
  gameState.availableWorkers--;
  gatherWorkers.set(resource, (gatherWorkers.get(resource) || 0) + 1);

  // Disable button if no more idle workers or resource is capped
  if (button && (gameState.availableWorkers <= 0 || (gameState.resources[resource] || 0) >= cap)) {
    button.disabled = true;
  }
  updateDisplay();

  // Create individual progress bar for this worker (stacked / overlapping)
  const color = WORKER_COLORS[workerColorIndex % WORKER_COLORS.length];
  workerColorIndex++;
  const barContainer = document.getElementById(`${resource}-bars`);
  let fill = null;
  if (barContainer) {
    // Ensure container is set up for stacking
    if (!barContainer.dataset.stacked) {
      barContainer.style.cssText += 'position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;';
      barContainer.dataset.stacked = '1';
    }
    fill = document.createElement('div');
    fill.style.cssText = `position:absolute;top:0;left:0;height:100%;width:0%;border-radius:4px;background:${color};opacity:0.7;transition:width 0.1s linear;`;
    barContainer.appendChild(fill);
  }

  let progress = 0;
  const tickInterval = 100;
  const duration = getGatheringTime(resource);

  // Track gathering metadata
  activeGathering[resource] = { startTime: Date.now(), duration };

  const progressInterval = setInterval(() => {
    // Stop gathering if game over mid-gather
    if (gameState.isGameOver) {
      clearInterval(progressInterval);
      untrackInterval(progressInterval);
      _returnGatherWorker(resource);
      if (fill) fill.remove();
      if (button) button.disabled = true;
      return;
    }

    progress += tickInterval;
    const percentage = Math.min(100, (progress / duration) * 100);
    if (fill) fill.style.width = `${percentage}%`;

    if (progress >= duration) {
      clearInterval(progressInterval);
      untrackInterval(progressInterval);
      _returnGatherWorker(resource);
      if (fill) fill.remove();
      delete activeGathering[resource];
      completeGathering(resource);
    }
  }, tickInterval);
  trackInterval(progressInterval);
}

/**
 * Return a worker from gathering duty. Decrements the per-resource worker count.
 * @param {string} resource
 */
function _returnGatherWorker(resource) {
  const count = gatherWorkers.get(resource) || 1;
  if (count <= 1) {
    gatherWorkers.delete(resource);
  } else {
    gatherWorkers.set(resource, count - 1);
  }
}

/**
 * Complete gathering: add the resource, log it, update stats,
 * check study gate, return the worker.
 * @param {string} resource
 */
function completeGathering(resource) {
  // Gather amount: base 1, can be boosted by tool multiplier
  const toolMult = getToolMultiplierForResource(resource);
  const amount = Math.max(1, Math.round(toolMult));

  addResource(resource, amount);
  logEvent(`Gathered ${amount} ${resource}.`);
  playGather();

  // Track stats
  gameState.stats.totalGathered = (gameState.stats.totalGathered || 0) + amount;

  // Check study gate — track per-resource progress
  if (gameState.studyGateProgress && Object.keys(gameState.studyGateProgress).length > 0) {
    if (gameState.studyGateProgress[resource] !== undefined) {
      gameState.studyGateProgress[resource] = Math.max(
        0, (gameState.studyGateProgress[resource] || 0) - amount
      );
    }
    // Check if all gate requirements are met (all values <= 0)
    const allMet = Object.values(gameState.studyGateProgress).every(v => v <= 0);
    if (allMet) {
      gameState.studyGateProgress = {};
      logEvent('Resources gathered! You can study again.');
    }
  }

  // Return worker
  gameState.availableWorkers++;

  // Re-enable gather button if we have workers and aren't capped
  const button = document.getElementById(`gather-${resource}`);
  if (button && gameState.availableWorkers > 0 && (gameState.resources[resource] || 0) < getResourceCap(resource)) {
    button.disabled = false;
  }

  updateDisplay();
}


// ─── Resource Helpers ────────────────────────────────────────────────────────

/**
 * Add a resource amount, capped at the resource's max capacity.
 * @param {string} resource - Resource ID.
 * @param {number} amount - Amount to add.
 */
export function addResource(resource, amount) {
  const cap = getResourceCap(resource);
  gameState.resources[resource] = Math.min(
    (gameState.resources[resource] || 0) + amount,
    cap
  );
}

/**
 * Ensure no resource exceeds its cap. Called periodically to enforce limits
 * after bulk operations (automation, events, etc.).
 */
export function capResources() {
  const config = getConfig();
  const allResources = [
    ...(config.resources?.raw || []),
    ...(config.resources?.processed || []),
    'hides'
  ];
  allResources.forEach(resource => {
    const cap = getResourceCap(resource);
    if ((gameState.resources[resource] || 0) > cap) {
      gameState.resources[resource] = cap;
    }
  });
}


// ─── Season Consumption Multiplier ───────────────────────────────────────────

/**
 * Get the food/water consumption multiplier based on current season.
 * Winter increases food consumption, summer decreases it.
 * @returns {{ foodMult: number, waterMult: number }}
 */
function getSeasonConsumptionMultiplier() {
  switch (gameState.currentSeason) {
    case 'winter':
      return { foodMult: 1.3, waterMult: 1.0 };
    case 'summer':
      return { foodMult: 0.9, waterMult: 1.1 };
    case 'autumn':
      return { foodMult: 1.0, waterMult: 0.95 };
    case 'spring':
    default:
      return { foodMult: 1.0, waterMult: 1.0 };
  }
}


// ─── Consumption ─────────────────────────────────────────────────────────────

/**
 * Consume food and water for the settlement. Called once per game day.
 * Uses LINEAR scaling with population (not sqrt) to create real pressure
 * to build food production infrastructure.
 *
 * Factors:
 *  - Base per-person rates from config constants
 *  - Shelter efficiency multiplier (better shelters reduce waste)
 *  - Water efficiency multiplier (irrigation, purification)
 *  - Difficulty consumption multiplier
 *  - Season multiplier (winter = more food needed)
 *
 * @returns {{ foodConsumed: number, waterConsumed: number }}
 */
export function consumeResources() {
  const config = getConfig();
  const pop = gameState.population;

  // Base per-person consumption from config
  const baseFoodPerPerson = config.constants.BASE_FOOD_PER_PERSON || 2;
  const baseWaterPerPerson = config.constants.BASE_WATER_PER_PERSON || 1.5;

  // Difficulty multiplier
  const preset = config.difficultyPresets?.[gameState.difficulty];
  const consumptionMult = preset?.consumptionMultiplier || 1.0;

  // Shelter efficiency — better shelters reduce resource waste
  const shelterMult = getEffect('resourceConsumptionMultiplier', 1.0);

  // Water efficiency — irrigation/purification systems reduce water need
  const waterEfficiency = getEffect('waterEfficiencyMultiplier', 1.0);

  // Season multiplier
  const season = getSeasonConsumptionMultiplier();

  // Food: BASE_FOOD_PER_PERSON * population * shelterMult * consumptionMult * seasonMult
  const foodConsumed = baseFoodPerPerson * pop * shelterMult * consumptionMult * season.foodMult;
  gameState.resources.food = Math.max(0, (gameState.resources.food || 0) - foodConsumed);

  // Water: BASE_WATER_PER_PERSON * population * shelterMult * (1/waterEfficiency) * consumptionMult
  // Note: waterEfficiency > 1 means LESS consumption, so we divide by it
  const waterConsumed = baseWaterPerPerson * pop * shelterMult * (1 / waterEfficiency) * consumptionMult * season.waterMult;
  gameState.resources.water = Math.max(0, (gameState.resources.water || 0) - waterConsumed);

  // Fuel consumption: only if power infrastructure exists
  // More fuel consumed in winter
  if (getEffect('fuelConsumptionRate', 0) > 0) {
    const fuelBase = getEffect('fuelConsumptionRate', 0);
    const winterFuelMult = gameState.currentSeason === 'winter' ? 1.5 : 1.0;
    const fuelConsumed = fuelBase * pop * winterFuelMult * consumptionMult;
    gameState.resources.fuel = Math.max(0, (gameState.resources.fuel || 0) - fuelConsumed);
  }

  // Medicine: consumed by medical building when treating sick — handled elsewhere (population.js)

  return { foodConsumed, waterConsumed };
}


// ─── Population Growth ───────────────────────────────────────────────────────

/**
 * Check if population should grow. Called once per game day.
 *
 * Growth conditions:
 *  1. Housing available (population < total housing capacity)
 *  2. Food above threshold
 *  3. Water above threshold
 *  4. Happiness > 40 (if happiness system active)
 *
 * Also handles immigration from culture/morale buildings independently.
 */
export function checkPopulationGrowth() {
  const config = getConfig();
  const housing = getTotalHousing();

  // Immigration — passive growth from culture/monument effects
  // Independent of resource thresholds, still needs housing
  const immigrationRate = getEffect('immigrationRate', 0);
  if (immigrationRate > 0 && gameState.population < housing && Math.random() < immigrationRate) {
    gameState.population++;
    gameState.availableWorkers++;
    gameState.stats.peakPopulation = Math.max(gameState.stats.peakPopulation || 0, gameState.population);
    logEvent('A new settler has arrived, attracted by your settlement!');
    updateDisplay();
  }

  // Standard resource-based growth
  if (gameState.population >= housing) return; // no room

  const threshold = config.constants.POPULATION_THRESHOLD || 50;
  if ((gameState.resources.food || 0) < threshold) return;
  if ((gameState.resources.water || 0) < threshold) return;

  // Happiness check — if happiness tracking exists on population members
  if (gameState.populationMembers.length > 0) {
    const avgHappiness = gameState.populationMembers.reduce(
      (sum, m) => sum + (m.happiness || 50), 0
    ) / gameState.populationMembers.length;
    if (avgHappiness < 40) return;
  }

  // Population health multiplier (apothecary, hospital) — reduces threshold requirement
  const healthMult = getEffect('populationHealthMultiplier', 1.0);
  const effectiveThreshold = healthMult > 1 ? Math.max(10, Math.floor(threshold / healthMult)) : threshold;

  // Consume resources and grow
  if ((gameState.resources.food || 0) >= effectiveThreshold && (gameState.resources.water || 0) >= effectiveThreshold) {
    // Happiness multiplier — makes growth probabilistic
    const happinessMult = getEffect('populationHappinessMultiplier', 1.0);
    if (happinessMult > 1) {
      const chance = Math.min(1, happinessMult * 0.5);
      if (Math.random() > chance) return;
    }

    gameState.population++;
    gameState.availableWorkers++;
    gameState.stats.peakPopulation = Math.max(gameState.stats.peakPopulation || 0, gameState.population);
    gameState.resources.food -= effectiveThreshold;
    gameState.resources.water -= effectiveThreshold;
    logEvent('The population has grown! You have a new available worker.');
    updateDisplay();
  }
}


// ─── Unified Study System ────────────────────────────────────────────────────

/**
 * Get the maximum chapter the player can access, based on knowledge building level.
 *  - Ch 1: always (no building needed)
 *  - Ch 2: Study Circle (knowledge level 1)
 *  - Ch 3: Library (knowledge level 2)
 *  - Ch 4: School (knowledge level 3)
 *  - Ch 5: University (knowledge level 4)
 *  - Ch 6: Research Lab (knowledge level 5)
 *  - Ch 7: Quantum Academy (knowledge level 6)
 *
 * @returns {number} Maximum accessible chapter (1-7).
 */
export function getCurrentChapter() {
  const knowledgeBuildingLevel = gameState.buildings.knowledge?.level || 0;
  // level 0 = chapter 1, level 1 = chapter 2, etc.
  return Math.min(knowledgeBuildingLevel + 1, 7);
}

/**
 * Find the next item to study in accessible chapters.
 * Returns the first unstudied item sorted by knowledgeRequired
 * that is within the player's current chapter access and knowledge level.
 *
 * @returns {object|null} The next item config object, or null if nothing to study.
 */
export function getNextStudyItem() {
  const config = getConfig();
  if (!config.items) return null;

  const maxChapter = getCurrentChapter();

  // Items sorted by knowledgeRequired, filtered to accessible chapters
  const studyableItems = config.items
    .filter(item => item.chapter <= maxChapter)
    .filter(item => !gameState.unlockedBlueprints.includes(item.id))
    .filter(item => item.knowledgeRequired <= (gameState.knowledge + 1)) // can study next one
    .filter(item => item.puzzle && item.puzzleAnswer) // must have a puzzle
    .sort((a, b) => a.knowledgeRequired - b.knowledgeRequired);

  return studyableItems[0] || null;
}

/**
 * Check if the study gate is met. The study gate requires the player to
 * gather resources between study sessions (learn → do → learn loop).
 *
 * Basic resources (sticks, food, water) are EXEMPT from the study gate.
 * Gate scales with knowledge level.
 *
 * @returns {boolean} True if the player can study again.
 */
export function isStudyGateMet() {
  // First study is always free
  if (gameState.knowledge === 0) return true;

  // If no gate is set, it's met
  if (!gameState.studyGateProgress || Object.keys(gameState.studyGateProgress).length === 0) {
    return true;
  }

  // Check if all requirements have been gathered (all values <= 0)
  return Object.values(gameState.studyGateProgress).every(v => v <= 0);
}

/**
 * Set a new study gate after completing a study session.
 * Requires gathering unlocked non-basic resources before next study.
 * Gate amount scales with knowledge.
 */
function setStudyGate() {
  const config = getConfig();
  const gateAmount = config.constants.STUDY_GATE_AMOUNT || 5;

  // Only gate on non-basic unlocked resources
  const gateableResources = (gameState.unlockedResources || [])
    .filter(r => r !== 'food' && r !== 'water' && r !== 'sticks');

  if (gateableResources.length === 0) {
    // No gateable resources yet — no gate
    gameState.studyGateProgress = {};
    return;
  }

  // Gate scales with knowledge: more knowledge = more resources needed
  const scaledAmount = gateAmount * (1 + Math.floor(gameState.knowledge / 10));
  const gate = {};
  gateableResources.forEach(r => { gate[r] = scaledAmount; });
  gameState.studyGateProgress = gate;

  const names = gateableResources
    .map(r => r.charAt(0).toUpperCase() + r.slice(1))
    .join(', ');
  logEvent(`Gather ${scaledAmount} of each resource (${names}) before studying again.`);
}

/**
 * Main study function. Opens the Book, studies the next page, shows a puzzle.
 *
 * Flow:
 *  1. Check prerequisites (no pending puzzle, gate met, workers available)
 *  2. Find next unstudied item in accessible chapters
 *  3. Consume paper for chapters 3+
 *  4. Progress bar → knowledge gained → puzzle presented
 */
export function study() {
  const config = getConfig();

  // If there's a pending puzzle, re-show it
  if (gameState.pendingPuzzle) {
    const pending = gameState.pendingPuzzle;
    const item = config.items.find(i => i.id === pending.id || i.id === pending.itemId);
    if (item && !gameState.unlockedBlueprints.includes(item.id)) {
      showStudyPuzzle(item);
      return;
    }
    // Stale puzzle — clear it
    gameState.pendingPuzzle = null;
  }

  // Check study gate
  if (!isStudyGateMet()) {
    logEvent('Gather the required resources before studying again.');
    return;
  }

  // Check worker availability
  if (gameState.availableWorkers <= 0) {
    logEvent('No available workers to study.');
    return;
  }

  // Find next item to study
  const nextItem = getNextStudyItem();
  if (!nextItem) {
    // Check if it's a chapter access issue
    const maxChapter = getCurrentChapter();
    const nextChapterItem = config.items.find(item =>
      item.chapter === maxChapter + 1 &&
      !gameState.unlockedBlueprints.includes(item.id)
    );
    if (nextChapterItem) {
      logEvent(`You need a better knowledge building to study Chapter ${maxChapter + 1}.`);
    } else {
      logEvent('Nothing left to study in the accessible chapters.');
    }
    return;
  }

  // Paper consumption for chapters 3+
  if (nextItem.chapter >= 3) {
    if ((gameState.resources.paper || 0) < 1) {
      logEvent('You need Paper to study advanced chapters.');
      return;
    }
    gameState.resources.paper -= 1;
  }

  // Assign worker
  gameState.availableWorkers--;
  updateDisplay();

  // Calculate study time
  const baseTime = config.constants.BASE_STUDY_TIME || 10000;
  const knowledgeMult = getEffect('knowledgeGenerationMultiplier', 1.0);
  const researchSpeed = getEffect('researchSpeedMultiplier', 1.0);

  // Difficulty study speed bonus
  const preset = config.difficultyPresets?.[gameState.difficulty];
  const studySpeedBonus = preset?.studySpeedBonus || 1.0;

  const effectiveTime = Math.max(200, baseTime / (knowledgeMult * researchSpeed * studySpeedBonus));

  // Start study progress
  gameState.studyProgress = 0;
  let progress = 0;
  const tickInterval = 100;

  const studyInterval = setInterval(() => {
    // Bail if game is over
    if (gameState.isGameOver) {
      clearInterval(studyInterval);
      untrackInterval(studyInterval);
      gameState.studyProgress = 0;
      gameState.availableWorkers++;
      return;
    }

    progress += tickInterval;
    gameState.studyProgress = Math.min(100, (progress / effectiveTime) * 100);

    if (progress >= effectiveTime) {
      clearInterval(studyInterval);
      untrackInterval(studyInterval);
      gameState.studyProgress = 0;

      // Return worker
      gameState.availableWorkers++;

      // Grant knowledge
      gameState.knowledge += 1;
      gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
      gameState.stats.totalStudied = (gameState.stats.totalStudied || 0) + 1;

      // Update current chapter tracker
      gameState.currentChapter = getCurrentChapter();

      // Discover new resources from this item
      computeUnlockedResources();

      // Set study gate for next study
      setStudyGate();

      // Present puzzle
      gameState.pendingPuzzle = { id: nextItem.id };
      playUnlock();
      showStudyPuzzle(nextItem);

      updateDisplay();
    }
  }, tickInterval);
  trackInterval(studyInterval);
}


// ─── Puzzle System ───────────────────────────────────────────────────────────

/**
 * Display the study puzzle popup for an item. Uses the existing puzzle-popup
 * DOM element with dataset attributes for puzzle type dispatching.
 *
 * @param {object} item - The item config object with puzzle/puzzleAnswer fields.
 */
function showStudyPuzzle(item) {
  const popup = document.getElementById('puzzle-popup');
  if (!popup) {
    // No popup element yet — auto-unlock the blueprint
    _unlockBlueprint(item);
    return;
  }

  popup.dataset.puzzleType = 'study';
  popup.dataset.itemId = item.id;
  popup.dataset.puzzleAnswer = item.puzzleAnswer || '';

  const questionEl = popup.querySelector('#puzzle-question') || popup.querySelector('.puzzle-question');
  if (questionEl) {
    questionEl.textContent = item.puzzle || 'What is this?';
  }

  // Reset progressive hints container
  const hintsEl = document.getElementById('puzzle-hints');
  if (hintsEl) {
    while (hintsEl.firstChild) hintsEl.removeChild(hintsEl.firstChild);
    hintsEl.dataset.hintIndex = '0';
  }

  // Re-enable hint button
  const hintBtn = document.getElementById('hint-puzzle');
  if (hintBtn) hintBtn.disabled = false;

  const answerInput = document.getElementById('puzzle-answer');
  if (answerInput) {
    answerInput.value = '';
  }

  popup.style.display = 'flex';
  if (answerInput) answerInput.focus();
}

/**
 * Submit a puzzle answer for the current pending puzzle.
 * Normalizes the answer (lowercase, strip articles) and checks against
 * the correct answer and acceptable alternatives.
 *
 * @param {string} answer - The player's answer text.
 * @returns {boolean} True if the answer was correct.
 */
export function submitPuzzleAnswer(answer) {
  if (!gameState.pendingPuzzle) return false;

  const config = getConfig();
  const itemId = gameState.pendingPuzzle.id || gameState.pendingPuzzle.itemId;
  const item = config.items.find(i => i.id === itemId);
  if (!item) {
    gameState.pendingPuzzle = null;
    return false;
  }

  // Normalize the answer
  const normalizedAnswer = answer.trim().toLowerCase().replace(/^(a|an|the)\s+/i, '');

  // Check main answer
  const correctAnswer = (item.puzzleAnswer || '').toLowerCase();

  // Check acceptable answers
  const acceptable = (item.acceptableAnswers || []).map(a => a.toLowerCase());

  if (normalizedAnswer === correctAnswer || acceptable.includes(normalizedAnswer)) {
    // Correct! Unlock blueprint
    _unlockBlueprint(item);
    return true;
  }

  logEvent('Incorrect answer. Try again!');
  return false;
}

/**
 * Get a hint for the current puzzle. Returns progressively more helpful hints.
 * @param {number} hintIndex - Which hint to show (0, 1, 2...).
 * @returns {string|null} The hint text, or null if no more hints.
 */
export function getPuzzleHint(hintIndex) {
  if (!gameState.pendingPuzzle) return null;

  const config = getConfig();
  const itemId = gameState.pendingPuzzle.id || gameState.pendingPuzzle.itemId;
  const item = config.items.find(i => i.id === itemId);
  if (!item || !item.hints) return null;

  return item.hints[hintIndex] || null;
}

/**
 * Skip the current puzzle. Saves it as pending so it re-shows on next study.
 */
export function skipPuzzle() {
  // pendingPuzzle stays set — it will re-show on next study() call
  const popup = document.getElementById('puzzle-popup');
  if (popup) popup.style.display = 'none';
}

/**
 * Internal: unlock a blueprint after correctly answering its puzzle.
 * Adds to unlockedBlueprints, discovers new resources, updates UI.
 *
 * @param {object} item - The item config object.
 */
function _unlockBlueprint(item) {
  if (!gameState.unlockedBlueprints.includes(item.id)) {
    gameState.unlockedBlueprints.push(item.id);
  }

  gameState.pendingPuzzle = null;

  // Discover new resources from this blueprint
  const newResources = computeUnlockedResources();
  if (newResources.length > 0) {
    newResources.forEach(r => {
      logEvent(`New resource discovered: ${r.charAt(0).toUpperCase() + r.slice(1)}!`);
    });
  }

  logEvent(`Correct! +1 knowledge. Unlocked: ${item.name}!`);
  playUnlock();

  // Show did-you-know fact
  if (item.didYouKnow) {
    logEvent(`Did you know? ${item.didYouKnow}`);
  }

  // Close puzzle popup
  const popup = document.getElementById('puzzle-popup');
  if (popup) popup.style.display = 'none';

  // Update UI
  updateDisplay();
}


// ─── Re-export getResourceCap for backward compatibility ─────────────────────
// Other modules that imported getResourceCap from resources.js can continue to do so.

export { getResourceCap };
