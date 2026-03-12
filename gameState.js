/**
 * gameState.js
 *
 * Central game state object and config loader for the post-apocalyptic survival game.
 * v2 — chain-based building system with SINGLE/MULTIPLE types, multi-settlement support,
 * portable tools, and blueprint-driven progression.
 *
 * State is divided into three tiers:
 *   1. Global — persists across settlements (knowledge, blueprints, tools, currency, etc.)
 *   2. Current Settlement — the active settlement the player is managing
 *   3. Settlement Network — previous settlements providing supply lines
 */

let gameConfig;
let instanceCounter = 0;

// ─── Game State ───────────────────────────────────────────────────────────────

export const gameState = {

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL (persists across settlements)
  // ═══════════════════════════════════════════════════════════════════════════

  knowledge: 0,
  maxKnowledge: 0,
  unlockedBlueprints: [],       // item IDs learned from studying the Book
  currency: 0,
  achievements: [],
  completedQuests: [],
  totalDaysPlayed: 0,

  // Portable tools — travel with the player between settlements
  toolLevels: {
    cutting: 0,
    chopping: 0,
    mining: 0,
    construction: 0,
    farming: 0,
    fishing: 0,
    hunting: 0
  },

  difficulty: 'normal',
  settings: {
    daySpeed: 30                // seconds per game day
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CURRENT SETTLEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  settlementId: 'settlement_1',
  settlementName: 'Camp',
  biome: 'forest',
  day: 1,
  time: 0,
  currentSeason: 'spring',
  currentWeather: 'clear',

  // Resources — 11 raw + 9 processed + hides
  resources: {
    // Raw
    sticks: 0,
    food: 50,
    water: 50,
    stone: 0,
    clay: 0,
    fiber: 0,
    herbs: 0,
    wood: 0,
    ore: 0,
    fruit: 0,
    sand: 0,
    // Processed
    boards: 0,
    metal: 0,
    glass: 0,
    leather: 0,
    cloth: 0,
    bricks: 0,
    fuel: 0,
    medicine: 0,
    paper: 0,
    // Special
    hides: 0
  },

  // Which resources the player knows about (computed from blueprints)
  unlockedResources: ['sticks', 'food', 'water'],

  population: 1,
  availableWorkers: 1,
  populationMembers: [],        // [{ id, name, skills, health, happiness, sick, assignment }]

  // ── Buildings — SINGLE chains (one instance, upgrade in place) ──────────
  // key = chain ID, value = { level: 0, itemId: null }
  // level 0 = not built
  buildings: {
    // Core infrastructure
    workbench:       { level: 0, itemId: null },
    energy:          { level: 0, itemId: null },
    medical:         { level: 0, itemId: null },
    trade:           { level: 0, itemId: null },
    economy:         { level: 0, itemId: null },
    knowledge:       { level: 0, itemId: null },
    culture:         { level: 0, itemId: null },
    infrastructure:  { level: 0, itemId: null },
    // Processing workstations (SINGLE, upgradeable)
    kiln:            { level: 0, itemId: null },
    forge:           { level: 0, itemId: null },
    sawmill:         { level: 0, itemId: null },
    loom:            { level: 0, itemId: null },
    tannery:         { level: 0, itemId: null },
    glassworks:      { level: 0, itemId: null },
    charcoal_pit:    { level: 0, itemId: null },
    herbalist_hut:   { level: 0, itemId: null },
    paper_mill:      { level: 0, itemId: null }
  },

  // ── Buildings — MULTIPLE chains (many instances allowed) ────────────────
  // key = chain ID, value = array of instances
  // each instance: { id, level, itemId, workersAssigned }
  multipleBuildings: {
    shelter:       [],
    food_farming:  [],
    food_hunting:  [],
    food_fishing:  [],
    water:         [],
    defense:       []
  },

  // ── Tools — SINGLE chains (portable, persist across settlements) ────────
  tools: {
    cutting_tools:      { level: 0, itemId: null },
    chopping_tools:     { level: 0, itemId: null },
    mining_tools:       { level: 0, itemId: null },
    construction_tools: { level: 0, itemId: null },
    farming_tools:      { level: 0, itemId: null },
    fishing_tools:      { level: 0, itemId: null },
    hunting_tools:      { level: 0, itemId: null }
  },

  // Worker assignments for SINGLE production buildings
  automationAssignments: {},    // { 'kiln': 2, 'forge': 1, ... }

  // Crafting queue
  // [{ itemId, progress, duration, chain, isUpgrade, targetInstanceId }]
  craftingQueue: [],

  // Exploration
  explorations: [],
  discoveredLocations: [],
  discoveredSettlementSites: [],

  // Events
  activeEvents: [],
  seenMilestones: [],
  gatheringModifiers: [],
  gatheringEfficiency: 1.0,

  // Trading
  traderVisits: [],
  activeTrades: [],

  // Factions
  factions: [],

  // Quests
  activeQuests: [],

  // Study state
  currentChapter: 1,
  studyProgress: 0,            // progress toward next page
  pendingPuzzle: null,
  studyGateProgress: {},       // track study gate requirements

  // Stats
  stats: {
    totalGathered: 0,
    totalCrafted: 0,
    totalExplored: 0,
    totalTraded: 0,
    totalStudied: 0,
    totalDaysInSettlement: 0
  },

  // Game flags
  isGameOver: false,
  gameStarted: false,

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTLEMENT NETWORK (multi-settlement)
  // ═══════════════════════════════════════════════════════════════════════════

  // Previous settlements with snapshots for switching
  // [{ id, name, biome, founded, _snapshot }]
  settlements: [],

  // Inter-settlement supply lines
  // [{ id, from, to, resource, amount, active, createdDay }]
  supplyLines: [],

  // Save versioning
  saveVersion: 2
};


// ─── Config Loading ───────────────────────────────────────────────────────────

/**
 * Load game configuration from knowledge_data.json.
 * Merges initialState from config into gameState and syncs availableWorkers.
 */
export async function loadGameConfig() {
  try {
    const response = await fetch('knowledge_data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    gameConfig = await response.json();

    // Merge any initialState values from config (population, day, etc.)
    if (gameConfig.initialState) {
      Object.assign(gameState, gameConfig.initialState);
    }
    gameState.availableWorkers = gameState.population;
  } catch (error) {
    console.error('Failed to load game configuration:', error);
  }
}

/**
 * Return the cached game config. Throws if config has not been loaded yet.
 * @returns {object} The parsed knowledge_data.json config.
 */
export function getConfig() {
  if (!gameConfig) {
    throw new Error('Game configuration has not been loaded yet.');
  }
  return gameConfig;
}


// ─── Resource Discovery ──────────────────────────────────────────────────────

/**
 * Compute which resources the player has discovered through studying the Book.
 * Basic resources (sticks, food, water) are always unlocked.
 * Others unlock when related blueprints are learned (via item.revealsResources).
 *
 * Falls back to the legacy resourceUnlocks config if present (for transition).
 *
 * @returns {string[]} Newly unlocked resource IDs (ones not previously in the list).
 */
export function computeUnlockedResources() {
  const always = ['sticks', 'food', 'water'];
  const unlocked = new Set(always);

  let config;
  try {
    config = getConfig();
  } catch {
    // Config not loaded yet — return basics
    gameState.unlockedResources = [...unlocked];
    return [];
  }

  // New system: check blueprints for revealsResources
  if (config.items) {
    for (const blueprintId of gameState.unlockedBlueprints) {
      const item = config.items.find(i => i.id === blueprintId);
      if (item && item.revealsResources) {
        item.revealsResources.forEach(r => unlocked.add(r));
      }
    }
  }

  // Legacy fallback: if config still has resourceUnlocks, honor them
  if (config.resourceUnlocks) {
    for (const [resource, rule] of Object.entries(config.resourceUnlocks)) {
      if (rule.type === 'always') {
        unlocked.add(resource);
      } else if (rule.type === 'blueprint' && gameState.unlockedBlueprints.includes(rule.requires)) {
        unlocked.add(resource);
      } else if (rule.type === 'building') {
        // Check if the required building chain is built
        const building = gameState.buildings[rule.requires];
        if (building && building.level > 0) {
          unlocked.add(resource);
        }
      }
    }
  }

  const prev = gameState.unlockedResources;
  const newList = [...unlocked];
  const newlyUnlocked = newList.filter(r => !prev.includes(r));
  gameState.unlockedResources = newList;
  return newlyUnlocked;
}


// ─── Building Helpers ─────────────────────────────────────────────────────────

/**
 * Get the current level of a SINGLE chain (building or tool).
 * @param {string} chainId - The chain ID (e.g. 'workbench', 'cutting_tools').
 * @returns {number} The level (0 = not built).
 */
export function getBuildingLevel(chainId) {
  if (gameState.buildings[chainId]) return gameState.buildings[chainId].level;
  if (gameState.tools[chainId]) return gameState.tools[chainId].level;
  return 0;
}

/**
 * Get all instances of a MULTIPLE chain.
 * @param {string} chainId - The chain ID (e.g. 'shelter', 'food_farming').
 * @returns {Array} Array of building instances.
 */
export function getMultipleBuildingInstances(chainId) {
  return gameState.multipleBuildings[chainId] || [];
}

/**
 * Get total housing capacity across all shelter instances.
 * Each shelter's housingCapacity comes from its item config's effect.
 * @returns {number} Total available housing slots.
 */
export function getTotalHousing() {
  let config;
  try {
    config = getConfig();
  } catch {
    return 0;
  }

  return gameState.multipleBuildings.shelter.reduce((sum, instance) => {
    const item = config.items.find(i => i.id === instance.itemId);
    return sum + (item?.effect?.housingCapacity || 0);
  }, 0);
}

/**
 * Get the workbench level (critical for crafting gate).
 * @returns {number} Workbench level (0-6).
 */
export function getWorkbenchLevel() {
  return gameState.buildings.workbench.level;
}

/**
 * Check if the player can access a given workstation.
 * Workbench levels 1-6 map to specific named workstations.
 * Specialized workstations (kiln, forge, etc.) require that building to be built.
 *
 * @param {string} required - The workstation requirement string (e.g. 'by_hand', 'crude_workbench', 'kiln').
 * @returns {boolean} Whether the workstation requirement is met.
 */
export function hasWorkstation(required) {
  if (!required || required === 'by_hand') return true;

  // Workbench tiers — each requires a minimum workbench level
  const workbenchTiers = {
    'crude_workbench':  1,
    'wooden_workbench': 2,
    'stone_workshop':   3,
    'smithy':           4,
    'factory':          5,
    'advanced_lab':     6
  };

  if (workbenchTiers[required] !== undefined) {
    return gameState.buildings.workbench.level >= workbenchTiers[required];
  }

  // Specialized workstations — check if that building chain is built
  if (gameState.buildings[required]) {
    return gameState.buildings[required].level > 0;
  }

  return false;
}

/**
 * Get the crafting speed multiplier from the current workbench level.
 * @returns {number} Speed multiplier (1x to 5x).
 */
export function getWorkbenchSpeedMultiplier() {
  const speedByLevel = [1, 1, 1.25, 1.5, 2, 3, 5];
  const level = gameState.buildings.workbench.level;
  return speedByLevel[level] || 1;
}

/**
 * Get the resource cap for a given resource.
 * Base caps can be increased by storage buildings (e.g. storehouse).
 * @param {string} resource - Resource ID.
 * @returns {number} Maximum amount that can be stored.
 */
export function getResourceCap(resource) {
  let config;
  try {
    config = getConfig();
  } catch {
    return 100;
  }

  const baseCaps = config.resourceCaps || {};
  const base = baseCaps[resource] ?? 100;

  // Sum storageCapacity effects from all built items
  let multiplier = 1;
  let bonus = 0;

  // Check SINGLE buildings
  for (const chainId of Object.keys(gameState.buildings)) {
    const building = gameState.buildings[chainId];
    if (building.level === 0 || !building.itemId) continue;

    const item = config.items.find(i => i.id === building.itemId);
    if (!item?.effect) continue;

    if (item.effect.storageMultiplier) {
      multiplier *= item.effect.storageMultiplier;
    }
    if (item.effect.storageCapacity) {
      bonus += item.effect.storageCapacity;
    }
  }

  // Check MULTIPLE buildings
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const instance of gameState.multipleBuildings[chainId]) {
      if (!instance.itemId) continue;

      const item = config.items.find(i => i.id === instance.itemId);
      if (!item?.effect) continue;

      if (item.effect.storageMultiplier) {
        multiplier *= item.effect.storageMultiplier;
      }
      if (item.effect.storageCapacity) {
        bonus += item.effect.storageCapacity;
      }
    }
  }

  return Math.floor(base * multiplier) + bonus;
}


