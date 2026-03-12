/**
 * automation.js
 *
 * Handles CONTINUOUS PRODUCTION — workers assigned to buildings that produce
 * resources every game day. Processing workstations (SINGLE) convert input
 * resources to output resources. Food/water buildings (MULTIPLE) produce
 * directly.
 *
 * Worker assignment is tracked in:
 *   - gameState.automationAssignments[chainId] — for SINGLE buildings
 *   - instance.workersAssigned — for MULTIPLE building instances
 */

import { gameState, getConfig } from './gameState.js';
import { getEffect } from './effects.js';


// ─── Chain ID Mapping ────────────────────────────────────────────────────────
// Mirrors crafting.js — JSON config uses 'farming'/'hunting'/'fishing' but
// gameState.multipleBuildings uses 'food_farming'/'food_hunting'/'food_fishing'.

const CHAIN_TO_STATE_KEY = {
  farming:  'food_farming',
  hunting:  'food_hunting',
  fishing:  'food_fishing'
};

/**
 * Resolve a config chain ID to its gameState key.
 * @param {string} chainId - Chain ID from config.
 * @returns {string} The gameState key.
 */
function resolveStateKey(chainId) {
  return CHAIN_TO_STATE_KEY[chainId] || chainId;
}

/**
 * Resolve a gameState key back to its config chain ID.
 * @param {string} stateKey - Key from gameState (e.g. 'food_farming').
 * @returns {string} The config chain ID (e.g. 'farming').
 */
function resolveConfigKey(stateKey) {
  for (const [configKey, mapped] of Object.entries(CHAIN_TO_STATE_KEY)) {
    if (mapped === stateKey) return configKey;
  }
  return stateKey;
}


// ─── Worker Assignment: SINGLE Buildings ─────────────────────────────────────

/**
 * Assign or unassign a worker to/from a SINGLE production building.
 *
 * @param {string} chainId - Config chain ID (e.g. 'kiln', 'forge', 'sawmill').
 * @param {number} delta - +1 to assign, -1 to unassign.
 * @returns {boolean} True if the assignment was successful.
 */
export function assignWorkerToSingle(chainId, delta) {
  const stateKey = resolveStateKey(chainId);
  const building = gameState.buildings[stateKey];
  if (!building || building.level === 0) return false;

  const current = gameState.automationAssignments[stateKey] || 0;
  const newCount = current + delta;

  // Can't go negative
  if (newCount < 0) return false;

  // Can't assign if no available workers
  if (delta > 0 && gameState.availableWorkers <= 0) return false;

  gameState.automationAssignments[stateKey] = newCount;
  gameState.availableWorkers -= delta;

  return true;
}


// ─── Worker Assignment: MULTIPLE Buildings ───────────────────────────────────

/**
 * Assign or unassign a worker to/from a MULTIPLE building instance.
 *
 * @param {string} chainId - Config chain ID (e.g. 'farming', 'water').
 * @param {string} instanceId - Specific instance ID.
 * @param {number} delta - +1 to assign, -1 to unassign.
 * @returns {boolean} True if the assignment was successful.
 */
export function assignWorkerToMultiple(chainId, instanceId, delta) {
  const stateKey = resolveStateKey(chainId);
  const instances = gameState.multipleBuildings[stateKey];
  const instance = instances?.find(i => i.id === instanceId);
  if (!instance) return false;

  const newCount = (instance.workersAssigned || 0) + delta;

  // Can't go negative
  if (newCount < 0) return false;

  // Can't assign if no available workers
  if (delta > 0 && gameState.availableWorkers <= 0) return false;

  instance.workersAssigned = newCount;
  gameState.availableWorkers -= delta;

  return true;
}


// ─── Daily Production ────────────────────────────────────────────────────────

/**
 * Run daily production for all buildings with assigned workers.
 * Called once per game day from the game loop.
 *
 * SINGLE buildings (processing workstations): consume input, produce output.
 * MULTIPLE buildings (farms, wells, etc.): produce output (some have inputs).
 *
 * @returns {Array<object>} Production log entries for UI display.
 */
