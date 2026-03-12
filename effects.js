/**
 * effects.js
 *
 * Central effect aggregation utility for the chain-based building system.
 * Iterates SINGLE buildings, MULTIPLE buildings, and tools to compute
 * aggregate effect values from all built items.
 *
 * Two aggregation modes:
 *   - Multiplicative (keys ending in "Multiplier"): start at 1.0, multiply each
 *   - Additive (everything else — Rate, Chance, Capacity, Bonus, etc.): start at 0, sum each
 */

import { gameState, getConfig } from './gameState.js';

// ─── Item Lookup Cache ────────────────────────────────────────────────────────
// Avoids repeated config.items.find() calls within the same tick.

let _itemMapConfig = null;
let _itemMap = null;

/**
 * Build or return a cached Map of item ID → item object.
 * Invalidates when the config reference changes (e.g. after reload).
 * @returns {Map<string, object>|null} Item lookup map, or null if config unavailable.
 */
function getItemMap() {
  let config;
  try {
    config = getConfig();
  } catch {
    return null;
  }

  if (!config || !config.items) return null;

  // Rebuild cache if config has changed
  if (config !== _itemMapConfig) {
    _itemMap = new Map();
    for (const item of config.items) {
      _itemMap.set(item.id, item);
    }
    _itemMapConfig = config;
  }

  return _itemMap;
}

/**
 * Look up an item by its ID using the cached map.
 * @param {string} itemId
 * @returns {object|undefined}
 */
function lookupItem(itemId) {
  const map = getItemMap();
  return map ? map.get(itemId) : undefined;
}


// ─── Effect Aggregation ──────────────────────────────────────────────────────

/**
 * Compute the aggregate value of an effect key across all built items
 * (SINGLE buildings, MULTIPLE buildings, and tools).
 *
 * Multiplicative effects (keys ending in 'Multiplier') multiply together starting at 1.0.
 * Additive effects (Rate, Chance, Bonus, Capacity, etc.) sum starting at 0.
 *
 * @param {string} effectKey  - The effect key to aggregate (e.g. 'craftingEfficiencyMultiplier').
 * @param {number} [defaultValue] - Override the base value. If omitted, multiplicative keys
 *                                  default to 1.0 and additive keys default to 0.
 * @returns {number} The aggregated effect value.
 */
export function getEffect(effectKey, defaultValue) {
  const isMultiplicative = effectKey.endsWith('Multiplier');
  const base = defaultValue !== undefined
    ? defaultValue
    : (isMultiplicative ? 1.0 : 0);

  const itemMap = getItemMap();
  if (!itemMap) return base;

  let value = base;

  // ── SINGLE buildings ──────────────────────────────────────────────────
  for (const chainId of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[chainId];
    if (building.level === 0 || !building.itemId) continue;

    const item = itemMap.get(building.itemId);
    if (!item?.effect || item.effect[effectKey] === undefined) continue;

    if (isMultiplicative) {
      value *= item.effect[effectKey];
    } else {
      value += item.effect[effectKey];
    }
  }

  // ── MULTIPLE buildings ────────────────────────────────────────────────
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[chainId]) {
      if (!instance.itemId) continue;

      const item = itemMap.get(instance.itemId);
      if (!item?.effect || item.effect[effectKey] === undefined) continue;

      if (isMultiplicative) {
        value *= item.effect[effectKey];
      } else {
        value += item.effect[effectKey];
      }
    }
  }

  // ── Tools ─────────────────────────────────────────────────────────────
  for (const chainId of Object.keys(gameState.tools)) {
    const tool = gameState.tools[chainId];
    if (tool.level === 0 || !tool.itemId) continue;

    const item = itemMap.get(tool.itemId);
    if (!item?.effect || item.effect[effectKey] === undefined) continue;

    if (isMultiplicative) {
      value *= item.effect[effectKey];
    } else {
      value += item.effect[effectKey];
    }
  }

  return value;
}


/**
 * Check whether any built item provides a specific effect key.
 *
 * @param {string} effectKey - The effect key to check for.
 * @returns {boolean} True if at least one built item has this effect.
 */