// ─── Instance ID Generation ──────────────────────────────────────────────────

/**
 * Generate a unique ID for MULTIPLE building instances.
 * @returns {string} Unique instance ID.
 */
export function generateInstanceId() {
  return `inst_${++instanceCounter}_${Date.now()}`;
}

/**
 * Reset the instance counter (used when loading a save).
 * @param {number} value - The counter value to restore.
 */
export function setInstanceCounter(value) {
  instanceCounter = value;
}

/**
 * Check if a building/tool with the given itemId is built somewhere in the
 * current settlement. Searches SINGLE buildings, MULTIPLE buildings, and tools.
 *
 * @param {string} itemId - The item ID to check.
 * @returns {boolean}
 */
export function isItemBuilt(itemId) {
  // Check SINGLE buildings
  for (const chainId of Object.keys(gameState.buildings)) {
    if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
      return true;
    }
  }
  // Check tools
  for (const chainId of Object.keys(gameState.tools)) {
    if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
      return true;
    }
  }
  // Check MULTIPLE buildings
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    if ((gameState.multipleBuildings[chainId] || []).some(inst => inst.itemId === itemId)) {
      return true;
    }
  }
  return false;
}

/**
 * Count the total number of distinct crafted items across all building types.
 * Used by quest/achievement systems for "craft N items" goals.
 *
 * @returns {number}
 */