export function runDailyProduction() {
  const config = getConfig();
  if (!config || !config.items) return [];

  const productionLog = [];

  // Build a fast item lookup map
  const itemMap = new Map();
  for (const item of config.items) {
    itemMap.set(item.id, item);
  }

  // ── Global multipliers ─────────────────────────────────────────────────
  const productivityMult = getEffect('productivityMultiplier', 1.0);
  const speedMult = getEffect('productionSpeedMultiplier', 1.0);
  const distributionMult = getEffect('resourceDistributionMultiplier', 1.0);

  // Combine global production modifiers
  let globalMult = 1.0;
  if (productivityMult > 1) globalMult *= productivityMult;
  if (speedMult > 1) globalMult *= speedMult;
  if (distributionMult > 1) globalMult *= distributionMult;

  // ── SINGLE production buildings (processing workstations) ─────────────
  for (const stateKey of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[stateKey];
    if (building.level === 0 || !building.itemId) continue;

    const workers = gameState.automationAssignments[stateKey] || 0;
    if (workers === 0) continue;

    const item = itemMap.get(building.itemId);
    if (!item || !item.productionOutput) continue;

    // Check input resources are available
    if (item.productionInput) {
      const canProduce = Object.entries(item.productionInput).every(
        ([res, amount]) => (gameState.resources[res] || 0) >= amount * workers
      );
      if (!canProduce) {
        productionLog.push({
          building: item.name,
          chainId: stateKey,
          workers,
          blocked: true,
          reason: 'insufficient_input'
        });
        continue;
      }

      // Consume inputs
      for (const [res, amount] of Object.entries(item.productionInput)) {
        gameState.resources[res] -= amount * workers;
      }
    }

    // Produce outputs
    for (const [res, baseAmount] of Object.entries(item.productionOutput)) {
      // Apply chain-specific multipliers (e.g. farmYieldMultiplier, foodProductionMultiplier)
      let chainMult = getChainSpecificMultiplier(stateKey, res);

      const produced = baseAmount * workers * globalMult * chainMult;
      gameState.resources[res] = (gameState.resources[res] || 0) + produced;

      productionLog.push({
        resource: res,
        amount: produced,
        building: item.name,
        chainId: stateKey,
        workers,
        blocked: false
      });
    }
  }

  // ── MULTIPLE production buildings (farms, wells, hunting, fishing) ─────
  for (const stateKey of Object.keys(gameState.multipleBuildings)) {
    const configKey = resolveConfigKey(stateKey);

    for (const instance of gameState.multipleBuildings[stateKey]) {
      if (!instance.itemId || (instance.workersAssigned || 0) === 0) continue;

      const item = itemMap.get(instance.itemId);
      if (!item || !item.productionOutput) continue;

      const workers = instance.workersAssigned;

      // Check/consume inputs (if any)
      if (item.productionInput) {
        const canProduce = Object.entries(item.productionInput).every(
          ([res, amount]) => (gameState.resources[res] || 0) >= amount * workers
        );
        if (!canProduce) {
          productionLog.push({
            building: item.name,
            chainId: stateKey,
            instanceId: instance.id,
            workers,
            blocked: true,
            reason: 'insufficient_input'
          });
          continue;
        }

        for (const [res, amount] of Object.entries(item.productionInput)) {
          gameState.resources[res] -= amount * workers;
        }
      }

      // Produce outputs
      for (const [res, baseAmount] of Object.entries(item.productionOutput)) {
        let chainMult = getChainSpecificMultiplier(configKey, res);

        const produced = baseAmount * workers * globalMult * chainMult;
        gameState.resources[res] = (gameState.resources[res] || 0) + produced;

        productionLog.push({
          resource: res,
          amount: produced,
          building: item.name,
          chainId: stateKey,
          instanceId: instance.id,
          workers,
          blocked: false
        });
      }
    }
  }

  return productionLog;
}


// ─── Chain-Specific Multipliers ──────────────────────────────────────────────

