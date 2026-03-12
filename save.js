/**
 * save.js
 *
 * Save/load module for the post-apocalyptic survival game.
 * v2 — clean slate, no backward compatibility with v1.
 *
 * Uses the serialization/deserialization helpers in gameState.js (serializeState,
 * deserializeState) which handle the full v2 format:
 *   { version: 2, timestamp, global, currentSettlement, settlements }
 *
 * Persistence:
 *   - localStorage under SAVE_KEY ('postapoc_save_v2')
 *   - Export/import as text string (backup / device transfer)
 *   - Save indicator flash on successful save
 */

import { gameState, getConfig, serializeState, deserializeState } from './gameState.js';
import { getActiveEvents, setActiveEvents } from './events.js';
import { prepareForSave } from './settlements.js';


/** The localStorage key used by every save/load operation. v2 uses a new key. */
const SAVE_KEY = 'postapoc_save_v2';


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize the current gameState and write it to localStorage.
 *
 * Uses serializeState() from gameState.js which produces the v2 format
 * with global, currentSettlement, and settlements sections.
 *
 * @returns {boolean} True if the save succeeded, false on error.
 */
export function saveGame() {
  try {
    // Ensure all settlement snapshots are up to date before serializing
    prepareForSave();

    const saveData = serializeState();

    // Overlay active events from events.js module (authoritative source)
    try {
      const events = getActiveEvents();
      if (events && saveData.currentSettlement) {
        saveData.currentSettlement.activeEvents = JSON.parse(JSON.stringify(events));
      }
    } catch {
      // events module may not have events loaded yet — use what serializeState provided
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    console.info('[save] Game saved (day %d).', gameState.day);
    return true;
  } catch (err) {
    console.error('[save] Failed to save game:', err);
    return false;
  }
}


/**
 * Load and restore a saved game from localStorage.
 *
 * Uses deserializeState() from gameState.js which handles the full v2 format,
 * including reconciling instance counters and restoring all state fields.
 *
 * After deserialization, re-links active events in the events module and
 * recalculates available workers.
 *
 * @returns {boolean} True if a valid save was found and applied, false otherwise.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const saveData = JSON.parse(raw);
    if (!saveData || saveData.version !== 2) {
      console.warn('[save] Incompatible save version:', saveData?.version);
      return false;
    }

    // Deserialize using gameState.js helper
    const success = deserializeState(saveData);
    if (!success) return false;

    // Re-link active events in the events module
    try {
      if (gameState.activeEvents && Array.isArray(gameState.activeEvents)) {
        setActiveEvents(gameState.activeEvents.map(e => ({ ...e })));
      }
    } catch {
      // events module setActiveEvents may not be available
    }

    // Recalculate available workers to account for sick, exploring, assigned
    recalculateAvailableWorkers();

    // ── AFK / Offline Progression ──────────────────────────────────────
    const offlineMs = Date.now() - (saveData.timestamp || Date.now());
    const daySpeed = gameState.settings?.daySpeed || 30;
    const offlineDays = Math.floor(offlineMs / (1000 * daySpeed));

    if (offlineDays > 0) {
      const summary = simulateOfflineDays(offlineDays);
      console.info('[save] Offline for ~%d game days. Summary:', offlineDays, summary);

      // Schedule welcome-back popup (shown after UI initialises)
      gameState._welcomeBackSummary = summary;
    }

    console.info('[save] Game loaded (day %d).', gameState.day);
    return true;
  } catch (err) {
    console.error('[save] Failed to load game:', err);
    return false;
  }
}


/**
 * Check whether a v2 save exists in localStorage.
 * Lightweight check — does not parse or validate the stored JSON.
 *
 * @returns {boolean} True if a save slot exists.
 */
export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}


/**
 * Remove the save slot from localStorage. Safe to call when no save exists.
 */
export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    console.info('[save] Save deleted.');
  } catch (err) {
    console.error('[save] Failed to delete save:', err);
  }
}


