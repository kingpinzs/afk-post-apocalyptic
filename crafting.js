/**
 * crafting.js
 *
 * Handles ONE-TIME CONSTRUCTION of buildings, tools, and upgrades.
 * Does NOT handle continuous production (that's automation.js).
 *
 * Three-gate system:
 *   1. Knowledge — blueprint unlocked via studying the Book
 *   2. Workstation — workbench level or specialized station built
 *   3. Resources — have the materials
 *
 * Supports SINGLE chains (build first level, upgrade in-place) and
 * MULTIPLE chains (build new instances or upgrade existing ones).
 *
 * Quality system applies to tools/equipment only.
 */

import {
  gameState,
  getConfig,
  hasWorkstation,
  getWorkbenchLevel,
  generateInstanceId,
  getWorkbenchSpeedMultiplier,
  notifyTab
} from './gameState.js';
import { getEffect } from './effects.js';


// ─── Module State ────────────────────────────────────────────────────────────

let craftingInProgress = false;
let craftingInterval = null;


// ─── Chain ID Mapping ────────────────────────────────────────────────────────
// The JSON config uses chain IDs like 'farming', 'hunting', 'fishing' but
// gameState.multipleBuildings uses 'food_farming', 'food_hunting', 'food_fishing'.
// This mapping resolves the mismatch for MULTIPLE chains.

const CHAIN_TO_STATE_KEY = {
  farming:  'food_farming',
  hunting:  'food_hunting',
  fishing:  'food_fishing'
};

/**
 * Resolve a config chain ID to its gameState key.
 * Most chains map 1:1; a few MULTIPLE chains have different state keys.
 * @param {string} chainId - Chain ID from config (e.g. 'farming').
 * @returns {string} The gameState key (e.g. 'food_farming').
 */
function resolveStateKey(chainId) {
  return CHAIN_TO_STATE_KEY[chainId] || chainId;
}


// ─── Item Category Classification ────────────────────────────────────────────

/** Processing chains that count as workstations in the UI. */
const PROCESSING_CHAINS = new Set([
  'kiln', 'forge', 'sawmill', 'loom', 'tannery',
  'glassworks', 'charcoal_pit', 'herbalist_hut', 'paper_mill',
  'bone_crafting'
]);

/**
 * Determine the UI category for an item based on its chain config.
 * @param {object} item - Item from config.
 * @returns {string} One of: 'tools', 'workstations', 'workbench', 'equipment', 'buildings'.
 */
function getItemCategory(item) {
  const config = getConfig();
  const chain = config.chains[item.chain];
  if (!chain) return 'buildings';

  if (chain.category === 'tools') return 'tools';
  if (item.chain === 'workbench') return 'workbench';
  if (chain.category === 'workstation' || PROCESSING_CHAINS.has(item.chain)) {
    return 'workstations';
  }
  if (chain.category === 'equipment') return 'equipment';
  return 'buildings';
}


// ─── Resource Checks ─────────────────────────────────────────────────────────

/**
 * Check whether the player has enough of every resource in a requirements map.
 * @param {object|null} requirements - { resource: amount, ... }
 * @returns {boolean}
 */
function hasResources(requirements) {
  if (!requirements) return true;
  for (const [resource, amount] of Object.entries(requirements)) {
    if ((gameState.resources[resource] || 0) < amount) return false;
  }
  return true;
}

/**
 * Get a per-resource breakdown of which requirements are met and which are not.
 * Useful for UI coloring (green/red).
 * @param {object|null} requirements - { resource: amount, ... }
 * @returns {Array<{ resource: string, required: number, available: number, met: boolean }>}
 */
function getResourceBreakdown(requirements) {
  if (!requirements) return [];
  return Object.entries(requirements).map(([resource, amount]) => ({
    resource,
    required: amount,
    available: gameState.resources[resource] || 0,
    met: (gameState.resources[resource] || 0) >= amount
  }));
}


// ─── Built-State Checks ─────────────────────────────────────────────────────

/**
 * Check whether a SINGLE item is already built at this level or higher.
 * MULTIPLE items are never "already built" (you can always build another).
 * @param {object} item - Item from config.
 * @returns {boolean}
 */
export function isAlreadyBuilt(item) {
  const config = getConfig();
  const chainConfig = config.chains[item.chain];
  if (!chainConfig) return false;

  if (chainConfig.type !== 'SINGLE') return false;

  const stateKey = resolveStateKey(item.chain);

  // Check tools
  if (gameState.tools[stateKey]) {
    return gameState.tools[stateKey].level >= item.level;
  }

  // Check buildings
  if (gameState.buildings[stateKey]) {
    return gameState.buildings[stateKey].level >= item.level;
  }

  return false;
}

