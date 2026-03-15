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
  computeUnlockedResources, getTotalHousing, notifyTab
} from './gameState.js';
import { getEffect } from './effects.js';
// UI imports — these may not all exist yet in the reworked codebase.
import { logEvent, updateDisplay, updateWorkingSection, showFlashback } from './ui.js';
// automation.js and crafting.js UI updates handled via updateDisplay() cycle
import { playGather, playUnlock, playWrong } from './audio.js';

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
export function getToolMultiplierForResource(resource) {
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


/**
 * Get gathering info for a resource: speed multiplier, gather amount, and active bonuses.
 * Used by the UI to display modifier badges on gather buttons.
 *
 * @param {string} resource
 * @returns {{ speedMult: number, amount: number, bonuses: string[] }}
 */
export function getGatherInfo(resource) {
  const toolMult = getToolMultiplierForResource(resource);
  const toolEff = getEffect('toolEfficiencyMultiplier', 1.0);
  const productivity = getEffect('productivityMultiplier', 1.0);
  const gatheringEfficiency = gameState.gatheringEfficiency || 1.0;

  const speedMult = toolMult * toolEff * productivity * gatheringEfficiency;
  const amount = Math.max(1, Math.round(toolMult));

  const bonuses = [];
  if (toolMult > 1) bonuses.push('Tool x' + toolMult.toFixed(1));
  if (toolEff > 1) bonuses.push('Forge x' + toolEff.toFixed(1));
  if (productivity > 1) bonuses.push('Productivity x' + productivity.toFixed(1));
  if (gatheringEfficiency > 1) bonuses.push('Event x' + gatheringEfficiency.toFixed(1));

  return { speedMult, amount, bonuses };
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

  // Create individual progress fill for this worker (stacked inside button)
  const color = WORKER_COLORS[workerColorIndex % WORKER_COLORS.length];
  workerColorIndex++;
  const barContainer = document.getElementById(`${resource}-bars`);
  let fill = null;
  if (barContainer) {
    fill = document.createElement('div');
    fill.style.cssText = `position:absolute;top:0;left:0;height:100%;width:0%;background:${color};opacity:0.25;transition:width 0.1s linear;`;
    barContainer.appendChild(fill);
  }

  const tickInterval = 200;
  const duration = getGatheringTime(resource);
  const gatherStartTime = Date.now();

  // Track gathering metadata
  activeGathering[resource] = { startTime: gatherStartTime, duration };

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

    const elapsed = Date.now() - gatherStartTime;
    const percentage = Math.min(100, (elapsed / duration) * 100);
    if (fill) fill.style.width = `${percentage}%`;

    if (elapsed >= duration) {
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
/**
 * Consume food, water, and fuel for one meal.
 * Called 3 times per game day (morning, midday, evening) so consumption
 * drains gradually rather than all at once.
 *
 * Each call consumes 1/3 of the daily total per person.
 * Daily totals: BASE_FOOD_PER_PERSON (2) food, BASE_WATER_PER_PERSON (1.5) water.
 *
 * @param {number} [meals=1] - Number of meals to consume (1 for normal tick, 3 for full-day catch-up).
 */
export function consumeResources(meals = 1) {
  const config = getConfig();
  const pop = gameState.population;
  const MEALS_PER_DAY = 3;

  // Base per-person consumption from config (daily total)
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

  // Per-meal fraction of the daily total
  const mealFraction = meals / MEALS_PER_DAY;

  // Food: (daily rate) * mealFraction
  const foodConsumed = baseFoodPerPerson * pop * shelterMult * consumptionMult * season.foodMult * mealFraction;
  gameState.resources.food = Math.max(0, (gameState.resources.food || 0) - foodConsumed);

  // Water: (daily rate) * mealFraction
  const waterConsumed = baseWaterPerPerson * pop * shelterMult * (1 / waterEfficiency) * consumptionMult * season.waterMult * mealFraction;
  gameState.resources.water = Math.max(0, (gameState.resources.water || 0) - waterConsumed);

  // Fuel consumption: only if power infrastructure exists
  if (getEffect('fuelConsumptionRate', 0) > 0) {
    const fuelBase = getEffect('fuelConsumptionRate', 0);
    const winterFuelMult = gameState.currentSeason === 'winter' ? 1.5 : 1.0;
    const fuelConsumed = fuelBase * pop * winterFuelMult * consumptionMult * mealFraction;
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
 * Supports both old format (puzzle string + puzzleAnswer) and new format
 * (puzzle object with question/correctAnswers).
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
    .filter(item => item.knowledgeRequired <= (gameState.knowledge + 1))
    .filter(item => {
      // Support new format (puzzle.question) or old format (puzzle string + puzzleAnswer)
      if (item.puzzle && typeof item.puzzle === 'object' && item.puzzle.question) return true;
      if (item.puzzle && item.puzzleAnswer) return true;
      return false;
    })
    .sort((a, b) => a.knowledgeRequired - b.knowledgeRequired);

  return studyableItems[0] || null;
}

// ─── Hardness → Study Count Mapping ─────────────────────────────────────────

/**
 * Convert item hardness (1-3) to total study sessions required.
 * @param {number} hardness - 1, 2, or 3
 * @returns {number} Total studies needed (3, 5, or 7)
 */
function hardnessToStudies(hardness) {
  switch (hardness) {
    case 1: return 3;
    case 2: return 5;
    case 3: return 7;
    default: return 3;
  }
}

/**
 * Initialize per-item study tracking on first study.
 * Assigns flashback slots based on hardness.
 * @param {object} item - Item config from knowledge_data.json
 */
function initItemStudyProgress(item) {
  const hardness = item.hardness || 1;
  const totalStudies = hardnessToStudies(hardness);
  const flashbackCount = Math.max(1, Math.floor(totalStudies / 3));

  const slots = [];

  // Available studies for flashbacks: 1 to totalStudies-1 (not the final one — that's the puzzle)
  const availableStudies = [];
  for (let i = 1; i < totalStudies; i++) availableStudies.push(i);

  // Assign learning flashback to a random study
  const learningIdx = Math.floor(Math.random() * availableStudies.length);
  const learningStudy = availableStudies.splice(learningIdx, 1)[0];
  slots.push({ study: learningStudy, type: 'learning' });

  // If flashbackCount > 1, assign lore flashbacks
  for (let i = 1; i < flashbackCount && availableStudies.length > 0; i++) {
    const loreIdx = Math.floor(Math.random() * availableStudies.length);
    const loreStudy = availableStudies.splice(loreIdx, 1)[0];
    slots.push({ study: loreStudy, type: 'lore' });
  }

  gameState.itemStudyProgress[item.id] = {
    studyCount: 0,
    totalStudies,
    flashbackSlots: slots,
    flashbacksShown: 0
  };
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

  // Re-evaluate gate against current stock (handles dev tools / trading / any non-gather source)
  refreshStudyGate();

  // Check if all requirements have been gathered (all values <= 0)
  return Object.values(gameState.studyGateProgress).every(v => v <= 0);
}

/**
 * Re-check study gate requirements against current resource stock.
 * Recalculates remaining amounts based on the current study item's recipe.
 * If the player now has enough (from dev tools, trade, gathering, etc.),
 * mark that requirement as met. Clears the gate entirely if all met.
 */
export function refreshStudyGate() {
  if (!gameState.studyGateProgress || Object.keys(gameState.studyGateProgress).length === 0) return;

  const config = getConfig();

  // Find the current study item to get its recipe
  const currentItem = _getCurrentStudyItem(config);
  const recipe = currentItem ? (currentItem.requirements || {}) : {};

  for (const resource of Object.keys(gameState.studyGateProgress)) {
    const recipeAmount = recipe[resource] || 0;
    if (recipeAmount === 0) {
      // Resource no longer in the recipe (stale gate entry) — mark as met
      gameState.studyGateProgress[resource] = 0;
      continue;
    }
    const scaledAmount = Math.ceil(recipeAmount * (1 + Math.floor(gameState.knowledge / 15)));
    const inStock = gameState.resources[resource] || 0;
    const remaining = scaledAmount - Math.floor(inStock);
    gameState.studyGateProgress[resource] = Math.max(0, remaining);
  }

  if (Object.values(gameState.studyGateProgress).every(v => v <= 0)) {
    gameState.studyGateProgress = {};
    logEvent('Resources gathered! You can study again.');
  }
}

/**
 * Set a recipe-based study gate after an intermediate study session.
 * Requires gathering the specific ingredients of the item being studied.
 * Gate only activates at the right study session (around ceil(totalStudies/3)),
 * creating the learn→gather→learn→puzzle flow.
 *
 * @param {object|null} item - The item currently being studied.
 * @param {object|null} tracking - The per-item study progress tracking object.
 */
function setStudyGate(item, tracking) {
  const config = getConfig();

  // No item or tracking — skip
  if (!item || !tracking) {
    gameState.studyGateProgress = {};
    return;
  }

  // Gate triggers after study ceil(totalStudies/3) — an early intermediate session
  const gateStudy = Math.ceil(tracking.totalStudies / 3);
  if (tracking.studyCount !== gateStudy) {
    // Not the gate study — no gate this time
    return;
  }

  const recipe = item.requirements || {};
  if (Object.keys(recipe).length === 0) {
    gameState.studyGateProgress = {};
    return;
  }

  const gate = {};
  for (const [resource, recipeAmount] of Object.entries(recipe)) {
    const scaledAmount = Math.ceil(recipeAmount * (1 + Math.floor(gameState.knowledge / 15)));
    const inStock = gameState.resources[resource] || 0;
    const remaining = scaledAmount - Math.floor(inStock);
    if (remaining > 0) {
      gate[resource] = remaining;
    }
  }

  gameState.studyGateProgress = gate;

  // Unlock any new resources referenced in the recipe
  computeUnlockedResources();

  // Also unlock resources that appear in the recipe but aren't yet in unlockedResources
  // (e.g. bone might not be revealed by any blueprint yet, but the recipe needs it)
  const allRaw = new Set(config.resources?.raw || []);
  for (const resource of Object.keys(recipe)) {
    if (allRaw.has(resource) && !gameState.unlockedResources.includes(resource)) {
      gameState.unlockedResources.push(resource);
    }
  }

  if (Object.keys(gate).length === 0) return;

  const needs = Object.entries(gate)
    .map(([r, v]) => `${v} ${r.charAt(0).toUpperCase() + r.slice(1)}`)
    .join(', ');
  logEvent(`The Book says: "Gather these materials to continue: ${needs}."`);
}

/**
 * Helper: get the current item being studied from itemStudyProgress or getNextStudyItem.
 * @param {object} config - Game config.
 * @returns {object|null} The item config object.
 */
function _getCurrentStudyItem(config) {
  // Check itemStudyProgress for an in-progress item
  for (const itemId of Object.keys(gameState.itemStudyProgress || {})) {
    const progress = gameState.itemStudyProgress[itemId];
    if (progress.studyCount > 0 && progress.studyCount < progress.totalStudies) {
      const item = config.items.find(i => i.id === itemId);
      if (item && !gameState.unlockedBlueprints.includes(itemId)) return item;
    }
  }
  // Fallback to next study item
  return getNextStudyItem();
}

/**
 * Main study function. Opens the Book, studies the next page.
 *
 * New variable-study-cycle flow:
 *  1. Check prerequisites (no pending puzzle, gate met, workers available)
 *  2. Find next unstudied item
 *  3. Init per-item tracking if first study
 *  4. Progress bar → knowledge gained
 *  5. If not final study: check for flashback slot → show flashback or log
 *  6. If final study: show multiple-choice puzzle
 */
export function study() {
  const config = getConfig();

  // Prevent starting a new study while one is in progress
  if (gameState.isStudying) return;

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
    const remaining = Object.entries(gameState.studyGateProgress || {})
      .filter(([, v]) => v > 0)
      .map(([r, v]) => `${v} ${r}`)
      .join(', ');
    logEvent(`Gather more resources before studying again: ${remaining} needed.`);
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

  // Initialize per-item tracking on first study
  if (!gameState.itemStudyProgress[nextItem.id]) {
    initItemStudyProgress(nextItem);
  }

  const tracking = gameState.itemStudyProgress[nextItem.id];

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
  gameState.isStudying = true;
  updateDisplay();

  // Calculate study time
  const baseTime = config.constants.BASE_STUDY_TIME || 10000;
  const knowledgeMult = getEffect('knowledgeGenerationMultiplier', 1.0);
  const researchSpeed = getEffect('researchSpeedMultiplier', 1.0);
  const preset = config.difficultyPresets?.[gameState.difficulty];
  const studySpeedBonus = preset?.studySpeedBonus || 1.0;
  const effectiveTime = Math.max(200, baseTime / (knowledgeMult * researchSpeed * studySpeedBonus));

  // Start study progress bar (use wall-clock time for reliable timing)
  gameState.studyBarProgress = 0;
  const studyStartTime = Date.now();
  const tickInterval = 200;

  const studyInterval = setInterval(() => {
    if (gameState.isGameOver) {
      clearInterval(studyInterval);
      untrackInterval(studyInterval);
      gameState.studyBarProgress = 0;
      gameState.availableWorkers++;
      gameState.isStudying = false;
      return;
    }

    const elapsed = Date.now() - studyStartTime;
    gameState.studyBarProgress = Math.min(100, (elapsed / effectiveTime) * 100);

    if (elapsed >= effectiveTime) {
      clearInterval(studyInterval);
      untrackInterval(studyInterval);
      gameState.studyBarProgress = 0;

      // Return worker
      gameState.availableWorkers++;

      // Increment study count
      tracking.studyCount++;

      // Grant knowledge
      const knowledgeGain = nextItem.knowledgePerStudy || 1;
      gameState.knowledge += knowledgeGain;
      gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
      gameState.stats.totalStudied = (gameState.stats.totalStudied || 0) + 1;

      // Update current chapter tracker
      gameState.currentChapter = getCurrentChapter();

      // Discover new resources
      computeUnlockedResources();

      if (tracking.studyCount < tracking.totalStudies) {
        // ── Not final study: check for flashback slot ──
        const flashbackSlot = tracking.flashbackSlots.find(s => s.study === tracking.studyCount);

        if (flashbackSlot) {
          tracking.flashbacksShown++;

          if (flashbackSlot.type === 'learning') {
            // Show learning flashback (teaches the puzzle answer)
            const flashbackText = nextItem.flashback || 'A fragment of knowledge surfaces in your mind...';
            showFlashback(flashbackText);
          } else if (flashbackSlot.type === 'lore') {
            // Show lore flashback + add to collection
            const loreText = nextItem.loreFlashback || 'A distant memory flickers through your thoughts...';
            showFlashback(loreText);

            // Add to lore archive if item has loreFlashback data
            if (nextItem.loreFlashback && nextItem.loreChronologicalOrder !== undefined) {
              const loreId = `study_lore_${nextItem.id}`;
              if (!gameState.collectedLore.some(l => l.id === loreId)) {
                gameState.collectedLore.push({
                  id: loreId,
                  chronologicalOrder: nextItem.loreChronologicalOrder,
                  text: nextItem.loreFlashback,
                  source: 'study'
                });
                notifyTab('book');
              }
            }
          }
        }

        logEvent(`Studied ${nextItem.name}... (${tracking.studyCount}/${tracking.totalStudies})  +${knowledgeGain} knowledge`);
      } else {
        // ── Final study: present puzzle ──
        gameState.pendingPuzzle = { id: nextItem.id };
        playUnlock();
        showStudyPuzzle(nextItem);
        logEvent(`Studied ${nextItem.name}... (${tracking.studyCount}/${tracking.totalStudies}) — Puzzle time!`);
      }

      // Set recipe-based study gate (triggers only at the right intermediate study)
      setStudyGate(nextItem, tracking);

      // Study complete — unblock events
      gameState.isStudying = false;

      updateDisplay();
    }
  }, tickInterval);
  trackInterval(studyInterval);
}


// ─── Puzzle System (Multiple Choice) ─────────────────────────────────────────

/**
 * Display the multiple-choice study puzzle popup for an item.
 * Supports both new format (puzzle object with correctAnswers/wrongAnswers)
 * and old format (puzzle string + puzzleAnswer) with auto-generated choices.
 *
 * @param {object} item - The item config object.
 */
function showStudyPuzzle(item) {
  const popup = document.getElementById('puzzle-popup');
  if (!popup) {
    _unlockBlueprint(item);
    return;
  }

  popup.dataset.puzzleType = 'study';
  popup.dataset.itemId = item.id;

  const questionEl = document.getElementById('puzzle-question');
  const choicesEl = document.getElementById('puzzle-choices');

  // Build puzzle data — support new and old formats
  let question, choices;

  if (item.puzzle && typeof item.puzzle === 'object' && item.puzzle.question) {
    // ── New format: puzzle object ──
    question = item.puzzle.question;

    // Pick 1 random correct answer
    const correctPool = item.puzzle.correctAnswers || ['Correct'];
    const correct = correctPool[Math.floor(Math.random() * correctPool.length)];

    // Pick 2 random wrong answers
    const wrongPool = [...(item.puzzle.wrongAnswers || ['Wrong A', 'Wrong B'])];
    const wrongs = [];
    for (let i = 0; i < 2 && wrongPool.length > 0; i++) {
      const idx = Math.floor(Math.random() * wrongPool.length);
      wrongs.push(wrongPool.splice(idx, 1)[0]);
    }

    // Combine and shuffle
    choices = [
      { text: correct, isCorrect: true },
      ...wrongs.map(w => ({ text: w, isCorrect: false }))
    ];
    _shuffleArray(choices);

  } else {
    // ── Old format: fallback — auto-generate from puzzleAnswer ──
    question = (typeof item.puzzle === 'string') ? item.puzzle : 'What is this?';
    const correctText = item.puzzleAnswer || 'Unknown';
    choices = [
      { text: correctText, isCorrect: true },
      { text: 'Not this one', isCorrect: false },
      { text: 'Nor this one', isCorrect: false }
    ];
    _shuffleArray(choices);
  }

  // Store pending puzzle state
  gameState.pendingPuzzle = {
    id: item.id,
    choices,
    hintsUsed: 0,
    wrongPenalty: (typeof item.puzzle === 'object') ? item.puzzle.wrongPenalty : null,
    hints: (typeof item.puzzle === 'object') ? (item.puzzle.hints || []) : (item.hints || [])
  };

  // Render question
  if (questionEl) questionEl.textContent = question;

  // Render choice buttons
  if (choicesEl) {
    const buttons = choicesEl.querySelectorAll('.puzzle-choice');
    choices.forEach((choice, i) => {
      if (buttons[i]) {
        buttons[i].textContent = choice.text;
        buttons[i].dataset.choice = i;
        buttons[i].disabled = false;
        buttons[i].className = 'puzzle-choice'; // reset classes
      }
    });
  }

  // Reset hints
  const hintsEl = document.getElementById('puzzle-hints');
  if (hintsEl) {
    while (hintsEl.firstChild) hintsEl.removeChild(hintsEl.firstChild);
  }

  // Reset feedback
  const feedbackEl = document.getElementById('puzzle-feedback');
  if (feedbackEl) feedbackEl.textContent = '';

  // Re-enable hint button
  const hintBtn = document.getElementById('puzzle-hint');
  if (hintBtn) {
    hintBtn.disabled = false;
    hintBtn.textContent = 'Hint (2)';
  }

  popup.style.display = 'flex';
}

/**
 * Handle a multiple-choice puzzle answer.
 * @param {number} choiceIndex - Index of the clicked choice button (0-2).
 * @returns {boolean} True if correct.
 */
export function submitPuzzleChoice(choiceIndex) {
  if (!gameState.pendingPuzzle || !gameState.pendingPuzzle.choices) return false;

  const config = getConfig();
  const itemId = gameState.pendingPuzzle.id;
  const item = config.items.find(i => i.id === itemId);
  if (!item) {
    gameState.pendingPuzzle = null;
    return false;
  }

  const choice = gameState.pendingPuzzle.choices[choiceIndex];
  if (!choice) return false;

  const choicesEl = document.getElementById('puzzle-choices');
  const buttons = choicesEl ? choicesEl.querySelectorAll('.puzzle-choice') : [];
  const feedbackEl = document.getElementById('puzzle-feedback');

  if (choice.isCorrect) {
    // ── Correct! ──
    if (buttons[choiceIndex]) buttons[choiceIndex].classList.add('correct');

    // Brief delay before unlocking for visual feedback
    setTimeout(() => {
      _unlockBlueprint(item);
    }, 600);

    return true;
  } else {
    // ── Wrong ──
    if (buttons[choiceIndex]) {
      buttons[choiceIndex].classList.add('wrong');
      buttons[choiceIndex].disabled = true;
    }

    playWrong();

    // Apply wrong penalty
    if (gameState.pendingPuzzle.wrongPenalty) {
      _applyWrongPenalty(gameState.pendingPuzzle.wrongPenalty);
    }

    if (feedbackEl) {
      feedbackEl.textContent = 'Wrong answer — try again!';
      feedbackEl.style.color = '#e74c3c';
    }

    return false;
  }
}

/**
 * Apply penalty for a wrong puzzle answer.
 * @param {object} penalty - { type, resource, amount }
 */
function _applyWrongPenalty(penalty) {
  if (!penalty || penalty.type !== 'resource') return;

  const resource = penalty.resource || 'food';
  const amount = penalty.amount || 2;

  gameState.resources[resource] = Math.max(0,
    (gameState.resources[resource] || 0) - amount);
  logEvent(`Wrong — lost ${amount} ${resource}.`);
  updateDisplay();
}

/**
 * Get a hint for the current puzzle. 2 hints max, no penalty.
 * Hint 1: clue text. Hint 2: eliminate one wrong answer.
 * @returns {boolean} True if a hint was shown.
 */
export function getPuzzleHint() {
  if (!gameState.pendingPuzzle) return false;

  const pending = gameState.pendingPuzzle;
  const hints = pending.hints || [];
  const hintsUsed = pending.hintsUsed || 0;

  if (hintsUsed >= 2 || hintsUsed >= hints.length) {
    // No more hints
    const hintBtn = document.getElementById('puzzle-hint');
    if (hintBtn) hintBtn.disabled = true;
    return false;
  }

  const hint = hints[hintsUsed];
  const hintsEl = document.getElementById('puzzle-hints');

  if (hint && hintsEl) {
    if (hint.type === 'eliminate' || (hintsUsed === 1 && typeof hint === 'object')) {
      // Eliminate hint: grey out one wrong answer
      const choicesEl = document.getElementById('puzzle-choices');
      const buttons = choicesEl ? choicesEl.querySelectorAll('.puzzle-choice') : [];
      const choices = pending.choices || [];

      // Find a wrong answer that isn't already eliminated or disabled
      for (let i = 0; i < choices.length; i++) {
        if (!choices[i].isCorrect && buttons[i] && !buttons[i].disabled && !buttons[i].classList.contains('eliminated')) {
          buttons[i].classList.add('eliminated');
          break;
        }
      }

      const hintDiv = document.createElement('div');
      hintDiv.style.cssText = 'color:#e2b714; font-size:0.85em; margin-top:6px; padding:6px 8px; background:rgba(226,183,20,0.08); border-left:2px solid #e2b714; border-radius:4px;';
      hintDiv.textContent = (typeof hint === 'object' && hint.text) ? hint.text : 'One wrong answer eliminated.';
      hintsEl.appendChild(hintDiv);
    } else {
      // Clue hint: show text
      const hintText = (typeof hint === 'object' && hint.text) ? hint.text : (typeof hint === 'string' ? hint : 'Think about what you learned...');

      const hintDiv = document.createElement('div');
      hintDiv.style.cssText = 'color:#e2b714; font-size:0.85em; margin-top:6px; padding:6px 8px; background:rgba(226,183,20,0.08); border-left:2px solid #e2b714; border-radius:4px;';
      hintDiv.textContent = hintText;
      hintsEl.appendChild(hintDiv);
    }
  }

  pending.hintsUsed = hintsUsed + 1;

  // Update hint button text
  const hintBtn = document.getElementById('puzzle-hint');
  if (hintBtn) {
    const remaining = Math.max(0, (hints.length > 2 ? 2 : hints.length) - pending.hintsUsed);
    if (remaining <= 0) {
      hintBtn.disabled = true;
      hintBtn.textContent = 'No hints left';
    } else {
      hintBtn.textContent = `Hint (${remaining})`;
    }
  }

  return true;
}

/**
 * Keep old export name for backward compat — but internally uses new format.
 * @deprecated Use submitPuzzleChoice instead.
 */
export function submitPuzzleAnswer(answer) {
  // If the old text-input system somehow calls this, try to match against choices
  if (!gameState.pendingPuzzle || !gameState.pendingPuzzle.choices) return false;
  const normalized = (answer || '').trim().toLowerCase();
  const choices = gameState.pendingPuzzle.choices;
  for (let i = 0; i < choices.length; i++) {
    if (choices[i].text.toLowerCase() === normalized) {
      return submitPuzzleChoice(i);
    }
  }
  return false;
}

/**
 * Skip the current puzzle. Saves it as pending so it re-shows on next study.
 */
export function skipPuzzle() {
  const popup = document.getElementById('puzzle-popup');
  if (popup) popup.style.display = 'none';
  // pendingPuzzle stays set — it will re-show on next study() call
}

/**
 * Internal: unlock a blueprint after correctly answering its puzzle.
 * Adds to unlockedBlueprints, discovers new resources, clears study tracking.
 *
 * @param {object} item - The item config object.
 */
function _unlockBlueprint(item) {
  if (!gameState.unlockedBlueprints.includes(item.id)) {
    gameState.unlockedBlueprints.push(item.id);
  }

  gameState.pendingPuzzle = null;

  // Clear per-item study progress
  delete gameState.itemStudyProgress[item.id];

  // Discover new resources from this blueprint
  const newResources = computeUnlockedResources();
  if (newResources.length > 0) {
    newResources.forEach(r => {
      logEvent(`New resource discovered: ${r.charAt(0).toUpperCase() + r.slice(1)}!`);
    });
  }

  logEvent(`Correct! Unlocked: ${item.name}!`);
  playUnlock();

  // Notify relevant tabs about the new blueprint
  notifyTab('crafting');
  notifyTab('book');

  // Show did-you-know fact
  if (item.didYouKnow) {
    logEvent(`Did you know? ${item.didYouKnow}`);
  }

  // Close puzzle popup
  const popup = document.getElementById('puzzle-popup');
  if (popup) popup.style.display = 'none';

  updateDisplay();
}

/**
 * Fisher-Yates shuffle for choice randomization.
 * @param {Array} arr - Array to shuffle in-place.
 */
function _shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


// ─── Re-export getResourceCap for backward compatibility ─────────────────────
// Other modules that imported getResourceCap from resources.js can continue to do so.

export { getResourceCap };