export function getTotalCraftedCount() {
  let count = 0;
  // SINGLE buildings with level > 0
  for (const chainId of Object.keys(gameState.buildings)) {
    if (gameState.buildings[chainId].level > 0) count++;
  }
  // Tools with level > 0
  for (const chainId of Object.keys(gameState.tools)) {
    if (gameState.tools[chainId].level > 0) count++;
  }
  // MULTIPLE building instances
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    count += (gameState.multipleBuildings[chainId] || []).length;
  }
  return count;
}


// ─── Save / Load Helpers ─────────────────────────────────────────────────────

/**
 * Serialize the current game state into a save-compatible structure.
 * Follows the v2 save format: { version, timestamp, global, currentSettlement, settlements }.
 * @returns {object} Save data object.
 */
export function serializeState() {
  return {
    version: 2,
    timestamp: Date.now(),

    global: {
      knowledge: gameState.knowledge,
      maxKnowledge: gameState.maxKnowledge,
      unlockedBlueprints: [...gameState.unlockedBlueprints],
      currency: gameState.currency,
      achievements: [...gameState.achievements],
      completedQuests: [...gameState.completedQuests],
      totalDaysPlayed: gameState.totalDaysPlayed,
      toolLevels: { ...gameState.toolLevels },
      tools: JSON.parse(JSON.stringify(gameState.tools)),
      difficulty: gameState.difficulty,
      settings: { ...gameState.settings },
      factions: JSON.parse(JSON.stringify(gameState.factions))
    },

    currentSettlement: {
      id: gameState.settlementId,
      name: gameState.settlementName,
      biome: gameState.biome,
      day: gameState.day,
      time: gameState.time,
      currentSeason: gameState.currentSeason,
      currentWeather: gameState.currentWeather,
      resources: { ...gameState.resources },
      unlockedResources: [...gameState.unlockedResources],
      population: gameState.population,
      availableWorkers: gameState.availableWorkers,
      populationMembers: JSON.parse(JSON.stringify(gameState.populationMembers)),
      buildings: JSON.parse(JSON.stringify(gameState.buildings)),
      multipleBuildings: JSON.parse(JSON.stringify(gameState.multipleBuildings)),
      automationAssignments: { ...gameState.automationAssignments },
      craftingQueue: JSON.parse(JSON.stringify(gameState.craftingQueue)),
      explorations: JSON.parse(JSON.stringify(gameState.explorations)),
      discoveredLocations: [...gameState.discoveredLocations],
      discoveredSettlementSites: [...gameState.discoveredSettlementSites],
      activeEvents: JSON.parse(JSON.stringify(gameState.activeEvents)),
      seenMilestones: [...gameState.seenMilestones],
      gatheringModifiers: [...gameState.gatheringModifiers],
      gatheringEfficiency: gameState.gatheringEfficiency,
      traderVisits: JSON.parse(JSON.stringify(gameState.traderVisits)),
      activeTrades: JSON.parse(JSON.stringify(gameState.activeTrades)),
      activeQuests: JSON.parse(JSON.stringify(gameState.activeQuests)),
      currentChapter: gameState.currentChapter,
      studyProgress: gameState.studyProgress,
      pendingPuzzle: gameState.pendingPuzzle,
      studyGateProgress: { ...gameState.studyGateProgress },
      stats: { ...gameState.stats }
    },

    settlements: JSON.parse(JSON.stringify(gameState.settlements)),
    supplyLines: JSON.parse(JSON.stringify(gameState.supplyLines || []))
  };
}