export function hasEffect(effectKey) {
  const itemMap = getItemMap();
  if (!itemMap) return false;

  // Check SINGLE buildings
  for (const chainId of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[chainId];
    if (building.level === 0 || !building.itemId) continue;

    const item = itemMap.get(building.itemId);
    if (item?.effect?.[effectKey] !== undefined) return true;
  }

  // Check MULTIPLE buildings
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[chainId]) {
      if (!instance.itemId) continue;

      const item = itemMap.get(instance.itemId);
      if (item?.effect?.[effectKey] !== undefined) return true;
    }
  }

  // Check tools
  for (const chainId of Object.keys(gameState.tools)) {
    const tool = gameState.tools[chainId];
    if (tool.level === 0 || !tool.itemId) continue;

    const item = itemMap.get(tool.itemId);
    if (item?.effect?.[effectKey] !== undefined) return true;
  }

  return false;
}


/**
 * Get the value of a specific effect from a specific built item.
 * Useful when you need to check one building's contribution rather than the aggregate.
 *
 * @param {string} itemId - The item ID to look up.
 * @param {string} effectKey - The effect key to retrieve.
 * @returns {number|undefined} The effect value, or undefined if not present.
 */
export function getItemEffect(itemId, effectKey) {
  const item = lookupItem(itemId);
  return item?.effect?.[effectKey];
}


// ─── Production Rate Aggregation ─────────────────────────────────────────────

/**
 * Get total production rate for a resource across all production buildings.
 * Used by the automation system to calculate resource generation per day.
 *
 * Checks both SINGLE production buildings (processing workstations like kiln, forge)
 * and MULTIPLE production buildings (farms, wells, etc.).
 *
 * Production only happens when workers are assigned. Rate scales linearly with
 * worker count, and can be modified by tool bonuses.
 *
 * @param {string} outputResource - The resource being produced (e.g. 'bricks', 'food').
 * @returns {number} Total production rate per day for this resource.
 */
export function getTotalProductionRate(outputResource) {
  const itemMap = getItemMap();
  if (!itemMap) return 0;

  let total = 0;

  // ── SINGLE production buildings (processing workstations) ─────────────
  for (const chainId of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[chainId];
    if (building.level === 0 || !building.itemId) continue;

    const item = itemMap.get(building.itemId);
    if (!item) continue;

    // Check if this building produces the requested resource
    const produces = item.productionOutput?.[outputResource]
      || item.produces === outputResource;
    if (!produces) continue;

    const workers = gameState.automationAssignments[chainId] || 0;
    if (workers === 0) continue;

    const baseRate = item.productionRate || 0;
    total += baseRate * workers;
  }

  // ── MULTIPLE production buildings (farms, wells, hunting, fishing) ────
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[chainId]) {
      if (!instance.itemId) continue;

      const item = itemMap.get(instance.itemId);
      if (!item) continue;

      // Check if this building produces the requested resource
      const produces = item.productionOutput?.[outputResource]
        || item.produces === outputResource;
      if (!produces) continue;

      const workers = instance.workersAssigned || 0;
      if (workers === 0) continue;

      const baseRate = item.productionRate || 0;
      total += baseRate * workers;
    }
  }

  return total;
}


/**
 * Get the total number of workers assigned across all production buildings.
 * Useful for the worker summary display and availability calculations.
 *
 * @returns {number} Total workers currently assigned to any production.
 */
export function getTotalAssignedWorkers() {
  let total = 0;

  // SINGLE building assignments
  for (const count of Object.values(gameState.automationAssignments)) {
    total += count || 0;
  }

  // MULTIPLE building assignments
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[chainId]) {
      total += instance.workersAssigned || 0;
    }
  }

  return total;
}


/**
 * Get all effect values from a specific chain's current item.
 * Returns the full effect object, or an empty object if not built.
 *
 * @param {string} chainId - The chain ID.
 * @returns {object} The effect object from the config item, or {}.
 */
export function getChainEffects(chainId) {
  // Check SINGLE buildings
  if (gameState.buildings[chainId]) {
    const building = gameState.buildings[chainId];
    if (building.level === 0 || !building.itemId) return {};
    const item = lookupItem(building.itemId);
    return item?.effect || {};
  }

  // Check tools
  if (gameState.tools[chainId]) {
    const tool = gameState.tools[chainId];
    if (tool.level === 0 || !tool.itemId) return {};
    const item = lookupItem(tool.itemId);
    return item?.effect || {};
  }

  return {};
}