/**
 * Get chain-specific production multipliers from built items.
 * E.g., farming chains benefit from farmYieldMultiplier and foodProductionMultiplier;
 * hunting chains benefit from huntingYieldMultiplier, etc.
 *
 * @param {string} chainOrStateKey - Chain ID or state key.
 * @param {string} resource - The resource being produced.
 * @returns {number} Combined multiplier (1.0 = no bonus).
 */
function getChainSpecificMultiplier(chainOrStateKey, resource) {
  let multiplier = 1.0;

  // Resource-specific production multipliers
  if (resource === 'food') {
    const foodMult = getEffect('foodProductionMultiplier', 1.0);
    if (foodMult > 1) multiplier *= foodMult;

    // Farm-specific bonus
    const configKey = resolveConfigKey(chainOrStateKey);
    if (configKey === 'farming') {
      const farmYield = getEffect('farmYieldMultiplier', 1.0);
      if (farmYield > 1) multiplier *= farmYield;
    }

    // Hunting-specific bonus
    if (configKey === 'hunting') {
      const huntingYield = getEffect('huntingYieldMultiplier', 1.0);
      if (huntingYield > 1) multiplier *= huntingYield;
    }

    // Fishing-specific bonus
    if (configKey === 'fishing') {
      const fishingYield = getEffect('fishingYieldMultiplier', 1.0);
      if (fishingYield > 1) multiplier *= fishingYield;
    }
  }

  if (resource === 'water') {
    const waterMult = getEffect('waterProductionMultiplier', 1.0);
    if (waterMult > 1) multiplier *= waterMult;
  }

  if (resource === 'bricks') {
    const bricksMult = getEffect('bricksProductionMultiplier', 1.0);
    if (bricksMult > 1) multiplier *= bricksMult;
  }

  if (resource === 'metal') {
    const metalMult = getEffect('metalProductionMultiplier', 1.0);
    if (metalMult > 1) multiplier *= metalMult;
  }

  if (resource === 'boards') {
    const boardsMult = getEffect('boardsProductionMultiplier', 1.0);
    if (boardsMult > 1) multiplier *= boardsMult;
  }

  if (resource === 'cloth') {
    const clothMult = getEffect('clothProductionMultiplier', 1.0);
    if (clothMult > 1) multiplier *= clothMult;
  }

  if (resource === 'leather') {
    const leatherMult = getEffect('leatherProductionMultiplier', 1.0);
    if (leatherMult > 1) multiplier *= leatherMult;
  }

  if (resource === 'glass') {
    const glassMult = getEffect('glassProductionMultiplier', 1.0);
    if (glassMult > 1) multiplier *= glassMult;
  }

  if (resource === 'fuel') {
    const fuelMult = getEffect('fuelProductionMultiplier', 1.0);
    if (fuelMult > 1) multiplier *= fuelMult;
  }

  if (resource === 'medicine') {
    const medicineMult = getEffect('medicineProductionMultiplier', 1.0);
    if (medicineMult > 1) multiplier *= medicineMult;
  }

  if (resource === 'paper') {
    const paperMult = getEffect('paperProductionMultiplier', 1.0);
    if (paperMult > 1) multiplier *= paperMult;
  }

  if (resource === 'hides') {
    const hidesMult = getEffect('hidesProductionMultiplier', 1.0);
    if (hidesMult > 1) multiplier *= hidesMult;
  }

  return multiplier;
}


// ─── Production Summary (for UI) ────────────────────────────────────────────

/**
 * Get a summary of all production assignments for UI display.
 * Groups buildings into single (processing) and multiple (farms, wells, etc.)
 * with worker counts, rates, and input/output info.
 *
 * @returns {object} { single: [], multiple: [], totalAssigned, totalAvailable }
 */