/**
 * Restore game state from a save data object.
 * @param {object} saveData - Parsed save data (v2 format).
 */
export function deserializeState(saveData) {
  if (!saveData || saveData.version !== 2) {
    console.error('Invalid or incompatible save data (expected version 2).');
    return false;
  }

  const g = saveData.global;
  const s = saveData.currentSettlement;

  // Global
  gameState.knowledge = g.knowledge ?? 0;
  gameState.maxKnowledge = g.maxKnowledge ?? 0;
  gameState.unlockedBlueprints = g.unlockedBlueprints ?? [];
  gameState.currency = g.currency ?? 0;
  gameState.achievements = g.achievements ?? [];
  gameState.completedQuests = g.completedQuests ?? [];
  gameState.totalDaysPlayed = g.totalDaysPlayed ?? 0;
  gameState.toolLevels = g.toolLevels ?? { cutting: 0, chopping: 0, mining: 0, construction: 0, farming: 0, fishing: 0, hunting: 0 };
  gameState.difficulty = g.difficulty ?? 'normal';
  gameState.settings = g.settings ?? { daySpeed: 30 };
  gameState.factions = g.factions ?? [];

  // Tools (global, portable)
  if (g.tools) {
    for (const chainId of Object.keys(gameState.tools)) {
      if (g.tools[chainId]) {
        gameState.tools[chainId] = { ...g.tools[chainId] };
      }
    }
  }

  // Current settlement
  gameState.settlementId = s.id ?? 'settlement_1';
  gameState.settlementName = s.name ?? 'Camp';
  gameState.biome = s.biome ?? 'forest';
  gameState.day = s.day ?? 1;
  gameState.time = s.time ?? 0;
  gameState.currentSeason = s.currentSeason ?? 'spring';
  gameState.currentWeather = s.currentWeather ?? 'clear';
  gameState.population = s.population ?? 1;
  gameState.availableWorkers = s.availableWorkers ?? 1;
  gameState.populationMembers = s.populationMembers ?? [];

  // Resources
  if (s.resources) {
    for (const key of Object.keys(gameState.resources)) {
      gameState.resources[key] = s.resources[key] ?? 0;
    }
  }
  gameState.unlockedResources = s.unlockedResources ?? ['sticks', 'food', 'water'];

  // Buildings
  if (s.buildings) {
    for (const chainId of Object.keys(gameState.buildings)) {
      if (s.buildings[chainId]) {
        gameState.buildings[chainId] = { ...s.buildings[chainId] };
      }
    }
  }

  // Multiple buildings
  if (s.multipleBuildings) {
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      gameState.multipleBuildings[chainId] = s.multipleBuildings[chainId] ?? [];
    }
  }

  // Automation, crafting, exploration, events
  gameState.automationAssignments = s.automationAssignments ?? {};
  gameState.craftingQueue = s.craftingQueue ?? [];
  gameState.explorations = s.explorations ?? [];
  gameState.discoveredLocations = s.discoveredLocations ?? [];
  gameState.discoveredSettlementSites = s.discoveredSettlementSites ?? [];
  gameState.activeEvents = s.activeEvents ?? [];
  gameState.seenMilestones = s.seenMilestones ?? [];
  gameState.gatheringModifiers = s.gatheringModifiers ?? [];
  gameState.gatheringEfficiency = s.gatheringEfficiency ?? 1.0;
  gameState.traderVisits = s.traderVisits ?? [];
  gameState.activeTrades = s.activeTrades ?? [];
  gameState.activeQuests = s.activeQuests ?? [];

  // Study
  gameState.currentChapter = s.currentChapter ?? 1;
  gameState.studyProgress = s.studyProgress ?? 0;
  gameState.pendingPuzzle = s.pendingPuzzle ?? null;
  gameState.studyGateProgress = s.studyGateProgress ?? {};

  // Stats
  gameState.stats = s.stats ?? {
    totalGathered: 0, totalCrafted: 0, totalExplored: 0,
    totalTraded: 0, totalStudied: 0, totalDaysInSettlement: 0
  };

  // Settlement network
  gameState.settlements = saveData.settlements ?? [];
  gameState.supplyLines = saveData.supplyLines ?? [];

  // Flags
  gameState.isGameOver = false;
  gameState.gameStarted = true;

  // Reconcile instance counter from loaded data
  let maxInst = 0;
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    for (const inst of gameState.multipleBuildings[chainId]) {
      const match = inst.id?.match(/^inst_(\d+)_/);
      if (match) {
        maxInst = Math.max(maxInst, parseInt(match[1], 10));
      }
    }
  }
  instanceCounter = maxInst;

  return true;
}