/**
 * Export the save data as a JSON string for backup / device transfer.
 * @returns {string} The raw JSON string, or empty string if no save.
 */
export function exportSave() {
  return localStorage.getItem(SAVE_KEY) || '';
}


/**
 * Import save data from a JSON string. Validates version before writing.
 *
 * @param {string} data - The JSON string to import.
 * @returns {boolean} True if import succeeded.
 */
export function importSave(data) {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || parsed.version !== 2) {
      console.warn('[save] Import rejected: incompatible version:', parsed?.version);
      return false;
    }
    localStorage.setItem(SAVE_KEY, data);
    console.info('[save] Save imported successfully.');
    return true;
  } catch (err) {
    console.error('[save] Import failed:', err);
    return false;
  }
}


// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Recalculate availableWorkers from population, sick members, exploring workers,
 * and automation assignments. Ensures consistency after loading a save.
 */
function recalculateAvailableWorkers() {
  const sickCount = (gameState.populationMembers || []).filter(m => m.sick).length;

  const exploringWorkers = (gameState.explorations || [])
    .filter(e => e.inProgress)
    .reduce((sum, e) => sum + (e.workersOut || 1), 0);

  // SINGLE building automation workers
  let automationWorkers = 0;
  for (const count of Object.values(gameState.automationAssignments || {})) {
    automationWorkers += count || 0;
  }

  // MULTIPLE building workers
  for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
    for (const instance of (gameState.multipleBuildings[chainId] || [])) {
      automationWorkers += instance.workersAssigned || 0;
    }
  }

  gameState.availableWorkers = Math.max(0,
    gameState.population - sickCount - exploringWorkers - automationWorkers
  );
}


/**
 * Simulate offline days with a simplified tick.
 * For each offline day:
 *  - Workers assigned to production buildings generate resources
 *  - Food and water are consumed per population
 *  - Resources are capped
 *  - AFK protection floors prevent total loss
 *
 * Uses diminishing returns: after a threshold, each day produces less.
 * Capped at MAX_OFFLINE_DAYS to prevent extreme catch-up.
 *
 * @param {number} rawDays - Number of game days the player was offline.
 * @returns {{ days: number, foodProduced: number, waterProduced: number,
 *             foodConsumed: number, waterConsumed: number, daysAdvanced: number }}
 */