/**
 * For SINGLE upgrade chains, check whether the previous level is built.
 * Level 1 items don't need a previous level.
 * @param {object} item - Item from config.
 * @returns {boolean}
 */
function hasPreviousLevel(item) {
  if (item.level <= 1) return true;

  const config = getConfig();
  const chainConfig = config.chains[item.chain];
  if (!chainConfig || chainConfig.type !== 'SINGLE') return true;

  const stateKey = resolveStateKey(item.chain);

  // Check tools
  if (gameState.tools[stateKey]) {
    return gameState.tools[stateKey].level >= item.level - 1;
  }

  // Check buildings
  if (gameState.buildings[stateKey]) {
    return gameState.buildings[stateKey].level >= item.level - 1;
  }

  return false;
}


// ─── Public API: Query Craftable Items ───────────────────────────────────────

/**
 * Get all craftable items grouped by category.
 * Only shows items where the blueprint is unlocked.
 * Items are marked with a status indicating what gate is blocking them (if any).
 *
 * @returns {object} { tools: [], buildings: [], workstations: [], workbench: [], equipment: [] }
 */
export function getCraftableItems() {
  const config = getConfig();
  if (!config || !config.items) return {};

  const categories = {
    tools: [],
    buildings: [],
    workstations: [],
    workbench: [],
    equipment: []
  };

  for (const item of config.items) {
    // Gate 1: Must have blueprint unlocked
    if (!gameState.unlockedBlueprints.includes(item.id)) continue;

    // Determine category
    const category = getItemCategory(item);
    if (!categories[category]) continue;

    // Gate 2: Workstation check
    const workstationOk = hasWorkstation(item.workstationRequired);

    // Gate 3: Resources check
    const resourcesOk = hasResources(item.requirements);

    // SINGLE chains: already built?
    const alreadyBuilt = isAlreadyBuilt(item);

    // SINGLE chains: has previous level in the chain?
    const prevLevelOk = hasPreviousLevel(item);

    // Missing workstation label (for UI)
    let missingWorkstation = null;
    if (!workstationOk && item.workstationRequired) {
      missingWorkstation = item.workstationRequired;
    }

    // Determine status
    let status;
    if (alreadyBuilt) {
      status = 'already_built';
    } else if (!prevLevelOk) {
      status = 'missing_previous_level';
    } else if (!workstationOk) {
      status = 'missing_workstation';
    } else if (!resourcesOk) {
      status = 'missing_resources';
    } else {
      status = 'craftable';
    }

    categories[category].push({
      ...item,
      status,
      canCraft: status === 'craftable',
      missingWorkstation,
      resourceBreakdown: getResourceBreakdown(item.requirements)
    });
  }

  return categories;
}


// ─── Public API: Start Crafting ──────────────────────────────────────────────

/**
 * Start crafting an item. Validates gates, deducts resources, adds to queue.
 *
 * @param {string} itemId - The item ID to craft.
 * @param {string|null} upgradeInstanceId - For MULTIPLE upgrades, which instance to upgrade.
 * @returns {boolean} True if crafting was started successfully.
 */
export function startCrafting(itemId, upgradeInstanceId = null) {
  const config = getConfig();
  if (!config || !config.items) return false;

  const item = config.items.find(i => i.id === itemId);
  if (!item) return false;

  // Gate 1: Blueprint unlocked
  if (!gameState.unlockedBlueprints.includes(item.id)) return false;

  // Gate 2: Workstation
  if (!hasWorkstation(item.workstationRequired)) return false;

  // Gate 3: Resources
  if (!hasResources(item.requirements)) return false;

  // SINGLE chain: not already built at this level or higher
  if (isAlreadyBuilt(item)) return false;

  // SINGLE chain: must have previous level
  if (!hasPreviousLevel(item)) return false;

  // Check not already in the queue for the same item (for SINGLE chains)
  const chainConfig = config.chains[item.chain];
  if (chainConfig && chainConfig.type === 'SINGLE') {
    const alreadyQueued = gameState.craftingQueue.some(q => q.chain === item.chain);
    if (alreadyQueued) return false;
  }

  // ── Deduct resources ──────────────────────────────────────────────────
  // Apply resourceEfficiencyMultiplier if available (reduces costs, min 1 each)
  const resEfficiency = getEffect('resourceEfficiencyMultiplier', 1.0);
  for (const [resource, amount] of Object.entries(item.requirements)) {
    const cost = resEfficiency > 1
      ? Math.max(1, Math.ceil(amount / resEfficiency))
      : amount;
    gameState.resources[resource] -= cost;
  }

  // ── Calculate crafting time ───────────────────────────────────────────
  const workbenchSpeed = getWorkbenchSpeedMultiplier();
  const constructionMult = getEffect('constructionSpeedMultiplier', 1.0);
  const craftingMult = getEffect('craftingEfficiencyMultiplier', 1.0);

  // Combine all speed factors
  let speedFactor = workbenchSpeed;
  if (constructionMult > 1) speedFactor *= constructionMult;
  if (craftingMult > 1) speedFactor *= craftingMult;

  const effectiveTime = item.craftingTime / speedFactor;

  // ── Determine if this is an upgrade ───────────────────────────────────
  const stateKey = resolveStateKey(item.chain);
  const isUpgrade = upgradeInstanceId !== null
    || (chainConfig?.type === 'SINGLE' && (
      (gameState.buildings[stateKey]?.level > 0)
      || (gameState.tools[stateKey]?.level > 0)
    ));

  // ── Add to queue ──────────────────────────────────────────────────────
  gameState.craftingQueue.push({
    itemId: item.id,
    chain: item.chain,
    level: item.level,
    progress: 0,
    duration: effectiveTime,
    isUpgrade,
    targetInstanceId: upgradeInstanceId || null
  });

  // Start processing if not already running
  if (!craftingInProgress) {
    startProcessingQueue();
  }

  return true;
}