// ─── Reset Helper ─────────────────────────────────────────────────────────────

/**
 * Reset the current settlement state while preserving global progress.
 * Used when moving to a new settlement.
 */
export function resetSettlementState() {
  gameState.settlementId = `settlement_${Date.now()}`;
  gameState.settlementName = 'New Camp';
  gameState.day = 1;
  gameState.time = 0;
  gameState.currentSeason = 'spring';
  gameState.currentWeather = 'clear';

  // Reset resources to starting values
  for (const key of Object.keys(gameState.resources)) {
    gameState.resources[key] = 0;
  }
  gameState.resources.food = 50;
  gameState.resources.water = 50;

  gameState.population = 1;
  gameState.availableWorkers = 1;
  gameState.populationMembers = [];

  // Reset SINGLE buildings (not tools — those are portable)
  for (const chainId of Object.keys(gameState.buildings)) {
    gameState.buildings[chainId] = { level: 0, itemId: null };
  }

  // Reset MULTIPLE buildings
  for (const chainId of Object.keys(gameState.multipleBuildings)) {
    gameState.multipleBuildings[chainId] = [];
  }

  gameState.automationAssignments = {};
  gameState.craftingQueue = [];
  gameState.explorations = [];
  gameState.discoveredLocations = [];
  gameState.discoveredSettlementSites = [];
  gameState.activeEvents = [];
  gameState.seenMilestones = [];
  gameState.gatheringModifiers = [];
  gameState.gatheringEfficiency = 1.0;
  gameState.traderVisits = [];
  gameState.activeTrades = [];
  gameState.activeQuests = [];
  gameState.currentChapter = 1;
  gameState.studyProgress = 0;
  gameState.pendingPuzzle = null;
  gameState.studyGateProgress = {};
  gameState.stats = {
    totalGathered: 0, totalCrafted: 0, totalExplored: 0,
    totalTraded: 0, totalStudied: 0, totalDaysInSettlement: 0
  };
}