function simulateOfflineDays(rawDays) {
  const config = getConfig();
  const MAX_OFFLINE_DAYS = 200;
  const days = Math.min(rawDays, MAX_OFFLINE_DAYS);

  // Difficulty AFK protection floors
  const preset = config.difficultyPresets?.[gameState.difficulty];
  const resourceFloor = preset?.afkResourceFloor ?? 0.1;
  const popFloor = preset?.afkPopulationFloor ?? 0.5;

  // Snapshot starting state for summary
  const startFood = gameState.resources.food || 0;
  const startWater = gameState.resources.water || 0;
  const startPop = gameState.population;

  // Base per-person consumption from config
  const baseFoodPerPerson = config.constants?.BASE_FOOD_PER_PERSON || 2;
  const baseWaterPerPerson = config.constants?.BASE_WATER_PER_PERSON || 1.5;
  const consumptionMult = preset?.consumptionMultiplier || 1.0;

  // Calculate production rates from assigned workers (simplified — flat per day)
  let foodProduction = 0;
  let waterProduction = 0;

  // MULTIPLE buildings production (farms, wells)
  for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
    for (const instance of (gameState.multipleBuildings[chainId] || [])) {
      if (!instance.itemId || !instance.workersAssigned) continue;
      const item = config.items?.find(i => i.id === instance.itemId);
      if (!item) continue;
      const rate = item.productionRate || 0;
      const workers = instance.workersAssigned || 0;
      if (item.produces === 'food' || item.productionOutput?.food) {
        foodProduction += rate * workers;
      }
      if (item.produces === 'water' || item.productionOutput?.water) {
        waterProduction += rate * workers;
      }
    }
  }

  // SINGLE building production
  for (const chainId of Object.keys(gameState.buildings || {})) {
    const building = gameState.buildings[chainId];
    if (!building.itemId || building.level === 0) continue;
    const workers = gameState.automationAssignments?.[chainId] || 0;
    if (workers === 0) continue;
    const item = config.items?.find(i => i.id === building.itemId);
    if (!item) continue;
    const rate = item.productionRate || 0;
    if (item.produces === 'food' || item.productionOutput?.food) {
      foodProduction += rate * workers;
    }
    if (item.produces === 'water' || item.productionOutput?.water) {
      waterProduction += rate * workers;
    }
  }

  // Resource caps
  const foodCap = config.constants?.BASE_RESOURCE_CAP || 200;
  const waterCap = config.constants?.BASE_RESOURCE_CAP || 200;

  let totalFoodProduced = 0;
  let totalWaterProduced = 0;
  let totalFoodConsumed = 0;
  let totalWaterConsumed = 0;

  // Simulate each day with diminishing returns after day 50
  for (let d = 0; d < days; d++) {
    // Diminishing returns: efficiency drops after 50 days offline
    const efficiency = d < 50 ? 1.0 : Math.max(0.1, 1.0 - (d - 50) * 0.01);

    // Production (scaled by diminishing returns)
    const dayFoodProd = foodProduction * efficiency;
    const dayWaterProd = waterProduction * efficiency;
    totalFoodProduced += dayFoodProd;
    totalWaterProduced += dayWaterProd;

    gameState.resources.food = Math.min(
      (gameState.resources.food || 0) + dayFoodProd,
      foodCap
    );
    gameState.resources.water = Math.min(
      (gameState.resources.water || 0) + dayWaterProd,
      waterCap
    );

    // Consumption
    const dayFoodCost = baseFoodPerPerson * gameState.population * consumptionMult;
    const dayWaterCost = baseWaterPerPerson * gameState.population * consumptionMult;
    totalFoodConsumed += dayFoodCost;
    totalWaterConsumed += dayWaterCost;

    gameState.resources.food = Math.max(0, (gameState.resources.food || 0) - dayFoodCost);
    gameState.resources.water = Math.max(0, (gameState.resources.water || 0) - dayWaterCost);

    // Population loss if resources hit 0
    if (gameState.resources.food <= 0 && gameState.resources.water <= 0) {
      const minPop = Math.max(1, Math.ceil(startPop * popFloor));
      if (gameState.population > minPop) {
        gameState.population = Math.max(minPop, gameState.population - 1);
      }
    }

    // Advance day counter
    gameState.day++;
    gameState.totalDaysPlayed++;
  }

  // Apply AFK resource floors — never go below floor % of starting resources
  const foodFloor = startFood * resourceFloor;
  const waterFloor = startWater * resourceFloor;
  gameState.resources.food = Math.max(gameState.resources.food || 0, foodFloor);
  gameState.resources.water = Math.max(gameState.resources.water || 0, waterFloor);

  // Ensure population doesn't drop below AFK floor
  const minPopulation = Math.max(1, Math.ceil(startPop * popFloor));
  gameState.population = Math.max(gameState.population, minPopulation);

  // Recalculate workers after potential pop changes
  recalculateAvailableWorkers();

  return {
    days,
    rawDays,
    capped: rawDays > MAX_OFFLINE_DAYS,
    foodProduced: Math.round(totalFoodProduced),
    waterProduced: Math.round(totalWaterProduced),
    foodConsumed: Math.round(totalFoodConsumed),
    waterConsumed: Math.round(totalWaterConsumed),
    daysAdvanced: days,
    populationBefore: startPop,
    populationAfter: gameState.population,
    foodBefore: Math.round(startFood),
    foodAfter: Math.round(gameState.resources.food),
    waterBefore: Math.round(startWater),
    waterAfter: Math.round(gameState.resources.water)
  };
}