// ─── Queue Processing ────────────────────────────────────────────────────────

/**
 * Start processing the crafting queue on a 100ms interval.
 * Guarded by craftingInProgress to prevent overlapping intervals.
 */
function startProcessingQueue() {
  if (craftingInProgress) return;
  if (gameState.craftingQueue.length === 0) return;

  craftingInProgress = true;

  craftingInterval = setInterval(() => {
    // Stop if game is over
    if (gameState.isGameOver) {
      clearInterval(craftingInterval);
      craftingInterval = null;
      craftingInProgress = false;
      return;
    }

    // Stop if queue is empty
    if (gameState.craftingQueue.length === 0) {
      clearInterval(craftingInterval);
      craftingInterval = null;
      craftingInProgress = false;
      return;
    }

    // Advance the first item in the queue
    const current = gameState.craftingQueue[0];
    current.progress += 100; // 100ms per tick

    // Check completion
    if (current.progress >= current.duration) {
      completeCrafting(current);
      gameState.craftingQueue.shift();

      // If queue empty, stop interval
      if (gameState.craftingQueue.length === 0) {
        clearInterval(craftingInterval);
        craftingInterval = null;
        craftingInProgress = false;
      }
    }
  }, 100);
}


// ─── Crafting Completion ─────────────────────────────────────────────────────

/**
 * Complete a crafted item — place it into the world state.
 * Handles SINGLE buildings, tools, and MULTIPLE building instances.
 *
 * @param {object} queueItem - The queue entry being completed.
 */
function completeCrafting(queueItem) {
  const config = getConfig();
  if (!config) return;

  const item = config.items.find(i => i.id === queueItem.itemId);
  if (!item) return;

  const chainConfig = config.chains[item.chain];
  if (!chainConfig) return;

  const stateKey = resolveStateKey(item.chain);

  // ── Tools (SINGLE, portable) ──────────────────────────────────────────
  if (chainConfig.category === 'tools' && gameState.tools[stateKey]) {
    gameState.tools[stateKey].level = item.level;
    gameState.tools[stateKey].itemId = item.id;

    // Quality roll for tools
    const quality = rollQuality();
    gameState.tools[stateKey].quality = quality;

    // Update toolLevels for the matching tool type
    const toolTypeMap = {
      cutting_tools: 'cutting',
      chopping_tools: 'chopping',
      mining_tools: 'mining',
      construction_tools: 'construction',
      farming_tools: 'farming',
      fishing_tools: 'fishing',
      hunting_tools: 'hunting'
    };
    const toolType = toolTypeMap[stateKey];
    if (toolType && gameState.toolLevels[toolType] !== undefined) {
      gameState.toolLevels[toolType] = item.level;
    }
  }
  // ── SINGLE buildings ──────────────────────────────────────────────────
  else if (chainConfig.type === 'SINGLE' && gameState.buildings[stateKey]) {
    gameState.buildings[stateKey].level = item.level;
    gameState.buildings[stateKey].itemId = item.id;
  }
  // ── MULTIPLE buildings ────────────────────────────────────────────────
  else if (chainConfig.type === 'MULTIPLE') {
    if (queueItem.targetInstanceId) {
      // Upgrade an existing instance
      const instances = gameState.multipleBuildings[stateKey];
      if (instances) {
        const instance = instances.find(i => i.id === queueItem.targetInstanceId);
        if (instance) {
          instance.level = item.level;
          instance.itemId = item.id;
        }
      }
    } else {
      // Build a new instance
      const newInstance = {
        id: generateInstanceId(),
        level: item.level,
        itemId: item.id,
        workersAssigned: 0
      };
      if (!gameState.multipleBuildings[stateKey]) {
        gameState.multipleBuildings[stateKey] = [];
      }
      gameState.multipleBuildings[stateKey].push(newInstance);
    }
  }

  // ── Update stats ──────────────────────────────────────────────────────
  gameState.stats.totalCrafted = (gameState.stats.totalCrafted || 0) + 1;

  // Notify Settlement tab about new building/tool
  notifyTab('settlement');
}