export function getProductionSummary() {
  const config = getConfig();
  if (!config || !config.items) {
    return {
      single: [],
      multiple: [],
      totalAssigned: 0,
      totalAvailable: gameState.availableWorkers
    };
  }

  // Build fast lookup
  const itemMap = new Map();
  for (const item of config.items) {
    itemMap.set(item.id, item);
  }

  const single = [];
  const multiple = [];
  let totalAssigned = 0;

  // ── SINGLE buildings ──────────────────────────────────────────────────
  for (const stateKey of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[stateKey];
    if (building.level === 0 || !building.itemId) continue;

    const item = itemMap.get(building.itemId);
    // Only show buildings that accept workers (have productionOutput or workersRequired)
    if (!item) continue;
    if (!item.productionOutput && !item.workersRequired) continue;

    const workers = gameState.automationAssignments[stateKey] || 0;
    totalAssigned += workers;

    single.push({
      chainId: stateKey,
      configChainId: resolveConfigKey(stateKey),
      name: item.name,
      level: building.level,
      workers,
      maxWorkers: item.maxWorkers || null,
      productionInput: item.productionInput,
      productionOutput: item.productionOutput,
      rate: item.productionRate || 0
    });
  }

  // ── MULTIPLE buildings ────────────────────────────────────────────────
  for (const stateKey of Object.keys(gameState.multipleBuildings)) {
    const configKey = resolveConfigKey(stateKey);

    for (const instance of gameState.multipleBuildings[stateKey]) {
      if (!instance.itemId) continue;

      const item = itemMap.get(instance.itemId);
      if (!item) continue;
      // Only show buildings that produce something or accept workers
      if (!item.productionOutput && !item.workersRequired) continue;

      const workers = instance.workersAssigned || 0;
      totalAssigned += workers;

      multiple.push({
        chainId: stateKey,
        configChainId: configKey,
        instanceId: instance.id,
        name: item.name,
        level: instance.level,
        workers,
        maxWorkers: item.maxWorkers || null,
        productionInput: item.productionInput,
        productionOutput: item.productionOutput,
        rate: item.productionRate || 0
      });
    }
  }

  return {
    single,
    multiple,
    totalAssigned,
    totalAvailable: gameState.availableWorkers
  };
}


// ─── Projected Production (for UI) ──────────────────────────────────────────

/**
 * Calculate the projected daily production for a specific building assignment.
 * Shows what a building would produce per day at its current worker count.
 * Applies all relevant multipliers.
 *
 * @param {object} productionOutput - { resource: baseAmount, ... } from item config.
 * @param {number} workers - Number of workers assigned.
 * @param {string} chainOrStateKey - Chain ID for chain-specific multipliers.
 * @returns {Array<{ resource: string, amount: number }>} Projected daily output.
 */
export function getProjectedProduction(productionOutput, workers, chainOrStateKey) {
  if (!productionOutput || workers === 0) return [];

  const productivityMult = getEffect('productivityMultiplier', 1.0);
  const speedMult = getEffect('productionSpeedMultiplier', 1.0);
  const distributionMult = getEffect('resourceDistributionMultiplier', 1.0);

  let globalMult = 1.0;
  if (productivityMult > 1) globalMult *= productivityMult;
  if (speedMult > 1) globalMult *= speedMult;
  if (distributionMult > 1) globalMult *= distributionMult;

  return Object.entries(productionOutput).map(([res, baseAmount]) => {
    const chainMult = getChainSpecificMultiplier(chainOrStateKey, res);
    return {
      resource: res,
      amount: baseAmount * workers * globalMult * chainMult
    };
  });
}


// ─── Unassign All Workers ────────────────────────────────────────────────────

/**
 * Unassign all workers from all buildings. Used on game reset.
 * Returns all workers to the available pool.
 */
export function unassignAllWorkers() {
  // Unassign from SINGLE buildings
  for (const stateKey of Object.keys(gameState.automationAssignments)) {
    const count = gameState.automationAssignments[stateKey] || 0;
    gameState.availableWorkers += count;
  }
  gameState.automationAssignments = {};

  // Unassign from MULTIPLE buildings
  for (const stateKey of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[stateKey]) {
      const count = instance.workersAssigned || 0;
      gameState.availableWorkers += count;
      instance.workersAssigned = 0;
    }
  }
}