// ─── Quality System ──────────────────────────────────────────────────────────

/**
 * Quality roll for tools and equipment.
 * Base: Common 60%, Fine 25%, Superior 10%, Masterwork 5%.
 * Construction tools improve chances via qualityBonusMultiplier effect.
 *
 * @returns {string} Quality tier name.
 */
export function rollQuality() {
  const constructionBonus = getEffect('qualityBonusMultiplier', 1.0);
  const roll = Math.random() * 100;

  // Scale chances with construction bonus
  const masterworkChance = 5 * constructionBonus;
  const superiorChance = 10 * constructionBonus;
  const fineChance = 25 * constructionBonus;

  if (roll < masterworkChance) return 'masterwork';
  if (roll < masterworkChance + superiorChance) return 'superior';
  if (roll < masterworkChance + superiorChance + fineChance) return 'fine';
  return 'common';
}

/**
 * Quality multiplier applied to tool/equipment effects.
 * @param {string} quality - Quality tier name.
 * @returns {number} Effect multiplier.
 */
export function getQualityMultiplier(quality) {
  const multipliers = {
    common: 1.0,
    fine: 1.2,
    superior: 1.5,
    masterwork: 2.0
  };
  return multipliers[quality] || 1.0;
}


// ─── MULTIPLE Chain Helpers ──────────────────────────────────────────────────

/**
 * Get items available for upgrading an existing MULTIPLE building instance.
 * Returns the next-level item(s) in the chain that are unlocked and have
 * their workstation requirement met.
 *
 * @param {string} chain - Chain ID from config (e.g. 'shelter').
 * @param {string} instanceId - The specific instance to upgrade.
 * @returns {Array<object>} Upgradeable item(s), each annotated with resource status.
 */
export function getUpgradeOptions(chain, instanceId) {
  const config = getConfig();
  if (!config) return [];

  const stateKey = resolveStateKey(chain);
  const instances = gameState.multipleBuildings[stateKey];
  const instance = instances?.find(i => i.id === instanceId);
  if (!instance) return [];

  // If an upgrade for this instance is already queued, show no options
  const alreadyQueued = gameState.craftingQueue.some(q => q.targetInstanceId === instanceId);
  if (alreadyQueued) return [];

  // Find next level items in this chain that are unlocked
  return config.items
    .filter(item => item.chain === chain && item.level === instance.level + 1)
    .filter(item => gameState.unlockedBlueprints.includes(item.id))
    .map(item => ({
      ...item,
      workstationOk: hasWorkstation(item.workstationRequired),
      resourcesOk: hasResources(item.requirements),
      resourceBreakdown: getResourceBreakdown(item.requirements),
      canCraft: hasWorkstation(item.workstationRequired) && hasResources(item.requirements)
    }));
}

/**
 * Get a summary of all MULTIPLE building instances for a given chain.
 * Used by the UI to show "Shelter (x3) [Build Another] [Upgrade]" etc.
 *
 * @param {string} chain - Chain ID from config (e.g. 'shelter').
 * @returns {Array<object>} Instance summaries with level, name, workers, upgradeOptions.
 */
export function getMultipleChainSummary(chain) {
  const config = getConfig();
  if (!config) return [];

  const stateKey = resolveStateKey(chain);
  const instances = gameState.multipleBuildings[stateKey] || [];

  return instances.map(inst => {
    const item = inst.itemId
      ? config.items.find(i => i.id === inst.itemId)
      : null;

    return {
      instanceId: inst.id,
      level: inst.level,
      name: item?.name || `${chain} (level ${inst.level})`,
      itemId: inst.itemId,
      workersAssigned: inst.workersAssigned || 0,
      upgradeOptions: getUpgradeOptions(chain, inst.id)
    };
  });
}


// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Clear the crafting interval. Called on game reset or game over.
 */
export function clearCraftingInterval() {
  if (craftingInterval) {
    clearInterval(craftingInterval);
    craftingInterval = null;
  }
  craftingInProgress = false;
}


// ─── Queue Accessor ──────────────────────────────────────────────────────────

/**
 * Get the current crafting queue for UI rendering.
 * @returns {Array<object>} The crafting queue entries.
 */
export function getCraftingQueue() {
  return gameState.craftingQueue;
}


// ─── Chain-to-State Key Accessor ─────────────────────────────────────────────

/**
 * Expose the chain-to-state key resolver for other modules (e.g. automation).
 * @param {string} chainId
 * @returns {string}
 */
export { resolveStateKey };
