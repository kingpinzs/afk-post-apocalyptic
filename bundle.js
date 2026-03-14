(() => {
  // gameState.js
  var gameConfig;
  var instanceCounter = 0;
  var gameState = {
    // ═══════════════════════════════════════════════════════════════════════════
    // GLOBAL (persists across settlements)
    // ═══════════════════════════════════════════════════════════════════════════
    knowledge: 0,
    maxKnowledge: 0,
    unlockedBlueprints: [],
    // item IDs learned from studying the Book
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
    // Lore collection (global, persists across settlements)
    collectedLore: [],
    // [{ id, chronologicalOrder, text, source }]
    seenLoreEvents: [],
    // event IDs already shown (prevents repeats)
    difficulty: "normal",
    settings: {
      daySpeed: 600
      // seconds per game day (must match DAY_LENGTH for clock sync)
    },
    // Tab notification badges (new things count per tab, capped at 99)
    tabNotifications: {},
    // { book: 2, crafting: 1, ... }
    // Study pause flag — when true, events are deferred until study completes
    isStudying: false,
    _pendingEventCheck: false,
    // ═══════════════════════════════════════════════════════════════════════════
    // CURRENT SETTLEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    settlementId: "settlement_1",
    settlementName: "Camp",
    biome: "forest",
    day: 1,
    time: 0,
    currentSeason: "spring",
    currentWeather: "clear",
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
    unlockedResources: ["sticks", "food", "water"],
    population: 1,
    availableWorkers: 1,
    populationMembers: [],
    // [{ id, name, skills, health, happiness, sick, assignment }]
    // ── Buildings — SINGLE chains (one instance, upgrade in place) ──────────
    // key = chain ID, value = { level: 0, itemId: null }
    // level 0 = not built
    buildings: {
      // Core infrastructure
      workbench: { level: 0, itemId: null },
      energy: { level: 0, itemId: null },
      medical: { level: 0, itemId: null },
      trade: { level: 0, itemId: null },
      economy: { level: 0, itemId: null },
      knowledge: { level: 0, itemId: null },
      culture: { level: 0, itemId: null },
      infrastructure: { level: 0, itemId: null },
      // Processing workstations (SINGLE, upgradeable)
      kiln: { level: 0, itemId: null },
      forge: { level: 0, itemId: null },
      sawmill: { level: 0, itemId: null },
      loom: { level: 0, itemId: null },
      tannery: { level: 0, itemId: null },
      glassworks: { level: 0, itemId: null },
      charcoal_pit: { level: 0, itemId: null },
      herbalist_hut: { level: 0, itemId: null },
      paper_mill: { level: 0, itemId: null }
    },
    // ── Buildings — MULTIPLE chains (many instances allowed) ────────────────
    // key = chain ID, value = array of instances
    // each instance: { id, level, itemId, workersAssigned }
    multipleBuildings: {
      shelter: [],
      food_farming: [],
      food_hunting: [],
      food_fishing: [],
      water: [],
      defense: []
    },
    // ── Tools — SINGLE chains (portable, persist across settlements) ────────
    tools: {
      cutting_tools: { level: 0, itemId: null },
      chopping_tools: { level: 0, itemId: null },
      mining_tools: { level: 0, itemId: null },
      construction_tools: { level: 0, itemId: null },
      farming_tools: { level: 0, itemId: null },
      fishing_tools: { level: 0, itemId: null },
      hunting_tools: { level: 0, itemId: null }
    },
    // Worker assignments for SINGLE production buildings
    automationAssignments: {},
    // { 'kiln': 2, 'forge': 1, ... }
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
    gatheringEfficiency: 1,
    // Trading
    traderVisits: [],
    activeTrades: [],
    // Factions
    factions: [],
    // Quests
    activeQuests: [],
    // Study state
    currentChapter: 1,
    studyBarProgress: 0,
    // progress bar 0-100 for current study animation
    pendingPuzzle: null,
    studyGateProgress: {},
    // track study gate requirements
    itemStudyProgress: {},
    // per-item study tracking: { itemId: { studyCount, totalStudies, flashbackSlots, flashbacksShown } }
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
  async function loadGameConfig() {
    const urls = ["./knowledge_data.json", "knowledge_data.json"];
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        gameConfig = await response.json();
        if (gameConfig.initialState) {
          Object.assign(gameState, gameConfig.initialState);
        }
        gameState.availableWorkers = gameState.population;
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[config] Failed to load from ${url}:`, error.message);
      }
    }
    console.error("[config] Could not load game configuration from any URL:", lastError);
  }
  function getConfig() {
    if (!gameConfig) {
      throw new Error("Game configuration has not been loaded yet.");
    }
    return gameConfig;
  }
  function computeUnlockedResources() {
    const always = ["sticks", "food", "water"];
    const unlocked = new Set(always);
    let config;
    try {
      config = getConfig();
    } catch {
      gameState.unlockedResources = [...unlocked];
      return [];
    }
    if (config.items) {
      const allRaw = new Set(config.resources?.raw || []);
      for (const blueprintId of gameState.unlockedBlueprints) {
        const item = config.items.find((i) => i.id === blueprintId);
        if (!item) continue;
        if (item.revealsResources) {
          item.revealsResources.forEach((r) => unlocked.add(r));
        }
        const reqs = item.requirements || item.cost || {};
        for (const r of Object.keys(reqs)) {
          if (allRaw.has(r)) unlocked.add(r);
        }
      }
    }
    if (config.resourceUnlocks) {
      for (const [resource, rule] of Object.entries(config.resourceUnlocks)) {
        if (rule.type === "always") {
          unlocked.add(resource);
        } else if (rule.type === "blueprint" && gameState.unlockedBlueprints.includes(rule.requires)) {
          unlocked.add(resource);
        } else if (rule.type === "chapter") {
          const currentChapter = (gameState.buildings?.knowledge?.level || 0) + 1;
          if (currentChapter >= (rule.requires || 1)) {
            unlocked.add(resource);
          }
        } else if (rule.type === "building") {
          const building = gameState.buildings[rule.requires];
          if (building && building.level > 0) {
            unlocked.add(resource);
          }
        }
      }
    }
    const prev = gameState.unlockedResources;
    const newList = [...unlocked];
    const newlyUnlocked = newList.filter((r) => !prev.includes(r));
    gameState.unlockedResources = newList;
    return newlyUnlocked;
  }
  function getBuildingLevel(chainId) {
    if (gameState.buildings[chainId]) return gameState.buildings[chainId].level;
    if (gameState.tools[chainId]) return gameState.tools[chainId].level;
    return 0;
  }
  function getTotalHousing() {
    let config;
    try {
      config = getConfig();
    } catch {
      return 0;
    }
    return gameState.multipleBuildings.shelter.reduce((sum, instance) => {
      const item = config.items.find((i) => i.id === instance.itemId);
      return sum + (item?.effect?.housingCapacity || 0);
    }, 0);
  }
  function hasWorkstation(required) {
    if (!required || required === "by_hand") return true;
    const workbenchTiers = {
      "crude_workbench": 1,
      "wooden_workbench": 2,
      "stone_workshop": 3,
      "smithy": 4,
      "factory": 5,
      "advanced_lab": 6
    };
    if (workbenchTiers[required] !== void 0) {
      return gameState.buildings.workbench.level >= workbenchTiers[required];
    }
    if (gameState.buildings[required]) {
      return gameState.buildings[required].level > 0;
    }
    return false;
  }
  function getWorkbenchSpeedMultiplier() {
    const speedByLevel = [1, 1, 1.25, 1.5, 2, 3, 5];
    const level = gameState.buildings.workbench.level;
    return speedByLevel[level] || 1;
  }
  function getResourceCap(resource) {
    let config;
    try {
      config = getConfig();
    } catch {
      return 100;
    }
    const baseCaps = config.resourceCaps || {};
    const base = baseCaps[resource] ?? 100;
    let multiplier = 1;
    let bonus = 0;
    for (const chainId of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[chainId];
      if (building.level === 0 || !building.itemId) continue;
      const item = config.items.find((i) => i.id === building.itemId);
      if (!item?.effect) continue;
      if (item.effect.storageMultiplier) {
        multiplier *= item.effect.storageMultiplier;
      }
      if (item.effect.storageCapacity) {
        bonus += item.effect.storageCapacity;
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      for (const instance of gameState.multipleBuildings[chainId]) {
        if (!instance.itemId) continue;
        const item = config.items.find((i) => i.id === instance.itemId);
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
  function generateInstanceId() {
    return `inst_${++instanceCounter}_${Date.now()}`;
  }
  function isItemBuilt(itemId) {
    for (const chainId of Object.keys(gameState.buildings)) {
      if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      if ((gameState.multipleBuildings[chainId] || []).some((inst) => inst.itemId === itemId)) {
        return true;
      }
    }
    return false;
  }
  function getTotalCraftedCount() {
    let count = 0;
    for (const chainId of Object.keys(gameState.buildings)) {
      if (gameState.buildings[chainId].level > 0) count++;
    }
    for (const chainId of Object.keys(gameState.tools)) {
      if (gameState.tools[chainId].level > 0) count++;
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      count += (gameState.multipleBuildings[chainId] || []).length;
    }
    return count;
  }
  function serializeState() {
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
        factions: JSON.parse(JSON.stringify(gameState.factions)),
        collectedLore: JSON.parse(JSON.stringify(gameState.collectedLore)),
        seenLoreEvents: [...gameState.seenLoreEvents]
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
        studyBarProgress: gameState.studyBarProgress,
        pendingPuzzle: gameState.pendingPuzzle,
        studyGateProgress: { ...gameState.studyGateProgress },
        itemStudyProgress: JSON.parse(JSON.stringify(gameState.itemStudyProgress)),
        stats: { ...gameState.stats }
      },
      settlements: JSON.parse(JSON.stringify(gameState.settlements)),
      supplyLines: JSON.parse(JSON.stringify(gameState.supplyLines || []))
    };
  }
  function deserializeState(saveData) {
    if (!saveData || saveData.version !== 2) {
      console.error("Invalid or incompatible save data (expected version 2).");
      return false;
    }
    const g = saveData.global;
    const s = saveData.currentSettlement;
    gameState.knowledge = g.knowledge ?? 0;
    gameState.maxKnowledge = g.maxKnowledge ?? 0;
    gameState.unlockedBlueprints = g.unlockedBlueprints ?? [];
    gameState.currency = g.currency ?? 0;
    gameState.achievements = g.achievements ?? [];
    gameState.completedQuests = g.completedQuests ?? [];
    gameState.totalDaysPlayed = g.totalDaysPlayed ?? 0;
    gameState.toolLevels = g.toolLevels ?? { cutting: 0, chopping: 0, mining: 0, construction: 0, farming: 0, fishing: 0, hunting: 0 };
    gameState.difficulty = g.difficulty ?? "normal";
    gameState.settings = g.settings ?? { daySpeed: 600 };
    gameState.factions = g.factions ?? [];
    gameState.collectedLore = g.collectedLore ?? [];
    gameState.seenLoreEvents = g.seenLoreEvents ?? [];
    if (g.tools) {
      for (const chainId of Object.keys(gameState.tools)) {
        if (g.tools[chainId]) {
          gameState.tools[chainId] = { ...g.tools[chainId] };
        }
      }
    }
    gameState.settlementId = s.id ?? "settlement_1";
    gameState.settlementName = s.name ?? "Camp";
    gameState.biome = s.biome ?? "forest";
    gameState.day = s.day ?? 1;
    gameState.time = s.time ?? 0;
    gameState.currentSeason = s.currentSeason ?? "spring";
    gameState.currentWeather = s.currentWeather ?? "clear";
    gameState.population = s.population ?? 1;
    gameState.availableWorkers = s.availableWorkers ?? 1;
    gameState.populationMembers = s.populationMembers ?? [];
    if (s.resources) {
      for (const key of Object.keys(gameState.resources)) {
        gameState.resources[key] = s.resources[key] ?? 0;
      }
    }
    gameState.unlockedResources = s.unlockedResources ?? ["sticks", "food", "water"];
    if (s.buildings) {
      for (const chainId of Object.keys(gameState.buildings)) {
        if (s.buildings[chainId]) {
          gameState.buildings[chainId] = { ...s.buildings[chainId] };
        }
      }
    }
    if (s.multipleBuildings) {
      for (const chainId of Object.keys(gameState.multipleBuildings)) {
        gameState.multipleBuildings[chainId] = s.multipleBuildings[chainId] ?? [];
      }
    }
    gameState.automationAssignments = s.automationAssignments ?? {};
    gameState.craftingQueue = s.craftingQueue ?? [];
    gameState.explorations = s.explorations ?? [];
    gameState.discoveredLocations = s.discoveredLocations ?? [];
    gameState.discoveredSettlementSites = s.discoveredSettlementSites ?? [];
    gameState.activeEvents = s.activeEvents ?? [];
    gameState.seenMilestones = s.seenMilestones ?? [];
    gameState.gatheringModifiers = s.gatheringModifiers ?? [];
    gameState.gatheringEfficiency = s.gatheringEfficiency ?? 1;
    gameState.traderVisits = s.traderVisits ?? [];
    gameState.activeTrades = s.activeTrades ?? [];
    gameState.activeQuests = s.activeQuests ?? [];
    gameState.currentChapter = s.currentChapter ?? 1;
    gameState.studyBarProgress = s.studyBarProgress ?? s.studyProgress ?? 0;
    gameState.pendingPuzzle = s.pendingPuzzle ?? null;
    gameState.studyGateProgress = s.studyGateProgress ?? {};
    gameState.itemStudyProgress = s.itemStudyProgress ?? {};
    gameState.stats = s.stats ?? {
      totalGathered: 0,
      totalCrafted: 0,
      totalExplored: 0,
      totalTraded: 0,
      totalStudied: 0,
      totalDaysInSettlement: 0
    };
    gameState.settlements = saveData.settlements ?? [];
    gameState.supplyLines = saveData.supplyLines ?? [];
    gameState.isGameOver = false;
    gameState.gameStarted = true;
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
    gameState.isStudying = false;
    gameState.studyBarProgress = 0;
    return true;
  }
  function notifyTab(tabName, amount) {
    if (!gameState.tabNotifications) gameState.tabNotifications = {};
    const current = gameState.tabNotifications[tabName] || 0;
    gameState.tabNotifications[tabName] = Math.min(99, current + (amount || 1));
  }
  function clearTabNotification(tabName) {
    if (!gameState.tabNotifications) gameState.tabNotifications = {};
    gameState.tabNotifications[tabName] = 0;
  }
  function resetSettlementState() {
    gameState.settlementId = `settlement_${Date.now()}`;
    gameState.settlementName = "New Camp";
    gameState.day = 1;
    gameState.time = 0;
    gameState.currentSeason = "spring";
    gameState.currentWeather = "clear";
    for (const key of Object.keys(gameState.resources)) {
      gameState.resources[key] = 0;
    }
    gameState.resources.food = 50;
    gameState.resources.water = 50;
    gameState.population = 1;
    gameState.availableWorkers = 1;
    gameState.populationMembers = [];
    for (const chainId of Object.keys(gameState.buildings)) {
      gameState.buildings[chainId] = { level: 0, itemId: null };
    }
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
    gameState.gatheringEfficiency = 1;
    gameState.traderVisits = [];
    gameState.activeTrades = [];
    gameState.activeQuests = [];
    gameState.currentChapter = 1;
    gameState.studyBarProgress = 0;
    gameState.pendingPuzzle = null;
    gameState.studyGateProgress = {};
    gameState.itemStudyProgress = {};
    gameState.stats = {
      totalGathered: 0,
      totalCrafted: 0,
      totalExplored: 0,
      totalTraded: 0,
      totalStudied: 0,
      totalDaysInSettlement: 0
    };
  }

  // effects.js
  var _itemMapConfig = null;
  var _itemMap = null;
  function getItemMap() {
    let config;
    try {
      config = getConfig();
    } catch {
      return null;
    }
    if (!config || !config.items) return null;
    if (config !== _itemMapConfig) {
      _itemMap = /* @__PURE__ */ new Map();
      for (const item of config.items) {
        _itemMap.set(item.id, item);
      }
      _itemMapConfig = config;
    }
    return _itemMap;
  }
  function getEffect(effectKey, defaultValue) {
    const isMultiplicative = effectKey.endsWith("Multiplier");
    const base = defaultValue !== void 0 ? defaultValue : isMultiplicative ? 1 : 0;
    const itemMap = getItemMap();
    if (!itemMap) return base;
    let value = base;
    for (const chainId of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[chainId];
      if (building.level === 0 || !building.itemId) continue;
      const item = itemMap.get(building.itemId);
      if (!item?.effect || item.effect[effectKey] === void 0) continue;
      if (isMultiplicative) {
        value *= item.effect[effectKey];
      } else {
        value += item.effect[effectKey];
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      for (const instance of gameState.multipleBuildings[chainId]) {
        if (!instance.itemId) continue;
        const item = itemMap.get(instance.itemId);
        if (!item?.effect || item.effect[effectKey] === void 0) continue;
        if (isMultiplicative) {
          value *= item.effect[effectKey];
        } else {
          value += item.effect[effectKey];
        }
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      const tool = gameState.tools[chainId];
      if (tool.level === 0 || !tool.itemId) continue;
      const item = itemMap.get(tool.itemId);
      if (!item?.effect || item.effect[effectKey] === void 0) continue;
      if (isMultiplicative) {
        value *= item.effect[effectKey];
      } else {
        value += item.effect[effectKey];
      }
    }
    return value;
  }
  function hasEffect(effectKey) {
    const itemMap = getItemMap();
    if (!itemMap) return false;
    for (const chainId of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[chainId];
      if (building.level === 0 || !building.itemId) continue;
      const item = itemMap.get(building.itemId);
      if (item?.effect?.[effectKey] !== void 0) return true;
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      for (const instance of gameState.multipleBuildings[chainId]) {
        if (!instance.itemId) continue;
        const item = itemMap.get(instance.itemId);
        if (item?.effect?.[effectKey] !== void 0) return true;
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      const tool = gameState.tools[chainId];
      if (tool.level === 0 || !tool.itemId) continue;
      const item = itemMap.get(tool.itemId);
      if (item?.effect?.[effectKey] !== void 0) return true;
    }
    return false;
  }
  function getTotalAssignedWorkers() {
    let total = 0;
    for (const count of Object.values(gameState.automationAssignments)) {
      total += count || 0;
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      for (const instance of gameState.multipleBuildings[chainId]) {
        total += instance.workersAssigned || 0;
      }
    }
    return total;
  }

  // crafting.js
  var craftingInProgress = false;
  var craftingInterval = null;
  var CHAIN_TO_STATE_KEY = {
    farming: "food_farming",
    hunting: "food_hunting",
    fishing: "food_fishing"
  };
  function resolveStateKey(chainId) {
    return CHAIN_TO_STATE_KEY[chainId] || chainId;
  }
  function hasResources(requirements) {
    if (!requirements) return true;
    for (const [resource, amount] of Object.entries(requirements)) {
      if ((gameState.resources[resource] || 0) < amount) return false;
    }
    return true;
  }
  function isAlreadyBuilt(item) {
    const config = getConfig();
    const chainConfig = config.chains[item.chain];
    if (!chainConfig) return false;
    if (chainConfig.type !== "SINGLE") return false;
    const stateKey = resolveStateKey(item.chain);
    if (gameState.tools[stateKey]) {
      return gameState.tools[stateKey].level >= item.level;
    }
    if (gameState.buildings[stateKey]) {
      return gameState.buildings[stateKey].level >= item.level;
    }
    return false;
  }
  function hasPreviousLevel(item) {
    if (item.level <= 1) return true;
    const config = getConfig();
    const chainConfig = config.chains[item.chain];
    if (!chainConfig || chainConfig.type !== "SINGLE") return true;
    const stateKey = resolveStateKey(item.chain);
    if (gameState.tools[stateKey]) {
      return gameState.tools[stateKey].level >= item.level - 1;
    }
    if (gameState.buildings[stateKey]) {
      return gameState.buildings[stateKey].level >= item.level - 1;
    }
    return false;
  }
  function startCrafting(itemId, upgradeInstanceId = null) {
    const config = getConfig();
    if (!config || !config.items) return false;
    const item = config.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (!gameState.unlockedBlueprints.includes(item.id)) return false;
    if (!hasWorkstation(item.workstationRequired)) return false;
    if (!hasResources(item.requirements)) return false;
    if (isAlreadyBuilt(item)) return false;
    if (!hasPreviousLevel(item)) return false;
    const chainConfig = config.chains[item.chain];
    if (chainConfig && chainConfig.type === "SINGLE") {
      const alreadyQueued = gameState.craftingQueue.some((q) => q.chain === item.chain);
      if (alreadyQueued) return false;
    }
    const resEfficiency = getEffect("resourceEfficiencyMultiplier", 1);
    for (const [resource, amount] of Object.entries(item.requirements)) {
      const cost = resEfficiency > 1 ? Math.max(1, Math.ceil(amount / resEfficiency)) : amount;
      gameState.resources[resource] -= cost;
    }
    const workbenchSpeed = getWorkbenchSpeedMultiplier();
    const constructionMult = getEffect("constructionSpeedMultiplier", 1);
    const craftingMult = getEffect("craftingEfficiencyMultiplier", 1);
    let speedFactor = workbenchSpeed;
    if (constructionMult > 1) speedFactor *= constructionMult;
    if (craftingMult > 1) speedFactor *= craftingMult;
    const effectiveTime = item.craftingTime / speedFactor;
    const stateKey = resolveStateKey(item.chain);
    const isUpgrade = upgradeInstanceId !== null || chainConfig?.type === "SINGLE" && (gameState.buildings[stateKey]?.level > 0 || gameState.tools[stateKey]?.level > 0);
    gameState.craftingQueue.push({
      itemId: item.id,
      chain: item.chain,
      level: item.level,
      progress: 0,
      duration: effectiveTime,
      isUpgrade,
      targetInstanceId: upgradeInstanceId || null
    });
    if (!craftingInProgress) {
      startProcessingQueue();
    }
    return true;
  }
  function startProcessingQueue() {
    if (craftingInProgress) return;
    if (gameState.craftingQueue.length === 0) return;
    craftingInProgress = true;
    craftingInterval = setInterval(() => {
      if (gameState.isGameOver) {
        clearInterval(craftingInterval);
        craftingInterval = null;
        craftingInProgress = false;
        return;
      }
      if (gameState.craftingQueue.length === 0) {
        clearInterval(craftingInterval);
        craftingInterval = null;
        craftingInProgress = false;
        return;
      }
      const current = gameState.craftingQueue[0];
      current.progress += 100;
      if (current.progress >= current.duration) {
        completeCrafting(current);
        gameState.craftingQueue.shift();
        if (gameState.craftingQueue.length === 0) {
          clearInterval(craftingInterval);
          craftingInterval = null;
          craftingInProgress = false;
        }
      }
    }, 100);
  }
  function completeCrafting(queueItem) {
    const config = getConfig();
    if (!config) return;
    const item = config.items.find((i) => i.id === queueItem.itemId);
    if (!item) return;
    const chainConfig = config.chains[item.chain];
    if (!chainConfig) return;
    const stateKey = resolveStateKey(item.chain);
    if (chainConfig.category === "tools" && gameState.tools[stateKey]) {
      gameState.tools[stateKey].level = item.level;
      gameState.tools[stateKey].itemId = item.id;
      const quality = rollQuality();
      gameState.tools[stateKey].quality = quality;
      const toolTypeMap = {
        cutting_tools: "cutting",
        chopping_tools: "chopping",
        mining_tools: "mining",
        construction_tools: "construction",
        farming_tools: "farming",
        fishing_tools: "fishing",
        hunting_tools: "hunting"
      };
      const toolType = toolTypeMap[stateKey];
      if (toolType && gameState.toolLevels[toolType] !== void 0) {
        gameState.toolLevels[toolType] = item.level;
      }
    } else if (chainConfig.type === "SINGLE" && gameState.buildings[stateKey]) {
      gameState.buildings[stateKey].level = item.level;
      gameState.buildings[stateKey].itemId = item.id;
    } else if (chainConfig.type === "MULTIPLE") {
      if (queueItem.targetInstanceId) {
        const instances = gameState.multipleBuildings[stateKey];
        if (instances) {
          const instance = instances.find((i) => i.id === queueItem.targetInstanceId);
          if (instance) {
            instance.level = item.level;
            instance.itemId = item.id;
          }
        }
      } else {
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
    gameState.stats.totalCrafted = (gameState.stats.totalCrafted || 0) + 1;
    notifyTab("settlement");
  }
  function rollQuality() {
    const constructionBonus = getEffect("qualityBonusMultiplier", 1);
    const roll = Math.random() * 100;
    const masterworkChance = 5 * constructionBonus;
    const superiorChance = 10 * constructionBonus;
    const fineChance = 25 * constructionBonus;
    if (roll < masterworkChance) return "masterwork";
    if (roll < masterworkChance + superiorChance) return "superior";
    if (roll < masterworkChance + superiorChance + fineChance) return "fine";
    return "common";
  }
  function clearCraftingInterval() {
    if (craftingInterval) {
      clearInterval(craftingInterval);
      craftingInterval = null;
    }
    craftingInProgress = false;
  }

  // events.js
  var activeEvents = [];
  function checkForEvents() {
    const config = getConfig();
    const events = config.events || [];
    events.forEach((event) => {
      if (Math.random() < event.probability && !activeEvents.some((e) => e.id === event.id)) {
        triggerEvent(event);
      }
    });
    checkForLoreFlashbacks();
  }
  function checkForLoreFlashbacks() {
    const config = getConfig();
    const loreEvents = config.loreEvents || [];
    if (loreEvents.length === 0) return;
    if (!gameState.seenLoreEvents) gameState.seenLoreEvents = [];
    for (const loreEvent of loreEvents) {
      if (gameState.seenLoreEvents.includes(loreEvent.id)) continue;
      const prob = loreEvent.probability || 0.05;
      if (Math.random() < prob) {
        gameState.seenLoreEvents.push(loreEvent.id);
        if (!gameState.collectedLore) gameState.collectedLore = [];
        if (!gameState.collectedLore.some((l) => l.id === loreEvent.id)) {
          gameState.collectedLore.push({
            id: loreEvent.id,
            chronologicalOrder: loreEvent.chronologicalOrder,
            text: loreEvent.loreText,
            source: "event"
          });
        }
        showFlashback(loreEvent.loreText);
        notifyTab("book");
        return;
      }
    }
  }
  function triggerEvent(event) {
    logEvent(`Event: ${event.name} - ${event.description}`);
    const config = getConfig();
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const severity = preset?.eventSeverity || 1;
    Object.entries(event.effect).forEach(([key, value]) => {
      const scaledValue = typeof value === "number" && value < 0 ? Math.floor(value * severity) : value;
      if (key === "gatheringEfficiency") {
        const scaledGathering = value < 1 ? Math.max(0.1, 1 - (1 - value) * severity) : value;
        gameState.gatheringModifiers.push({ eventId: event.id, value: scaledGathering });
        recalculateGatheringEfficiency();
      } else if (key in gameState.resources) {
        addResource(key, scaledValue);
      }
    });
    if (event.duration) {
      activeEvents.push({ ...event, remainingDuration: event.duration });
    }
    updateDisplay();
  }
  function updateActiveEvents() {
    activeEvents = activeEvents.filter((event) => {
      event.remainingDuration--;
      if (event.remainingDuration <= 0) {
        endEvent(event);
        return false;
      }
      return true;
    });
  }
  function endEvent(event) {
    logEvent(`The effects of "${event.name}" have worn off.`);
    gameState.gatheringModifiers = gameState.gatheringModifiers.filter((m) => m.eventId !== event.id);
    recalculateGatheringEfficiency();
    updateDisplay();
  }
  function recalculateGatheringEfficiency() {
    let efficiency = 1;
    for (const modifier of gameState.gatheringModifiers) {
      efficiency *= modifier.value;
    }
    gameState.gatheringEfficiency = efficiency;
  }
  function resetActiveEvents() {
    activeEvents = [];
  }
  function getActiveEvents() {
    return activeEvents;
  }
  function setActiveEvents(events) {
    activeEvents = events;
  }
  function updateWeather() {
    const config = getConfig();
    const weatherConfig = config.weather;
    if (!weatherConfig) return;
    const totalSeasonLength = weatherConfig.seasonLength;
    const seasonIndex = Math.floor((gameState.day - 1) % (totalSeasonLength * 4) / totalSeasonLength);
    gameState.currentSeason = weatherConfig.seasons[seasonIndex];
    const weights = weatherConfig.seasonWeatherWeights[gameState.currentSeason];
    const roll = Math.random();
    let cumulative = 0;
    for (const [type, weight] of Object.entries(weights)) {
      cumulative += weight;
      if (roll <= cumulative) {
        gameState.currentWeather = type;
        break;
      }
    }
    const effects = weatherConfig.effects[gameState.currentWeather];
    if (effects) {
      if (effects.gatheringEfficiency) {
        gameState.gatheringModifiers = gameState.gatheringModifiers.filter((m) => m.eventId !== "__weather");
        gameState.gatheringModifiers.push({ eventId: "__weather", value: effects.gatheringEfficiency });
        recalculateGatheringEfficiency();
      } else {
        gameState.gatheringModifiers = gameState.gatheringModifiers.filter((m) => m.eventId !== "__weather");
        recalculateGatheringEfficiency();
      }
      let mitigationFactor = 1;
      if (hasEffect("resourceDiscoveryMultiplier")) mitigationFactor *= 0.8;
      if (hasEffect("navigationEfficiencyMultiplier")) mitigationFactor *= 0.85;
      Object.entries(effects).forEach(([key, value]) => {
        if (key === "gatheringEfficiency") return;
        if (key in gameState.resources && typeof value === "number") {
          if (value < 0) {
            addResource(key, Math.ceil(value * mitigationFactor));
          } else {
            addResource(key, value);
          }
        }
      });
    }
  }
  function checkMilestoneEvents() {
    const config = getConfig();
    const milestones = config.milestoneEvents;
    if (!milestones) return;
    for (const milestone of milestones) {
      if (gameState.seenMilestones.includes(milestone.id)) continue;
      let triggered = false;
      switch (milestone.trigger.type) {
        case "population":
          triggered = gameState.population >= milestone.trigger.threshold;
          break;
        case "day":
          triggered = gameState.day >= milestone.trigger.threshold;
          break;
        case "craftedItem":
          triggered = gameState.unlockedBlueprints.includes(milestone.trigger.item) || isBuildingBuilt(milestone.trigger.item);
          break;
        case "knowledge":
          triggered = gameState.knowledge >= milestone.trigger.threshold;
          break;
      }
      if (triggered) {
        gameState.seenMilestones.push(milestone.id);
        showMilestoneEvent(milestone, applyMilestoneChoice);
        return;
      }
    }
  }
  function isBuildingBuilt(itemId) {
    for (const chainId of Object.keys(gameState.buildings)) {
      if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      if ((gameState.multipleBuildings[chainId] || []).some((inst) => inst.itemId === itemId)) {
        return true;
      }
    }
    return false;
  }
  function applyMilestoneChoice(choice) {
    Object.entries(choice.effects).forEach(([key, value]) => {
      if (key === "population") {
        gameState.population = Math.max(1, gameState.population + value);
        if (value > 0) gameState.availableWorkers += value;
        logEvent(`Population changed by ${value > 0 ? "+" : ""}${value}.`);
      } else if (key in gameState.resources) {
        addResource(key, value);
        logEvent(`${key.charAt(0).toUpperCase() + key.slice(1)} changed by ${value > 0 ? "+" : ""}${value}.`);
      }
    });
    updateDisplay();
  }

  // settlements.js
  function initSettlements() {
    if (!gameState.settlements) {
      gameState.settlements = [];
    }
    if (gameState.settlements.length === 0) {
      gameState.settlements.push({
        id: gameState.settlementId || "settlement_1",
        name: gameState.settlementName || "Camp",
        biome: gameState.biome || "forest",
        founded: gameState.day || 1
      });
    }
  }
  function getInfrastructureLevel() {
    return getBuildingLevel("infrastructure");
  }
  function getTradeLevel() {
    return getBuildingLevel("trade");
  }
  function isSettlementUnlocked() {
    return getInfrastructureLevel() >= 3;
  }
  function isSupplyLinesUnlocked() {
    return getInfrastructureLevel() >= 4 && getTradeLevel() >= 2;
  }
  var SETTLEMENT_SNAPSHOT_KEYS = [
    // Resources (nested object)
    "resources",
    // Buildings
    "buildings",
    "multipleBuildings",
    // Population
    "population",
    "availableWorkers",
    "populationMembers",
    // Time
    "day",
    "time",
    // Season / Weather
    "currentSeason",
    "currentWeather",
    // Crafting
    "craftingQueue",
    // Automation
    "automationAssignments",
    // Gathering
    "gatheringEfficiency",
    "gatheringModifiers",
    "unlockedResources",
    // Study
    "currentChapter",
    "studyBarProgress",
    "pendingPuzzle",
    "studyGateProgress",
    "itemStudyProgress",
    // Events
    "activeEvents",
    "seenMilestones",
    // Trading
    "traderVisits",
    "activeTrades",
    // Exploration
    "explorations",
    "discoveredLocations",
    "discoveredSettlementSites",
    // Quests
    "activeQuests",
    // Factions
    "factions",
    // Stats (per-settlement)
    "stats"
  ];
  function snapshotSettlement() {
    const snapshot = {};
    for (const key of SETTLEMENT_SNAPSHOT_KEYS) {
      const val = gameState[key];
      if (val === void 0 || val === null) {
        snapshot[key] = val;
      } else if (typeof val === "object") {
        snapshot[key] = JSON.parse(JSON.stringify(val));
      } else {
        snapshot[key] = val;
      }
    }
    snapshot.settlementId = gameState.settlementId;
    snapshot.settlementName = gameState.settlementName;
    snapshot.biome = gameState.biome;
    return snapshot;
  }
  function restoreSettlement(snapshot) {
    for (const key of SETTLEMENT_SNAPSHOT_KEYS) {
      if (!(key in snapshot)) continue;
      const val = snapshot[key];
      if (val === void 0 || val === null) {
        gameState[key] = val;
      } else if (typeof val === "object") {
        gameState[key] = JSON.parse(JSON.stringify(val));
      } else {
        gameState[key] = val;
      }
    }
    if (snapshot.settlementId) gameState.settlementId = snapshot.settlementId;
    if (snapshot.settlementName) gameState.settlementName = snapshot.settlementName;
    if (snapshot.biome) gameState.biome = snapshot.biome;
  }
  function syncGlobalFromState() {
  }
  function createSettlement(name) {
    if (!isSettlementUnlocked()) {
      logEvent("Cannot found a settlement yet. Build more infrastructure (need level 3).");
      return null;
    }
    if (gameState.settlements.length >= 5) {
      logEvent("Maximum number of settlements reached (5).");
      return null;
    }
    saveCurrentSettlement();
    const id = "settlement_" + Date.now();
    const settlementName = name || "Settlement " + (gameState.settlements.length + 1);
    gameState.settlements.push({
      id,
      name: settlementName,
      biome: "forest",
      founded: gameState.day || 1
    });
    clearActiveIntervals();
    clearCraftingInterval();
    resetGathering();
    resetActiveEvents();
    resetSettlementState();
    gameState.settlementId = id;
    gameState.settlementName = settlementName;
    logEvent(`New settlement "${settlementName}" founded!`);
    return id;
  }
  function saveCurrentSettlement() {
    syncGlobalFromState();
    const snapshot = snapshotSettlement();
    const entry = gameState.settlements.find((s) => s.id === gameState.settlementId);
    if (entry) {
      entry._snapshot = snapshot;
    }
  }
  function switchSettlement(settlementId) {
    if (settlementId === gameState.settlementId) {
      return true;
    }
    const target = gameState.settlements.find((s) => s.id === settlementId);
    if (!target) {
      logEvent("Settlement not found.");
      return false;
    }
    saveCurrentSettlement();
    clearActiveIntervals();
    clearCraftingInterval();
    resetGathering();
    resetActiveEvents();
    if (target._snapshot) {
      restoreSettlement(target._snapshot);
    } else {
      resetSettlementState();
      gameState.settlementId = settlementId;
      gameState.settlementName = target.name;
      gameState.biome = target.biome || "forest";
    }
    logEvent(`Switched to "${target.name}".`);
    return true;
  }
  function getSettlementList() {
    return gameState.settlements.map((s) => {
      const isCurrent = s.id === gameState.settlementId;
      const snap = isCurrent ? null : s._snapshot || {};
      const pop = isCurrent ? gameState.population : snap.population || 1;
      const food = isCurrent ? gameState.resources.food : snap.resources?.food || 0;
      const water = isCurrent ? gameState.resources.water : snap.resources?.water || 0;
      const day = isCurrent ? gameState.day : snap.day || 1;
      let craftedCount;
      if (isCurrent) {
        craftedCount = getTotalCraftedCount();
      } else {
        craftedCount = _snapshotCraftedCount(snap);
      }
      let infraLevel;
      if (isCurrent) {
        infraLevel = getInfrastructureLevel();
      } else {
        infraLevel = _snapshotInfraLevel(snap);
      }
      let tradeLevel;
      if (isCurrent) {
        tradeLevel = getTradeLevel();
      } else {
        tradeLevel = _snapshotTradeLevel(snap);
      }
      return {
        id: s.id,
        name: s.name,
        founded: s.founded,
        biome: s.biome || "forest",
        isCurrent,
        population: pop,
        food: Math.floor(food),
        water: Math.floor(water),
        day,
        craftedCount,
        infraLevel,
        tradeLevel
      };
    });
  }
  function _snapshotInfraLevel(snapshot) {
    return snapshot?.buildings?.infrastructure?.level || 0;
  }
  function _snapshotTradeLevel(snapshot) {
    return snapshot?.buildings?.trade?.level || 0;
  }
  function _snapshotCraftedCount(snapshot) {
    if (!snapshot) return 0;
    let count = 0;
    if (snapshot.buildings) {
      for (const chainId of Object.keys(snapshot.buildings)) {
        if (snapshot.buildings[chainId]?.level > 0) count++;
      }
    }
    if (snapshot.multipleBuildings) {
      for (const chainId of Object.keys(snapshot.multipleBuildings)) {
        count += (snapshot.multipleBuildings[chainId] || []).length;
      }
    }
    return count;
  }
  function getCurrentSettlement() {
    const entry = gameState.settlements.find((s) => s.id === gameState.settlementId);
    return entry || {
      id: gameState.settlementId,
      name: gameState.settlementName || "Camp",
      biome: gameState.biome || "forest",
      founded: 1
    };
  }
  function prepareForSave() {
    saveCurrentSettlement();
  }
  function getTotalPopulation() {
    let total = 0;
    for (const s of gameState.settlements) {
      if (s.id === gameState.settlementId) {
        total += gameState.population || 0;
      } else if (s._snapshot) {
        total += s._snapshot.population || 0;
      }
    }
    return total;
  }
  function getSettlementResource(settlementId, resource) {
    if (settlementId === gameState.settlementId) {
      return gameState.resources[resource] || 0;
    }
    const entry = gameState.settlements.find((s) => s.id === settlementId);
    if (entry && entry._snapshot && entry._snapshot.resources) {
      return entry._snapshot.resources[resource] || 0;
    }
    return 0;
  }
  function modifySettlementResource(settlementId, resource, delta) {
    if (settlementId === gameState.settlementId) {
      gameState.resources[resource] = Math.max(0, (gameState.resources[resource] || 0) + delta);
    } else {
      const entry = gameState.settlements.find((s) => s.id === settlementId);
      if (entry && entry._snapshot) {
        if (!entry._snapshot.resources) entry._snapshot.resources = {};
        entry._snapshot.resources[resource] = Math.max(
          0,
          (entry._snapshot.resources[resource] || 0) + delta
        );
      }
    }
  }

  // network.js
  function initNetwork() {
    if (!gameState.supplyLines) {
      gameState.supplyLines = [];
    }
  }
  var TRANSFERABLE_RESOURCES = [
    "food",
    "water",
    "wood",
    "stone",
    "clay",
    "fiber",
    "ore",
    "herbs",
    "fruit",
    "sticks",
    "sand",
    "boards",
    "metal",
    "glass",
    "leather",
    "cloth",
    "bricks",
    "fuel",
    "medicine",
    "paper",
    "hides"
  ];
  function settlementCanSourceSupplyLine(settlementId) {
    if (settlementId === gameState.settlementId) {
      return isSupplyLinesUnlocked();
    }
    const entry = (gameState.settlements || []).find((s) => s.id === settlementId);
    if (!entry || !entry._snapshot) return false;
    const snap = entry._snapshot;
    const infraLevel = snap.buildings?.infrastructure?.level || 0;
    const tradeLevel = snap.buildings?.trade?.level || 0;
    return infraLevel >= 4 && tradeLevel >= 2;
  }
  function createSupplyLine(fromSettlementId, toSettlementId, resource, amount) {
    initNetwork();
    if (!fromSettlementId || !toSettlementId || fromSettlementId === toSettlementId) {
      logEvent("Supply line must connect two different settlements.");
      return null;
    }
    if (!TRANSFERABLE_RESOURCES.includes(resource)) {
      logEvent(`Cannot create supply line for "${resource}".`);
      return null;
    }
    amount = Math.max(1, Math.floor(amount));
    if (amount <= 0 || isNaN(amount)) {
      logEvent("Supply line amount must be at least 1.");
      return null;
    }
    const settlements = gameState.settlements || [];
    const fromEntry = settlements.find((s) => s.id === fromSettlementId);
    const toEntry = settlements.find((s) => s.id === toSettlementId);
    if (!fromEntry || !toEntry) {
      logEvent("One or both settlements not found.");
      return null;
    }
    if (!settlementCanSourceSupplyLine(fromSettlementId)) {
      logEvent("Source settlement needs Infrastructure level 4+ and Trade level 2+ for supply lines.");
      return null;
    }
    if (fromSettlementId === gameState.settlementId) {
      if (gameState.availableWorkers < 1) {
        logEvent("No available workers in source settlement for the supply line.");
        return null;
      }
    } else {
      const snap = fromEntry._snapshot || {};
      const snapAvailable = snap.availableWorkers || 0;
      if (snapAvailable < 1) {
        logEvent("No available workers in source settlement for the supply line.");
        return null;
      }
    }
    const existing = gameState.supplyLines.filter(
      (sl) => sl.from === fromSettlementId && sl.to === toSettlementId
    );
    if (existing.length >= 3) {
      logEvent("Maximum 3 supply lines between these settlements.");
      return null;
    }
    const id = "sl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    gameState.supplyLines.push({
      id,
      from: fromSettlementId,
      to: toSettlementId,
      resource,
      amount,
      active: true,
      createdDay: gameState.day || 1
    });
    if (fromSettlementId === gameState.settlementId) {
      gameState.availableWorkers = Math.max(0, gameState.availableWorkers - 1);
    } else if (fromEntry._snapshot) {
      fromEntry._snapshot.availableWorkers = Math.max(0, (fromEntry._snapshot.availableWorkers || 0) - 1);
    }
    logEvent(`Supply line created: ${amount} ${resource}/day from "${fromEntry.name}" to "${toEntry.name}".`);
    return id;
  }
  function removeSupplyLine(supplyLineId) {
    initNetwork();
    const idx = gameState.supplyLines.findIndex((sl2) => sl2.id === supplyLineId);
    if (idx === -1) {
      logEvent("Supply line not found.");
      return false;
    }
    const sl = gameState.supplyLines[idx];
    if (sl.from === gameState.settlementId) {
      gameState.availableWorkers = (gameState.availableWorkers || 0) + 1;
    } else {
      const entry = (gameState.settlements || []).find((s) => s.id === sl.from);
      if (entry && entry._snapshot) {
        entry._snapshot.availableWorkers = (entry._snapshot.availableWorkers || 0) + 1;
      }
    }
    const fromEntry = (gameState.settlements || []).find((s) => s.id === sl.from);
    const toEntry = (gameState.settlements || []).find((s) => s.id === sl.to);
    const fromName = fromEntry ? fromEntry.name : sl.from;
    const toName = toEntry ? toEntry.name : sl.to;
    gameState.supplyLines.splice(idx, 1);
    logEvent(`Supply line removed: ${sl.resource} from "${fromName}" to "${toName}".`);
    return true;
  }
  function getSupplyLines() {
    initNetwork();
    return gameState.supplyLines.map((sl) => {
      const fromEntry = (gameState.settlements || []).find((s) => s.id === sl.from);
      const toEntry = (gameState.settlements || []).find((s) => s.id === sl.to);
      return {
        ...sl,
        fromName: fromEntry ? fromEntry.name : sl.from,
        toName: toEntry ? toEntry.name : sl.to
      };
    });
  }
  function processSupplyLines() {
    initNetwork();
    for (const sl of gameState.supplyLines) {
      if (!sl.active) continue;
      const available = getSettlementResource(sl.from, sl.resource);
      const transfer = Math.min(sl.amount, available);
      if (transfer <= 0) continue;
      modifySettlementResource(sl.from, sl.resource, -transfer);
      modifySettlementResource(sl.to, sl.resource, transfer);
      if (sl.from === gameState.settlementId || sl.to === gameState.settlementId) {
        const fromEntry = (gameState.settlements || []).find((s) => s.id === sl.from);
        const toEntry = (gameState.settlements || []).find((s) => s.id === sl.to);
        const fromName = fromEntry ? fromEntry.name : sl.from;
        const toName = toEntry ? toEntry.name : sl.to;
        if (transfer < sl.amount) {
          logEvent(`Supply line: ${transfer}/${sl.amount} ${sl.resource} sent from "${fromName}" to "${toName}" (low stock).`);
        } else {
          logEvent(`Supply line: ${transfer} ${sl.resource} sent from "${fromName}" to "${toName}".`);
        }
      }
    }
  }

  // ui.js
  function _skipIfUnchanged(el, key) {
    if (!el) return true;
    if (el._renderKey === key) return true;
    el._renderKey = key;
    return false;
  }
  function updateTabBadges() {
    const notifs = gameState.tabNotifications || {};
    document.querySelectorAll(".nav-badge[data-badge-tab]").forEach((badge) => {
      const tab = badge.dataset.badgeTab;
      const count = notifs[tab] || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? "99" : String(count);
        badge.classList.add("visible");
      } else {
        badge.classList.remove("visible");
      }
    });
  }
  var EFFECT_LABELS = {
    foodProductionRate: "Food production",
    waterProductionRate: "Water production",
    stoneProductionRate: "Stone production",
    oreProductionRate: "Ore production",
    fruitProductionRate: "Fruit production",
    clayProcessingRate: "Clay processing",
    fiberProcessingRate: "Fiber processing",
    oreProcessingRate: "Ore processing",
    leatherProductionRate: "Leather production",
    medicineProductionRate: "Medicine production",
    clothProductionRate: "Cloth production",
    glassProductionRate: "Glass production",
    flourProductionRate: "Flour production",
    textileProductionRate: "Textile production",
    paperProductionRate: "Paper production",
    tradeGoodsProductionRate: "Trade goods",
    currencyProductionRate: "Currency production",
    energyProductionRate: "Energy production",
    bookProductionRate: "Book production",
    woodGatheringMultiplier: "Wood gathering",
    stoneGatheringMultiplier: "Stone gathering",
    oreGatheringMultiplier: "Ore gathering",
    foodGatheringMultiplier: "Food gathering",
    meatGatheringMultiplier: "Meat gathering",
    fishingEfficiencyMultiplier: "Fishing efficiency",
    fishingSuccessRate: "Fishing success",
    resourceConsumptionMultiplier: "Resource consumption",
    storageCapacityMultiplier: "Storage capacity",
    storageMultiplier: "Storage multiplier",
    storageCapacity: "Storage bonus",
    housingCapacity: "Housing",
    defenseBonus: "Defense",
    moraleBonus: "Morale",
    craftingEfficiencyMultiplier: "Crafting efficiency",
    researchSpeedMultiplier: "Research speed",
    explorationSpeedMultiplier: "Exploration speed",
    tradingEfficiencyMultiplier: "Trading efficiency",
    populationGrowthMultiplier: "Population growth",
    healingRate: "Healing rate",
    entertainmentValue: "Entertainment",
    knowledgePerStudy: "Knowledge per study",
    maxPopulation: "Max population",
    energyCapacity: "Energy capacity"
  };
  var _moreDrawerOpen = false;
  function initTabs() {
    document.querySelectorAll(".nav-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
        closeMoreDrawer();
      });
    });
    document.querySelectorAll(".drawer-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
        closeMoreDrawer();
      });
    });
    const moreBtn = document.getElementById("more-btn");
    if (moreBtn) {
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMoreDrawer();
      });
    }
    document.addEventListener("click", (e) => {
      if (_moreDrawerOpen) {
        const drawer = document.getElementById("more-drawer");
        const moreButton = document.getElementById("more-btn");
        if (drawer && !drawer.contains(e.target) && moreButton && !moreButton.contains(e.target)) {
          closeMoreDrawer();
        }
      }
    });
    document.querySelectorAll(".cat-btn[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        updateCraftingTab();
      });
    });
  }
  function switchTab(tabName) {
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    const panel = document.getElementById("tab-" + tabName);
    if (panel) panel.classList.add("active");
    const btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
    if (btn) btn.classList.add("active");
    clearTabNotification(tabName);
    updateTabBadges();
    if (tabName === "settlement") {
      const worldView = document.getElementById("world-view");
      const campMain = document.getElementById("camp-main-content");
      if (worldView) worldView.style.display = "none";
      if (campMain) campMain.style.display = "";
    }
    const gc = document.getElementById("game-container");
    if (gc) gc.scrollTop = 0;
  }
  function toggleMoreDrawer() {
    const drawer = document.getElementById("more-drawer");
    if (!drawer) return;
    _moreDrawerOpen = !_moreDrawerOpen;
    drawer.classList.toggle("open", _moreDrawerOpen);
  }
  function closeMoreDrawer() {
    const drawer = document.getElementById("more-drawer");
    if (drawer) drawer.classList.remove("open");
    _moreDrawerOpen = false;
  }
  function updateHUD() {
    const dayEl = document.getElementById("day-display");
    if (dayEl) dayEl.textContent = "Day " + gameState.day;
    const seasonEl = document.getElementById("season-display");
    if (seasonEl) {
      const season = gameState.currentSeason || "Spring";
      const seasonEmojis = { spring: "\u{1F331}", summer: "\u2600\uFE0F", autumn: "\u{1F342}", winter: "\u2744\uFE0F" };
      const emoji = seasonEmojis[season] || "";
      seasonEl.textContent = emoji + " " + season.charAt(0).toUpperCase() + season.slice(1);
    }
    const weatherEl = document.getElementById("weather-display");
    if (weatherEl) {
      const weather = gameState.currentWeather || "Clear";
      const weatherEmojis = {
        "Clear": "\u2600\uFE0F",
        "Cloudy": "\u2601\uFE0F",
        "Rain": "\u{1F327}\uFE0F",
        "Storm": "\u26C8\uFE0F",
        "Snow": "\u2744\uFE0F",
        "Fog": "\u{1F32B}\uFE0F",
        "Heatwave": "\u{1F525}",
        "Drought": "\u{1F3DC}\uFE0F",
        "Wind": "\u{1F4A8}"
      };
      const emoji = weatherEmojis[weather] || "";
      weatherEl.textContent = emoji + " " + weather;
    }
    const foodBar = document.getElementById("food-bar");
    const foodDisplay = document.getElementById("food-display");
    const foodCap = getResourceCap("food");
    if (foodBar) {
      foodBar.value = gameState.resources.food;
      foodBar.max = foodCap;
    }
    if (foodDisplay) foodDisplay.textContent = Math.floor(gameState.resources.food) + "/" + foodCap;
    const waterBar = document.getElementById("water-bar");
    const waterDisplay = document.getElementById("water-display");
    const waterCap = getResourceCap("water");
    if (waterBar) {
      waterBar.value = gameState.resources.water;
      waterBar.max = waterCap;
    }
    if (waterDisplay) waterDisplay.textContent = Math.floor(gameState.resources.water) + "/" + waterCap;
    const popEl = document.getElementById("population-display");
    const housing = getTotalHousing();
    if (popEl) popEl.textContent = "Pop: " + gameState.population + "/" + (housing || gameState.population);
    const workersEl = document.getElementById("workers-display");
    if (workersEl) workersEl.textContent = "Workers: " + gameState.availableWorkers;
    const settlementEl = document.getElementById("settlement-display");
    if (settlementEl) settlementEl.textContent = gameState.settlementName + " (" + capitalize(gameState.biome) + ")";
    const knowledgeEl = document.getElementById("knowledge-display");
    if (knowledgeEl) knowledgeEl.textContent = "Knowledge: " + gameState.knowledge;
    const eventsEl = document.getElementById("active-events-indicator");
    if (eventsEl) {
      const count = gameState.activeEvents ? gameState.activeEvents.length : 0;
      eventsEl.textContent = count > 0 ? "Events: " + count : "";
      eventsEl.style.color = count > 0 ? "#f39c12" : "";
    }
  }
  function updateSettlementTab() {
    updateAdvisor();
    updateCampStatus();
    updateBuiltBuildings();
    updateGatheringButtons();
  }
  function getAdvisorTips() {
    let config;
    try {
      config = getConfig();
    } catch {
      return [];
    }
    const tips = [];
    const blueprints = gameState.unlockedBlueprints || [];
    const buildings = gameState.buildings || {};
    const tools = gameState.tools || {};
    const knowledge = gameState.knowledge || 0;
    const food = gameState.resources?.food || 0;
    const water = gameState.resources?.water || 0;
    const pop = gameState.population || 1;
    const hasWorkbench = buildings.workbench && buildings.workbench.level > 0;
    const hasShelter = buildings.shelter && buildings.shelter.level > 0 || gameState.multipleBuildings?.shelter?.length > 0;
    const hasCuttingTools = tools.cutting_tools && tools.cutting_tools.level > 0;
    if (food < 15) tips.push({ cat: "Survival", text: "Food is running low. Gather food before your people starve.", urgent: true });
    if (water < 10) tips.push({ cat: "Survival", text: "Water is dangerously low. Find water immediately.", urgent: true });
    if (blueprints.length === 0) {
      tips.push({ cat: "Next Step", text: "Open the Book and study to learn your first blueprint." });
    } else if (!hasWorkbench) {
      if (blueprints.includes("crude_workbench")) {
        const wb = config.items?.find((i) => i.id === "crude_workbench");
        const cost = wb?.requirements || {};
        const canAfford = Object.entries(cost).every(([r, n]) => (gameState.resources[r] || 0) >= n);
        if (canAfford) {
          tips.push({ cat: "Next Step", text: "You have enough sticks. Build a Crude Workbench to start crafting." });
        } else {
          const need = Object.entries(cost).filter(([r, n]) => (gameState.resources[r] || 0) < n).map(([r, n]) => n - Math.floor(gameState.resources[r] || 0) + " more " + r);
          tips.push({ cat: "Next Step", text: "Gather " + need.join(" and ") + " to build a workbench." });
        }
      } else {
        tips.push({ cat: "Next Step", text: "Study the Book to learn how to build a workbench." });
      }
    } else if (!hasCuttingTools) {
      const hasToolBlueprint = blueprints.some((b) => {
        const it = config.items?.find((i) => i.id === b);
        return it && it.chain === "cutting_tools";
      });
      if (hasToolBlueprint) {
        tips.push({ cat: "Next Step", text: "Craft a cutting tool to unlock new resources like fiber and wood." });
      } else {
        tips.push({ cat: "Next Step", text: "Study to discover how to make cutting tools." });
      }
    } else if (!hasShelter) {
      const hasShelterBlueprint = blueprints.some((b) => {
        const it = config.items?.find((i) => i.id === b);
        return it && it.chain === "shelter";
      });
      if (hasShelterBlueprint) {
        tips.push({ cat: "Next Step", text: "Build a shelter to reduce resource consumption and house more people." });
      } else {
        tips.push({ cat: "Next Step", text: "Study to learn how to build shelter for your settlement." });
      }
    }
    if (hasWorkbench && hasCuttingTools && hasShelter) {
      const unbuiltBlueprints = blueprints.filter((bId) => {
        const item = config.items?.find((i) => i.id === bId);
        if (!item) return false;
        const chain = item.chain;
        const chainConfig = config.chains?.[chain];
        if (!chainConfig) return false;
        if (chainConfig.type === "SINGLE") {
          const stateKey = chain;
          if (buildings[stateKey]?.level >= item.level) return false;
          if (tools[stateKey]?.level >= item.level) return false;
        }
        return true;
      });
      if (unbuiltBlueprints.length > 0) {
        const next = config.items?.find((i) => i.id === unbuiltBlueprints[0]);
        if (next) {
          tips.push({ cat: "Growth", text: "You have blueprints ready to craft. Try building a " + next.name + "." });
        }
      }
      const hasFarm = buildings.farming && buildings.farming.level > 0 || gameState.multipleBuildings?.farming?.length > 0;
      if (pop >= 2 && !hasFarm) {
        tips.push({ cat: "Growth", text: "With " + pop + " mouths to feed, consider building a farm for steady food." });
      }
    }
    const gateProgress = gameState.studyGateProgress || {};
    const gateRemaining = Object.entries(gateProgress).filter(([, v]) => v > 0);
    if (gateRemaining.length > 0) {
      const needs = gateRemaining.map(([r, v]) => '<span style="color:#f1c40f;font-weight:600;">' + v + " " + r.charAt(0).toUpperCase() + r.slice(1) + "</span>").join(" and ");
      tips.push({ cat: "Knowledge", html: true, text: "The Book wants you to put knowledge into practice \u2014 gather " + needs + " before your next study session." });
    }
    const studyable = config.items?.filter(
      (i) => i.chapter <= (gameState.currentChapter || 1) && !blueprints.includes(i.id) && knowledge >= (i.knowledgeRequired || 0)
    );
    if (studyable && studyable.length > 0 && !tips.some((t) => t.cat === "Next Step" && t.text.includes("Study"))) {
      tips.push({ cat: "Knowledge", text: "The Book has more to teach. " + studyable.length + " blueprint" + (studyable.length > 1 ? "s" : "") + " ready to discover." });
    }
    const quests = gameState.activeQuests || [];
    if (quests.length > 0) {
      tips.push({ cat: "Quest", text: quests[0].name + " \u2014 " + (quests[0].description || "") });
    }
    if (tips.length === 0) {
      tips.push({ cat: "Advisor", text: "Your settlement is thriving. Explore, study, and keep expanding." });
    }
    return tips;
  }
  function updateAdvisor() {
    const container = document.getElementById("goal-content");
    if (!container) return;
    const tips = getAdvisorTips();
    const key = tips.map((t) => t.cat + t.text + (t.urgent || "")).join("|");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const header = document.createElement("div");
    header.style.cssText = "font-size:0.65em; color:#e2b714; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px;";
    header.textContent = "Advisor";
    container.appendChild(header);
    const shown = tips.slice(0, 4);
    for (let i = 0; i < shown.length; i++) {
      const tip = shown[i];
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:flex-start; gap:8px; padding:5px 0;" + (i < shown.length - 1 ? " border-bottom:1px solid rgba(255,255,255,0.05);" : "");
      const badge = document.createElement("span");
      badge.style.cssText = "font-size:0.65em; padding:2px 8px; border-radius:3px; white-space:nowrap; margin-top:2px; flex-shrink:0; font-weight:500; background:" + (tip.urgent ? "rgba(231,76,60,0.25); color:#ff6b6b;" : tip.cat === "Next Step" ? "rgba(0,255,255,0.15); color:#33ffdd;" : tip.cat === "Growth" ? "rgba(46,204,113,0.15); color:#5dde9e;" : tip.cat === "Knowledge" ? "rgba(155,89,182,0.2); color:#cc99ff;" : tip.cat === "Quest" ? "rgba(226,183,20,0.2); color:#f0d050;" : "rgba(255,255,255,0.1); color:#a0aab4;");
      badge.textContent = tip.urgent ? "Urgent" : tip.cat;
      row.appendChild(badge);
      const text = document.createElement("span");
      text.style.cssText = "font-size:0.85em; color:" + (tip.urgent ? "#ff6b6b" : "#e0e4e8") + "; line-height:1.4;";
      if (tip.html) {
        text.innerHTML = tip.text;
      } else {
        text.textContent = tip.text;
      }
      row.appendChild(text);
      container.appendChild(row);
    }
  }
  function updateCampStatus() {
    const container = document.getElementById("camp-status-bar");
    if (!container) return;
    const pop = gameState.population || 1;
    const housing = getTotalHousing();
    const workers = gameState.availableWorkers ?? pop;
    const assigned = getTotalAssignedWorkers ? getTotalAssignedWorkers() : 0;
    const blueprintCount = (gameState.unlockedBlueprints || []).length;
    const buildingCount = Object.values(gameState.buildings || {}).filter((b) => b.level > 0).length + Object.values(gameState.multipleBuildings || {}).reduce((sum, arr) => sum + arr.length, 0);
    const toolCount = Object.values(gameState.tools || {}).filter((t) => t.level > 0).length;
    const key = pop + "," + housing + "," + workers + "," + assigned + "," + blueprintCount + "," + buildingCount + "," + toolCount;
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:8px; font-size:0.75em;";
    const items = [
      ["\u{1F465}", "Pop", pop + "/" + Math.max(housing, pop)],
      ["\u{1F477}", "Workers", workers - assigned + " free"],
      ["\u{1F4D0}", "Blueprints", "" + blueprintCount],
      ["\u{1F3D7}", "Buildings", "" + buildingCount],
      ["\u{1F529}", "Tools", "" + toolCount],
      ["\u{1F4DA}", "Knowledge", "" + Math.floor(gameState.knowledge || 0)]
    ];
    for (const [emoji, label, value] of items) {
      const cell = document.createElement("div");
      cell.style.cssText = "text-align:center; padding:6px 4px; background:rgba(0,255,255,0.04); border-radius:4px; border:1px solid rgba(0,255,255,0.08);";
      const valDiv = document.createElement("div");
      valDiv.style.cssText = "color:#00ffff; font-weight:bold; font-size:1.1em;";
      valDiv.textContent = emoji + " " + value;
      cell.appendChild(valDiv);
      const labelDiv = document.createElement("div");
      labelDiv.style.cssText = "color:#7f8c8d; font-size:0.85em; margin-top:2px;";
      labelDiv.textContent = label;
      cell.appendChild(labelDiv);
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  }
  function updateBuiltBuildings() {
    const container = document.getElementById("built-buildings");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      container.textContent = "";
      return;
    }
    const bKey = Object.keys(gameState.buildings).map((k) => k + ":" + (gameState.buildings[k].level || 0) + ":" + (gameState.buildings[k].itemId || "")).join(",");
    const mKey = Object.keys(gameState.multipleBuildings).map((k) => k + ":" + gameState.multipleBuildings[k].length).join(",");
    const tKey = Object.keys(gameState.tools).map((k) => k + ":" + (gameState.tools[k].level || 0)).join(",");
    if (_skipIfUnchanged(container, bKey + "|" + mKey + "|" + tKey)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    let hasBuildings = false;
    for (const chainId of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[chainId];
      if (building.level === 0 || !building.itemId) continue;
      const item = config.items ? config.items.find((i) => i.id === building.itemId) : null;
      if (item) {
        hasBuildings = true;
        const card = document.createElement("div");
        card.className = "building-card";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.name;
        const levelSpan = document.createElement("span");
        levelSpan.style.cssText = "color:#7f8c8d; font-size:0.9em;";
        levelSpan.textContent = "Lv." + building.level;
        card.appendChild(nameSpan);
        card.appendChild(levelSpan);
        container.appendChild(card);
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      const instances = gameState.multipleBuildings[chainId];
      if (instances.length === 0) continue;
      for (const instance of instances) {
        const item = config.items ? config.items.find((i) => i.id === instance.itemId) : null;
        if (item) {
          hasBuildings = true;
          const card = document.createElement("div");
          card.className = "building-card";
          const nameSpan = document.createElement("span");
          nameSpan.textContent = item.name;
          const infoSpan = document.createElement("span");
          infoSpan.style.cssText = "color:#7f8c8d; font-size:0.9em;";
          const workers = instance.workersAssigned || 0;
          infoSpan.textContent = workers > 0 ? workers + " workers" : "";
          card.appendChild(nameSpan);
          card.appendChild(infoSpan);
          container.appendChild(card);
        }
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      const tool = gameState.tools[chainId];
      if (tool.level === 0 || !tool.itemId) continue;
      const item = config.items ? config.items.find((i) => i.id === tool.itemId) : null;
      if (item) {
        hasBuildings = true;
        const card = document.createElement("div");
        card.className = "building-card tool";
        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.name;
        const levelSpan = document.createElement("span");
        levelSpan.style.cssText = "font-size:0.9em;";
        levelSpan.textContent = "Lv." + tool.level;
        card.appendChild(nameSpan);
        card.appendChild(levelSpan);
        container.appendChild(card);
      }
    }
    if (!hasBuildings) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "Nothing built yet. Study the Book to learn blueprints.";
      container.appendChild(p);
    }
  }
  function updateGatheringButtons() {
    const container = document.getElementById("gathering-buttons");
    if (!container) return;
    computeUnlockedResources();
    const resources = gameState.unlockedResources || ["sticks", "food", "water"];
    const existingActions = container.querySelectorAll(".gather-action");
    for (const action of existingActions) {
      if (!resources.includes(action.dataset.resource)) {
        action.remove();
      }
    }
    for (const resource of resources) {
      const current = Math.floor(gameState.resources[resource] || 0);
      const cap = getResourceCap(resource);
      const atCap = current >= cap;
      const noWorkers = gameState.availableWorkers <= 0;
      const info = getGatherInfo(resource);
      const existingBtn = document.getElementById("gather-" + resource);
      if (existingBtn) {
        existingBtn.disabled = atCap || noWorkers;
        const countEl = existingBtn.querySelector(".resource-count");
        if (countEl) countEl.textContent = current + "/" + cap;
        const multEl = existingBtn.querySelector(".gather-btn-mult");
        if (multEl) {
          if (info.speedMult > 1) {
            multEl.textContent = "x" + info.speedMult.toFixed(1);
            multEl.title = info.bonuses.join(", ");
            multEl.style.display = "";
          } else {
            multEl.style.display = "none";
          }
        }
        const amtEl = existingBtn.querySelector(".gather-btn-amount");
        if (amtEl) {
          if (info.amount > 1) {
            amtEl.textContent = "+" + info.amount;
            amtEl.style.display = "";
          } else {
            amtEl.style.display = "none";
          }
        }
        continue;
      }
      const gatherAction = document.createElement("div");
      gatherAction.className = "gather-action";
      gatherAction.dataset.resource = resource;
      const btn = document.createElement("button");
      btn.id = "gather-" + resource;
      btn.className = "gather-btn";
      btn.dataset.resource = resource;
      btn.disabled = atCap || noWorkers;
      const left = document.createElement("span");
      left.className = "gather-btn-left";
      const nameSpan = document.createElement("span");
      nameSpan.className = "gather-btn-name";
      nameSpan.textContent = "Gather " + capitalize(resource);
      left.appendChild(nameSpan);
      const multSpan = document.createElement("span");
      multSpan.className = "gather-btn-mult";
      if (info.speedMult > 1) {
        multSpan.textContent = "x" + info.speedMult.toFixed(1);
        multSpan.title = info.bonuses.join(", ");
      } else {
        multSpan.style.display = "none";
      }
      left.appendChild(multSpan);
      const right = document.createElement("span");
      right.className = "gather-btn-right";
      const amtSpan = document.createElement("span");
      amtSpan.className = "gather-btn-amount";
      if (info.amount > 1) {
        amtSpan.textContent = "+" + info.amount;
      } else {
        amtSpan.style.display = "none";
      }
      right.appendChild(amtSpan);
      const countSpan = document.createElement("span");
      countSpan.className = "resource-count";
      countSpan.textContent = current + "/" + cap;
      right.appendChild(countSpan);
      btn.appendChild(left);
      btn.appendChild(right);
      const barsContainer = document.createElement("div");
      barsContainer.id = resource + "-bars";
      barsContainer.style.cssText = "width:100%;";
      gatherAction.appendChild(btn);
      gatherAction.appendChild(barsContainer);
      container.appendChild(gatherAction);
    }
  }
  function updateBookTab() {
    updateChapterNav();
    updateStudySection();
    updateUnlockedBlueprints();
    updateLoreArchive();
  }
  function updateChapterNav() {
    const container = document.getElementById("book-chapter-nav");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const chapters = config.chapters || [{ id: 1, name: "Basics" }];
    const knowledgeLevel = gameState.buildings.knowledge ? gameState.buildings.knowledge.level : 0;
    const maxChapter = knowledgeLevel + 1;
    const loreArchive = document.getElementById("lore-archive");
    const loreActive = loreArchive && loreArchive.classList.contains("active") ? "1" : "0";
    const key = gameState.currentChapter + "," + knowledgeLevel + "," + loreActive;
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const chapter of chapters) {
      const accessible = chapter.id <= maxChapter;
      const active = chapter.id === gameState.currentChapter;
      const btn = document.createElement("button");
      btn.className = "chapter-btn";
      if (active) btn.classList.add("active");
      if (!accessible) btn.classList.add("locked");
      btn.dataset.chapter = chapter.id;
      btn.disabled = !accessible;
      btn.textContent = "Ch." + chapter.id + ": " + chapter.name;
      if (accessible) {
        btn.addEventListener("click", () => {
          gameState.currentChapter = parseInt(btn.dataset.chapter, 10);
          updateBookTab();
        });
      }
      container.appendChild(btn);
    }
    const memoriesBtn = document.createElement("button");
    memoriesBtn.className = "chapter-btn memories-btn";
    memoriesBtn.textContent = "Memories";
    if (loreArchive && loreArchive.classList.contains("active")) {
      memoriesBtn.classList.add("active");
    }
    memoriesBtn.addEventListener("click", () => {
      const archive = document.getElementById("lore-archive");
      const bookMain = document.getElementById("book-main-content");
      if (archive) {
        const isActive = archive.classList.toggle("active");
        memoriesBtn.classList.toggle("active", isActive);
        if (bookMain) bookMain.style.display = isActive ? "none" : "";
      }
    });
    container.appendChild(memoriesBtn);
  }
  function updateStudySection() {
    const progressBar = document.getElementById("study-progress");
    if (progressBar) progressBar.value = gameState.studyBarProgress || 0;
    const gateInfo = document.getElementById("study-gate-info");
    if (gateInfo) {
      if (gameState.pendingPuzzle) {
        gateInfo.textContent = "Puzzle waiting! Answer to unlock a blueprint.";
        gateInfo.style.color = "#e2b714";
      } else if (gameState.studyGateProgress && Object.values(gameState.studyGateProgress).some((v) => v > 0)) {
        const remaining = Object.entries(gameState.studyGateProgress).filter(([, v]) => v > 0).map(([r, v]) => `${v} ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(", ");
        gateInfo.textContent = `Gather ${remaining} before next study.`;
        gateInfo.style.color = "#f39c12";
      } else {
        const inProgress = Object.entries(gameState.itemStudyProgress || {});
        if (inProgress.length > 0) {
          let config;
          try {
            config = getConfig();
          } catch {
            return;
          }
          const [itemId, tracking] = inProgress[0];
          const item = config.items ? config.items.find((i) => i.id === itemId) : null;
          if (item && tracking.studyCount > 0) {
            gateInfo.textContent = `Studying ${item.name} (${tracking.studyCount}/${tracking.totalStudies})`;
            gateInfo.style.color = "#00ffff";
          } else {
            gateInfo.textContent = "";
          }
        } else {
          gateInfo.textContent = "";
        }
      }
    }
  }
  function updateUnlockedBlueprints() {
    const container = document.getElementById("unlocked-blueprints");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const chapterItems = config.items ? config.items.filter((i) => i.chapter === gameState.currentChapter) : [];
    const key = gameState.currentChapter + "," + gameState.unlockedBlueprints.length + "," + gameState.unlockedBlueprints.join(":");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const heading = document.createElement("h3");
    heading.textContent = "Blueprints";
    container.appendChild(heading);
    if (chapterItems.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No blueprints in this chapter.";
      container.appendChild(p);
    } else {
      for (const item of chapterItems) {
        const unlocked = gameState.unlockedBlueprints.includes(item.id);
        const div = document.createElement("div");
        div.className = "blueprint " + (unlocked ? "unlocked" : "locked");
        div.textContent = (unlocked ? "\u2713 " : "? ") + (unlocked ? item.name : "???");
        container.appendChild(div);
      }
    }
  }
  function showFlashback(text) {
    const popup = document.getElementById("flashback-popup");
    if (!popup) return;
    const textEl = document.getElementById("flashback-text");
    if (textEl) textEl.textContent = text;
    popup.style.display = "flex";
    popup.style.animation = "none";
    popup.offsetHeight;
    popup.style.animation = "";
  }
  var _loreSlideshowIndex = 0;
  function updateLoreArchive() {
    const grid = document.getElementById("lore-grid");
    const counterText = document.getElementById("lore-counter-text");
    if (!grid) return;
    const collected = gameState.collectedLore || [];
    const key = collected.length + "," + collected.map((l) => l.id).join(":");
    if (_skipIfUnchanged(grid, key)) return;
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const loreEvents = config.loreEvents || [];
    const studyLoreItems = (config.items || []).filter(
      (i) => i.hardness >= 3 && i.loreFlashback && i.loreChronologicalOrder !== void 0
    );
    const allSlots = [];
    for (const le of loreEvents) {
      allSlots.push({ id: le.id, order: le.chronologicalOrder, source: "event" });
    }
    for (const item of studyLoreItems) {
      allSlots.push({ id: "study_lore_" + item.id, order: item.loreChronologicalOrder, source: "study" });
    }
    allSlots.sort((a, b) => a.order - b.order);
    const collectedIds = new Set(collected.map((l) => l.id));
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (let i = 0; i < allSlots.length; i++) {
      const slot = allSlots[i];
      const cell = document.createElement("div");
      cell.className = "lore-cell";
      if (collectedIds.has(slot.id)) {
        cell.classList.add("collected");
        cell.textContent = i + 1;
        cell.title = "Click to read";
        cell.dataset.loreId = slot.id;
        cell.addEventListener("click", () => {
          const lore = collected.find((l) => l.id === slot.id);
          if (lore) showFlashback(lore.text);
        });
      } else {
        cell.classList.add("undiscovered");
        cell.textContent = "?";
      }
      grid.appendChild(cell);
    }
    if (counterText) {
      const collectedCount = allSlots.filter((s) => collectedIds.has(s.id)).length;
      counterText.textContent = "Collected: " + collectedCount + " / " + allSlots.length;
    }
    const playBtn = document.getElementById("lore-play-btn");
    if (playBtn) {
      const hasAny = collected.length > 0;
      playBtn.disabled = !hasAny;
      playBtn.style.opacity = hasAny ? "1" : "0.3";
    }
  }
  function startLoreSlideshow() {
    const collected = [...gameState.collectedLore || []];
    if (collected.length === 0) return;
    collected.sort((a, b) => a.chronologicalOrder - b.chronologicalOrder);
    _loreSlideshowIndex = 0;
    const slideshow = document.getElementById("lore-slideshow");
    if (slideshow) {
      slideshow.classList.add("active");
      _renderLoreSlide(collected);
    }
  }
  function navigateLoreSlideshow(delta) {
    const collected = [...gameState.collectedLore || []];
    collected.sort((a, b) => a.chronologicalOrder - b.chronologicalOrder);
    _loreSlideshowIndex = Math.max(0, Math.min(collected.length - 1, _loreSlideshowIndex + delta));
    _renderLoreSlide(collected);
  }
  function closeLoreSlideshow() {
    const slideshow = document.getElementById("lore-slideshow");
    if (slideshow) slideshow.classList.remove("active");
  }
  function _renderLoreSlide(collected) {
    const textEl = document.getElementById("lore-slideshow-text");
    const counterEl = document.getElementById("lore-slide-counter");
    if (textEl && collected[_loreSlideshowIndex]) {
      textEl.textContent = collected[_loreSlideshowIndex].text;
    }
    if (counterEl) {
      counterEl.textContent = _loreSlideshowIndex + 1 + " / " + collected.length;
    }
  }
  function updateCraftingTab() {
    const container = document.getElementById("crafting-items");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      container.textContent = "Loading...";
      return;
    }
    document.querySelectorAll(".cat-btn[data-category]").forEach((btn) => {
      const cat = btn.dataset.category;
      const count = config.items ? config.items.filter((i) => gameState.unlockedBlueprints.includes(i.id) && matchCategory(i, cat) && !isAlreadyBuilt(i)).length : 0;
      const label = btn.dataset.label || btn.textContent.replace(/\s*\(\d+\)$/, "");
      btn.dataset.label = label;
      btn.textContent = count > 0 ? `${label} (${count})` : label;
    });
    const activeBtn = document.querySelector(".cat-btn.active");
    const category = activeBtn ? activeBtn.dataset.category : "tools";
    const items = config.items ? config.items.filter(
      (i) => gameState.unlockedBlueprints.includes(i.id) && matchCategory(i, category) && !isAlreadyBuilt(i)
    ) : [];
    const resKey = items.map((i) => {
      const cost = i.requirements || i.cost || {};
      return i.id + ":" + Object.keys(cost).map((r) => Math.floor(gameState.resources[r] || 0)).join("/");
    }).join(",");
    const key = category + "|" + gameState.unlockedBlueprints.length + "|" + resKey;
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No items available in this category. Unlock more blueprints by studying the Book.";
      container.appendChild(p);
      return;
    }
    for (const item of items) {
      const cost = item.requirements || item.cost || {};
      const canAfford = checkCost(cost);
      const effectText = formatEffectsText(item.effect || {});
      const card = document.createElement("div");
      card.className = "craft-card";
      card.style.cssText = "background:rgba(0,255,255,0.05); border:1px solid rgba(0,255,255,0.15); border-radius:6px; padding:10px; margin-bottom:8px;";
      const header = document.createElement("div");
      header.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;";
      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-weight:bold; color:#00ffff; font-size:0.95em;";
      nameEl.textContent = item.name;
      header.appendChild(nameEl);
      const btn = document.createElement("button");
      btn.className = "craft-item-btn";
      btn.dataset.itemId = item.id;
      btn.dataset.itemName = item.name;
      btn.disabled = !canAfford;
      btn.style.cssText = "padding:4px 12px; font-size:0.8em; white-space:nowrap;";
      btn.textContent = canAfford ? "Craft" : "Need Resources";
      header.appendChild(btn);
      card.appendChild(header);
      if (item.description) {
        const desc = document.createElement("div");
        desc.style.cssText = "font-size:0.8em; color:#7f8c8d; margin-bottom:6px;";
        desc.textContent = item.description;
        card.appendChild(desc);
      }
      const costEntries = Object.entries(cost).filter(function(e) {
        return e[1] > 0;
      });
      if (costEntries.length > 0) {
        const costList = document.createElement("div");
        costList.style.cssText = "display:flex; flex-wrap:wrap; gap:4px 10px; margin-bottom:4px;";
        for (const [resource, needed] of costEntries) {
          const have = Math.floor(gameState.resources[resource] || 0);
          const enough = have >= needed;
          const tag = document.createElement("span");
          tag.style.cssText = "font-size:0.8em; padding:2px 6px; border-radius:3px; background:" + (enough ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)") + "; color:" + (enough ? "#2ecc71" : "#e74c3c") + ";";
          tag.textContent = capitalize(resource) + ": " + have + "/" + needed;
          costList.appendChild(tag);
        }
        card.appendChild(costList);
      }
      const effectEntries = Object.entries(item.effect || {}).filter((e) => e[1] !== 0 && e[1] !== null);
      if (effectEntries.length > 0) {
        const effectList = document.createElement("div");
        effectList.style.cssText = "display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:4px;";
        for (const [key2, val] of effectEntries) {
          const label = EFFECT_LABELS[key2] || camelToLabel(key2);
          const isPositive = val > 0;
          const sign = isPositive ? "+" : "";
          const display = key2.includes("Multiplier") ? sign + val + "x" : sign + val;
          const tag = document.createElement("span");
          tag.style.cssText = "font-size:0.78em; padding:2px 7px; border-radius:3px; background:" + (isPositive ? "rgba(226,183,20,0.15)" : "rgba(231,76,60,0.15)") + "; color:" + (isPositive ? "#e2b714" : "#e74c3c") + ";";
          tag.textContent = label + " " + display;
          effectList.appendChild(tag);
        }
        card.appendChild(effectList);
      }
      if (item.craftTime) {
        const timeEl = document.createElement("div");
        timeEl.style.cssText = "font-size:0.75em; color:#7f8c8d; margin-top:2px;";
        timeEl.textContent = "Craft time: " + item.craftTime + "s";
        card.appendChild(timeEl);
      }
      container.appendChild(card);
    }
  }
  function matchCategory(item, category) {
    const type = item.type || item.category || "";
    const chain = item.chain || "";
    switch (category) {
      case "tools":
        return type === "tool" || chain.includes("tool");
      case "buildings":
        return type === "building" || type === "shelter" || type === "defense" || chain.includes("shelter") || chain.includes("food_") || chain.includes("water") || chain.includes("defense");
      case "workstations":
        return type === "workstation" || [
          "kiln",
          "forge",
          "sawmill",
          "loom",
          "tannery",
          "glassworks",
          "charcoal_pit",
          "herbalist_hut",
          "paper_mill"
        ].includes(chain);
      case "workbench":
        return chain === "workbench" || type === "workbench";
      default:
        return true;
    }
  }
  function checkCost(cost) {
    if (!cost || typeof cost !== "object") return true;
    for (const resource of Object.keys(cost)) {
      if ((gameState.resources[resource] || 0) < cost[resource]) return false;
    }
    return true;
  }
  function formatEffectsText(effect) {
    if (!effect || typeof effect !== "object") return "";
    return Object.entries(effect).map(function(entry) {
      const label = EFFECT_LABELS[entry[0]] || entry[0];
      const sign = entry[1] > 0 ? "+" : "";
      return label + ": " + sign + entry[1];
    }).join(", ");
  }
  function updateCraftingQueueDisplay() {
    const container = document.getElementById("queue-display");
    if (!container) return;
    if (!gameState.craftingQueue || gameState.craftingQueue.length === 0) {
      if (container.childElementCount !== 1 || !container.querySelector(".dim")) {
        while (container.firstChild) container.removeChild(container.firstChild);
        const p = document.createElement("p");
        p.className = "dim";
        p.textContent = "Queue empty";
        container.appendChild(p);
      }
      return;
    }
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const structKey = gameState.craftingQueue.map((e) => e.itemId).join(",");
    if (container._queueKey === structKey) {
      const rows = container.querySelectorAll(".queue-item");
      for (let idx = 0; idx < gameState.craftingQueue.length && idx < rows.length; idx++) {
        const entry = gameState.craftingQueue[idx];
        const duration = entry.duration || 1;
        const pct = Math.min(100, (entry.progress || 0) / duration * 100);
        const prog = rows[idx].querySelector("progress");
        if (prog) prog.value = pct;
        const pctSpan = rows[idx].querySelectorAll("span")[1];
        if (pctSpan) pctSpan.textContent = Math.floor(pct) + "%";
      }
      return;
    }
    container._queueKey = structKey;
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const entry of gameState.craftingQueue) {
      const item = config.items ? config.items.find((i) => i.id === entry.itemId) : null;
      const duration = entry.duration || 1;
      const pct = Math.min(100, (entry.progress || 0) / duration * 100);
      const row = document.createElement("div");
      row.className = "queue-item";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = item ? item.name : entry.itemId;
      const prog = document.createElement("progress");
      prog.value = pct;
      prog.max = 100;
      const pctSpan = document.createElement("span");
      pctSpan.textContent = Math.floor(pct) + "%";
      row.appendChild(nameSpan);
      row.appendChild(prog);
      row.appendChild(pctSpan);
      container.appendChild(row);
    }
  }
  function updateProductionTab() {
    updateWorkerSummary();
    updateProductionAssignments();
  }
  function updateWorkerSummary() {
    const container = document.getElementById("worker-summary");
    if (!container) return;
    let assigned;
    try {
      assigned = getTotalAssignedWorkers();
    } catch {
      assigned = 0;
    }
    const total = gameState.population;
    const available = gameState.availableWorkers;
    const key = total + "," + assigned + "," + available;
    if (_skipIfUnchanged(container, key)) return;
    container.textContent = "";
    const totalSpan = document.createElement("span");
    totalSpan.textContent = "Total: " + total;
    const sep1 = document.createTextNode(" | ");
    const assignedSpan = document.createElement("span");
    assignedSpan.textContent = "Assigned: " + assigned;
    const sep2 = document.createTextNode(" | ");
    const availSpan = document.createElement("span");
    availSpan.style.color = available > 0 ? "#2ecc71" : "#e74c3c";
    availSpan.textContent = "Available: " + available;
    container.appendChild(totalSpan);
    container.appendChild(sep1);
    container.appendChild(assignedSpan);
    container.appendChild(sep2);
    container.appendChild(availSpan);
  }
  function updateProductionAssignments() {
    const container = document.getElementById("production-assignments");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const aKey = JSON.stringify(gameState.automationAssignments || {});
    const bLevels = Object.keys(gameState.buildings).map((k) => k + ":" + (gameState.buildings[k].level || 0)).join(",");
    const mWorkers = Object.keys(gameState.multipleBuildings).map(
      (k) => k + ":" + gameState.multipleBuildings[k].map((i) => i.workersAssigned || 0).join("/")
    ).join(",");
    const key = bLevels + "|" + mWorkers + "|" + aKey + "|" + gameState.availableWorkers;
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    let hasAny = false;
    for (const chainId of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[chainId];
      if (building.level === 0 || !building.itemId) continue;
      const item = config.items ? config.items.find((i) => i.id === building.itemId) : null;
      if (!item) continue;
      if (!item.productionRate && !item.produces) continue;
      const workers = gameState.automationAssignments[chainId] || 0;
      hasAny = true;
      const control = document.createElement("div");
      control.className = "automation-control";
      const label = document.createElement("span");
      label.style.fontSize = "0.8em";
      label.textContent = item.name + ": " + workers + " worker" + (workers !== 1 ? "s" : "");
      const btnGroup = document.createElement("div");
      const removeBtn = document.createElement("button");
      removeBtn.className = "assign-worker-btn";
      removeBtn.dataset.chain = chainId;
      removeBtn.dataset.action = "remove";
      removeBtn.disabled = workers <= 0;
      removeBtn.textContent = "-";
      const addBtn = document.createElement("button");
      addBtn.className = "assign-worker-btn";
      addBtn.dataset.chain = chainId;
      addBtn.dataset.action = "add";
      addBtn.disabled = gameState.availableWorkers <= 0;
      addBtn.textContent = "+";
      btnGroup.appendChild(removeBtn);
      btnGroup.appendChild(addBtn);
      control.appendChild(label);
      control.appendChild(btnGroup);
      container.appendChild(control);
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      for (const instance of gameState.multipleBuildings[chainId]) {
        if (!instance.itemId) continue;
        const item = config.items ? config.items.find((i) => i.id === instance.itemId) : null;
        if (!item) continue;
        if (!item.productionRate && !item.produces) continue;
        const workers = instance.workersAssigned || 0;
        hasAny = true;
        const control = document.createElement("div");
        control.className = "automation-control";
        const label = document.createElement("span");
        label.style.fontSize = "0.8em";
        label.textContent = item.name + ": " + workers + " worker" + (workers !== 1 ? "s" : "");
        const btnGroup = document.createElement("div");
        const removeBtn = document.createElement("button");
        removeBtn.className = "assign-worker-btn";
        removeBtn.dataset.instance = instance.id;
        removeBtn.dataset.chain = chainId;
        removeBtn.dataset.action = "remove";
        removeBtn.disabled = workers <= 0;
        removeBtn.textContent = "-";
        const addBtn = document.createElement("button");
        addBtn.className = "assign-worker-btn";
        addBtn.dataset.instance = instance.id;
        addBtn.dataset.chain = chainId;
        addBtn.dataset.action = "add";
        addBtn.disabled = gameState.availableWorkers <= 0;
        addBtn.textContent = "+";
        btnGroup.appendChild(removeBtn);
        btnGroup.appendChild(addBtn);
        control.appendChild(label);
        control.appendChild(btnGroup);
        container.appendChild(control);
      }
    }
    if (!hasAny) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "Build production buildings and assign workers.";
      container.appendChild(p);
    }
  }
  function updateExplorationTab() {
    updateExplorationLocations();
    updateActiveExplorations();
  }
  function updateExplorationLocations() {
    const container = document.getElementById("exploration-locations");
    if (!container) return;
    let config;
    try {
      config = getConfig();
    } catch {
      return;
    }
    const locations = config.explorationLocations || [];
    const key = (gameState.discoveredLocations || []).join(",") + "|" + locations.length;
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (locations.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No exploration locations available yet.";
      container.appendChild(p);
      return;
    }
    for (const loc of locations) {
      const discovered = gameState.discoveredLocations.includes(loc.id);
      const div = document.createElement("div");
      div.className = "exploration-location";
      const strong = document.createElement("strong");
      strong.textContent = loc.name;
      div.appendChild(strong);
      if (loc.description) {
        const desc = document.createElement("p");
        desc.style.cssText = "font-size:0.85em; color:#bdc3c7; margin:4px 0;";
        desc.textContent = loc.description;
        div.appendChild(desc);
      }
      if (discovered) {
        const badge = document.createElement("span");
        badge.style.cssText = "color:#2ecc71; font-size:0.8em;";
        badge.textContent = "Discovered";
        div.appendChild(badge);
      }
      container.appendChild(div);
    }
  }
  function updateActiveExplorations() {
    const container = document.getElementById("active-explorations");
    if (!container) return;
    if (!gameState.explorations || gameState.explorations.length === 0) {
      if (!container.querySelector(".dim")) {
        while (container.firstChild) container.removeChild(container.firstChild);
        const p = document.createElement("p");
        p.className = "dim";
        p.textContent = "No active expeditions.";
        container.appendChild(p);
      }
      return;
    }
    const structKey = gameState.explorations.map((e) => e.locationId).join(",");
    if (container._expKey === structKey) {
      const expeditions = container.querySelectorAll(".active-expedition");
      for (let i = 0; i < gameState.explorations.length && i < expeditions.length; i++) {
        const exp = gameState.explorations[i];
        const pct = exp.duration > 0 ? Math.min(100, (exp.progress || 0) / exp.duration * 100) : 0;
        const prog = expeditions[i].querySelector("progress");
        if (prog) prog.value = pct;
      }
      return;
    }
    container._expKey = structKey;
    while (container.firstChild) container.removeChild(container.firstChild);
    for (const exp of gameState.explorations) {
      const pct = exp.duration > 0 ? Math.min(100, (exp.progress || 0) / exp.duration * 100) : 0;
      const div = document.createElement("div");
      div.className = "active-expedition";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = exp.locationName || exp.locationId;
      div.appendChild(nameSpan);
      const prog = document.createElement("progress");
      prog.value = pct;
      prog.max = 100;
      prog.style.cssText = "width:100%; margin-top:4px;";
      div.appendChild(prog);
      container.appendChild(div);
    }
  }
  function updateWorldTab() {
    updatePopulationSection();
    updateTradingSection();
    updateFactionsSection();
    updateQuestsSection();
    updateAchievementsSection();
    updateStatsSection();
  }
  function logEvent(message, type) {
    if (!type) type = "info";
    const log = document.getElementById("event-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.className = "log-entry log-" + type;
    entry.textContent = "[Day " + gameState.day + "] " + message;
    log.prepend(entry);
    while (log.children.length > 50) {
      log.removeChild(log.lastChild);
    }
  }
  function showAchievementToast(achievement) {
    const toast = document.getElementById("achievement-toast");
    const nameEl = document.getElementById("achievement-toast-name");
    if (!toast || !nameEl) return;
    nameEl.textContent = achievement.name || achievement;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3e3);
  }
  function showMilestoneEvent(event, applyChoiceCallback) {
    const desc = event.description || event.name || "Unknown milestone";
    logEvent("MILESTONE: " + desc, "milestone");
    if (applyChoiceCallback && event.choices && event.choices.length > 0) {
      applyChoiceCallback(event.choices[0]);
    }
  }
  function showGameOver() {
    const popup = document.getElementById("game-over-popup");
    if (popup) popup.style.display = "flex";
  }
  function updateDayNightCycle() {
    const el = document.getElementById("day-night-cycle");
    if (!el) return;
    const daySpeed = gameState.settings?.daySpeed || 600;
    const progress = gameState.time % daySpeed / daySpeed;
    if (progress < 0.2 || progress >= 0.8) {
      const nightDepth = progress < 0.2 ? 1 - progress / 0.2 : (progress - 0.8) / 0.2;
      const alpha = 0.15 + nightDepth * 0.3;
      el.style.background = `radial-gradient(ellipse 120% 80% at 50% 20%, rgba(10,10,40,${(alpha * 0.5).toFixed(3)}), rgba(0,0,20,${alpha.toFixed(3)}))`;
      return;
    }
    const dayProgress = (progress - 0.2) / 0.6;
    const sunX = 90 - dayProgress * 80;
    const arcAngle = dayProgress * Math.PI;
    const sunY = 85 - Math.sin(arcAngle) * 80;
    let tintR, tintG, tintB, tintAlpha;
    let ambientAlpha;
    if (dayProgress < 0.2) {
      const t = dayProgress / 0.2;
      tintR = 255;
      tintG = Math.round(120 + t * 80);
      tintB = Math.round(40 + t * 60);
      tintAlpha = 0.25 - t * 0.12;
      ambientAlpha = 0.1 - t * 0.08;
    } else if (dayProgress > 0.8) {
      const t = (dayProgress - 0.8) / 0.2;
      tintR = 255;
      tintG = Math.round(170 - t * 60);
      tintB = Math.round(70 - t * 40);
      tintAlpha = 0.13 + t * 0.15;
      ambientAlpha = t * 0.1;
    } else {
      const midT = Math.abs(dayProgress - 0.5) / 0.3;
      tintR = 255;
      tintG = 245;
      tintB = 210;
      tintAlpha = 0.06 + (1 - midT) * 0.04;
      ambientAlpha = 0;
    }
    const tint = `rgba(${tintR},${tintG},${tintB},${tintAlpha.toFixed(3)})`;
    const clear = "rgba(0,0,0,0)";
    const ambient = ambientAlpha > 0 ? `rgba(10,10,30,${ambientAlpha.toFixed(3)})` : clear;
    el.style.background = `radial-gradient(ellipse 80% 70% at ${sunX.toFixed(1)}% ${sunY.toFixed(1)}%, ${tint}, ${clear} 70%), linear-gradient(to bottom, ${clear}, ${ambient})`;
  }
  function updateTimeDisplay() {
    const el = document.getElementById("time-display");
    if (!el) return;
    const daySpeed = gameState.settings?.daySpeed || 600;
    const timeInDay = gameState.time % daySpeed;
    const hours = Math.floor(timeInDay / daySpeed * 24);
    const minutes = Math.floor((timeInDay / daySpeed * 24 - hours) * 60);
    el.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }
  function updateTimeEmoji() {
    const el = document.getElementById("time-emoji");
    if (!el) return;
    const daySpeed = gameState.settings?.daySpeed || 600;
    const progress = gameState.time % daySpeed / daySpeed;
    if (progress < 0.25) el.textContent = "\u{1F305}";
    else if (progress < 0.5) el.textContent = "\u2600\uFE0F";
    else if (progress < 0.75) el.textContent = "\u{1F307}";
    else el.textContent = "\u{1F319}";
  }
  function updateGatheringVisibility() {
    updateGatheringButtons();
  }
  function updateTradingSection() {
    const container = document.getElementById("trader-list");
    if (!container) return;
    const traders = gameState.traderVisits || [];
    const key = traders.map((t) => (t.name || "") + ":" + (t.offers ? t.offers.length : 0)).join(",");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!gameState.traderVisits || gameState.traderVisits.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No traders currently visiting.";
      container.appendChild(p);
      return;
    }
    for (const trader of gameState.traderVisits) {
      const card = document.createElement("div");
      card.className = "trade-card";
      const strong = document.createElement("strong");
      strong.textContent = trader.name || "Wandering Trader";
      card.appendChild(strong);
      if (trader.offers) {
        const info = document.createElement("p");
        info.style.cssText = "font-size:0.8em; color:#bdc3c7;";
        info.textContent = trader.offers.length + " items available";
        card.appendChild(info);
      }
      container.appendChild(card);
    }
  }
  function updateExplorationSection() {
    updateExplorationTab();
  }
  function updateQuestsSection() {
    const container = document.getElementById("quest-list");
    if (!container) return;
    const quests = gameState.activeQuests || [];
    const key = quests.map((q) => q.id || q.name || "").join(",");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!gameState.activeQuests || gameState.activeQuests.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No active quests.";
      container.appendChild(p);
      return;
    }
    for (const quest of gameState.activeQuests) {
      const card = document.createElement("div");
      card.className = "quest-card";
      const strong = document.createElement("strong");
      strong.textContent = quest.name || quest.id;
      card.appendChild(strong);
      if (quest.description) {
        const desc = document.createElement("p");
        desc.style.cssText = "font-size:0.8em; color:#bdc3c7; margin:4px 0;";
        desc.textContent = quest.description;
        card.appendChild(desc);
      }
      container.appendChild(card);
    }
  }
  function updateAchievementsSection() {
    const container = document.getElementById("achievement-list");
    if (!container) return;
    const key = (gameState.achievements || []).length.toString();
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!gameState.achievements || gameState.achievements.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No achievements yet.";
      container.appendChild(p);
      return;
    }
    for (const ach of gameState.achievements) {
      const name = typeof ach === "string" ? ach : ach.name || ach.id;
      const card = document.createElement("div");
      card.className = "achievement-card";
      const check = document.createElement("span");
      check.style.color = "#2ecc71";
      check.textContent = "\u2713 ";
      card.appendChild(check);
      const text = document.createTextNode(name);
      card.appendChild(text);
      container.appendChild(card);
    }
  }
  function updatePopulationSection() {
    const container = document.getElementById("population-list");
    if (!container) return;
    const members = gameState.populationMembers || [];
    const key = members.map((m) => (m.name || "") + ":" + Math.round(m.health || 0) + ":" + Math.round(m.happiness || 0) + ":" + (m.sick ? 1 : 0) + ":" + (m.assignment || "")).join(",");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (members.length === 0) {
      const p = document.createElement("p");
      p.style.cssText = "font-size:0.75em; color:#4a5568;";
      p.textContent = "No population members yet.";
      container.appendChild(p);
      return;
    }
    for (const member of members) {
      const card = document.createElement("div");
      card.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:6px 10px; margin-bottom:4px; background:rgba(0,255,255,0.04); border:1px solid rgba(0,255,255,0.12); border-radius:6px; font-size:0.75em; flex-wrap:wrap; gap:4px;";
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "font-weight:700; color:#00ffff; min-width:60px;";
      nameSpan.textContent = member.name || "Survivor";
      if (member.sick) {
        const sickBadge = document.createElement("span");
        sickBadge.style.cssText = "color:#e74c3c; font-size:0.85em; margin-left:6px;";
        sickBadge.textContent = "\u{1FA7A} Sick (" + (member.sickDaysRemaining || "?") + "d)";
        nameSpan.appendChild(sickBadge);
      }
      card.appendChild(nameSpan);
      const statsSpan = document.createElement("span");
      statsSpan.style.cssText = "display:flex; gap:8px; color:#7f8c8d; font-size:0.9em;";
      const healthColor = member.health > 60 ? "#2ecc71" : member.health > 30 ? "#f39c12" : "#e74c3c";
      const healthSpan = document.createElement("span");
      healthSpan.style.color = healthColor;
      healthSpan.textContent = "\u2764\uFE0F " + Math.round(member.health || 0);
      statsSpan.appendChild(healthSpan);
      const happyColor = member.happiness > 60 ? "#2ecc71" : member.happiness > 30 ? "#f39c12" : "#e74c3c";
      const happySpan = document.createElement("span");
      happySpan.style.color = happyColor;
      happySpan.textContent = "\u{1F60A} " + Math.round(member.happiness || 0);
      statsSpan.appendChild(happySpan);
      if (member.assignment) {
        const assignSpan = document.createElement("span");
        assignSpan.style.color = "#3498db";
        assignSpan.textContent = "\u{1F6E0}\uFE0F " + member.assignment;
        statsSpan.appendChild(assignSpan);
      }
      card.appendChild(statsSpan);
      const skills = member.skills || {};
      const topSkill = Object.entries(skills).sort((a, b) => b[1] - a[1])[0];
      if (topSkill) {
        const skillSpan = document.createElement("span");
        skillSpan.style.cssText = "color:#9b59b6; font-size:0.85em; width:100%;";
        const skillList = Object.entries(skills).map(([k, v]) => capitalize(k) + ":" + v).join("  ");
        skillSpan.textContent = skillList;
        card.appendChild(skillSpan);
      }
      container.appendChild(card);
    }
  }
  function updateFactionsSection() {
    const container = document.getElementById("faction-list");
    if (!container) return;
    const factions = gameState.factions || [];
    const key = factions.map((f) => (f.id || "") + ":" + (f.trust || 0)).join(",");
    if (_skipIfUnchanged(container, key)) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!gameState.factions || gameState.factions.length === 0) {
      const p = document.createElement("p");
      p.className = "dim";
      p.textContent = "No factions discovered yet.";
      container.appendChild(p);
      return;
    }
    for (const faction of gameState.factions) {
      const card = document.createElement("div");
      card.className = "faction-card";
      const strong = document.createElement("strong");
      strong.textContent = faction.name || faction.id;
      card.appendChild(strong);
      const trust = document.createElement("span");
      trust.style.cssText = "margin-left:10px; font-size:0.8em; color:#7f8c8d;";
      trust.textContent = "Trust: " + (faction.trust || 0);
      card.appendChild(trust);
      container.appendChild(card);
    }
  }
  function updateStatsSection() {
    const statsGrid = document.getElementById("stats-grid");
    if (!statsGrid) return;
    const s = gameState.stats || {};
    const entries = [
      ["Days Survived", gameState.day],
      ["Population", gameState.population],
      ["Blueprints", gameState.unlockedBlueprints.length],
      ["Knowledge", gameState.knowledge],
      ["Total Gathered", s.totalGathered || 0],
      ["Total Crafted", s.totalCrafted || 0],
      ["Total Explored", s.totalExplored || 0],
      ["Total Traded", s.totalTraded || 0],
      ["Total Studied", s.totalStudied || 0]
    ];
    const key = entries.map((e) => e[1]).join(",");
    if (_skipIfUnchanged(statsGrid, key)) return;
    while (statsGrid.firstChild) statsGrid.removeChild(statsGrid.firstChild);
    for (const pair of entries) {
      const div = document.createElement("div");
      div.style.cssText = "padding:4px 8px; background:rgba(0,255,255,0.04); border:1px solid rgba(0,255,255,0.08); border-radius:4px;";
      const labelDiv = document.createElement("div");
      labelDiv.style.cssText = "color:#7f8c8d; font-size:0.85em;";
      labelDiv.textContent = pair[0];
      const valueDiv = document.createElement("div");
      valueDiv.style.cssText = "color:#00ffff; font-weight:700;";
      valueDiv.textContent = pair[1];
      div.appendChild(labelDiv);
      div.appendChild(valueDiv);
      statsGrid.appendChild(div);
    }
    const score = calculateScore();
    const scoreEl = document.getElementById("score-value");
    if (scoreEl) scoreEl.textContent = score;
    const rankEl = document.getElementById("score-rank");
    if (rankEl) rankEl.textContent = getScoreRank(score);
  }
  function calculateScore() {
    const s = gameState.stats || {};
    return gameState.day * 10 + gameState.population * 50 + gameState.unlockedBlueprints.length * 20 + gameState.knowledge * 5 + (s.totalCrafted || 0) * 3 + (s.totalExplored || 0) * 10 + gameState.achievements.length * 100;
  }
  function getScoreRank(score) {
    if (score >= 1e4) return "Legendary Survivor";
    if (score >= 5e3) return "Master Builder";
    if (score >= 2e3) return "Seasoned Explorer";
    if (score >= 1e3) return "Resourceful Settler";
    if (score >= 500) return "Apprentice Crafter";
    if (score >= 100) return "Newcomer";
    return "Scavenger";
  }
  function getShareableStats() {
    const s = gameState.stats || {};
    const score = calculateScore();
    return [
      "Post-Apocalyptic Survival - Day " + gameState.day,
      "Score: " + score + " (" + getScoreRank(score) + ")",
      "Pop: " + gameState.population + " | Knowledge: " + gameState.knowledge,
      "Blueprints: " + gameState.unlockedBlueprints.length + " | Achievements: " + gameState.achievements.length,
      "Gathered: " + (s.totalGathered || 0) + " | Crafted: " + (s.totalCrafted || 0),
      "Explored: " + (s.totalExplored || 0) + " | Traded: " + (s.totalTraded || 0)
    ].join("\n");
  }
  function updateNetworkTab() {
    const networkMap = document.getElementById("network-map");
    const supplyLinesDiv = document.getElementById("supply-lines");
    if (!networkMap || !supplyLinesDiv) return;
    const settlements = getSettlementList();
    const supplyLines = getSupplyLines();
    const canFoundSettlement = isSettlementUnlocked();
    const canCreateSupplyLine = isSupplyLinesUnlocked();
    const currentSettlement = getCurrentSettlement();
    const sKey = settlements.map((s) => s.id + ":" + s.population + ":" + s.food + ":" + s.water + ":" + s.craftedCount).join(",");
    const slKey = supplyLines.map((sl) => sl.from + "-" + sl.to).join(",");
    const key = sKey + "|" + slKey + "|" + canFoundSettlement + "|" + canCreateSupplyLine;
    if (_skipIfUnchanged(networkMap, key)) return;
    const parts = [];
    parts.push('<div style="width:100%;">');
    parts.push('<div style="margin-bottom:12px; padding:8px; background:rgba(0,255,255,0.05); border:1px solid rgba(0,255,255,0.2); border-radius:6px;">');
    parts.push('<div style="font-size:0.9em; color:#00ffff; margin-bottom:4px;">Current Settlement</div>');
    parts.push(`<div style="font-size:1.1em; font-weight:bold;">${escapeHtml(currentSettlement.name)}</div>`);
    parts.push('<div style="font-size:0.75em; color:#8892b0; margin-top:4px;">');
    parts.push(`Infrastructure: Lv ${getInfrastructureLevel()} | Trade: Lv ${getTradeLevel()} | `);
    parts.push(`Total Pop: ${getTotalPopulation()}</div>`);
    parts.push("</div>");
    parts.push('<div id="settlement-list" style="margin-bottom:12px;">');
    for (const s of settlements) {
      const border = s.isCurrent ? "border-left:3px solid #00ffff;" : "border-left:3px solid #2d3748;";
      parts.push(`<div style="padding:6px 8px; margin-bottom:4px; background:rgba(0,0,0,0.2); border-radius:4px; ${border}">`);
      parts.push('<div style="display:flex; justify-content:space-between; align-items:center;">');
      parts.push("<div>");
      parts.push(`<span style="font-size:0.85em; font-weight:bold;">${escapeHtml(s.name)}</span>`);
      if (s.isCurrent) parts.push(' <span style="font-size:0.7em; color:#00ffff;">(here)</span>');
      parts.push('<div style="font-size:0.7em; color:#8892b0;">');
      parts.push(`Pop: ${s.population} | Food: ${s.food} | Water: ${s.water} | Buildings: ${s.craftedCount} | Day ${s.day}`);
      parts.push("</div></div>");
      if (!s.isCurrent) {
        parts.push(`<button data-action="switch" data-settlement-id="${s.id}" `);
        parts.push('style="padding:4px 8px; font-size:0.7em; background:rgba(0,255,255,0.1); border:1px solid rgba(0,255,255,0.3); color:#00ffff; border-radius:4px; cursor:pointer;">');
        parts.push("Switch</button>");
      }
      parts.push("</div></div>");
    }
    parts.push("</div>");
    parts.push('<div style="padding:8px; background:rgba(0,0,0,0.2); border-radius:6px; margin-bottom:8px;">');
    parts.push(`<div style="font-size:0.8em; margin-bottom:6px; color:${canFoundSettlement ? "#00ffff" : "#4a5568"};">`);
    parts.push(`Found New Settlement ${canFoundSettlement ? "" : "(Infrastructure Lv 3 required)"}`);
    parts.push("</div>");
    parts.push('<div style="display:flex; gap:6px;">');
    parts.push('<input type="text" id="new-settlement-name" placeholder="Settlement name" ');
    parts.push('style="flex:1; padding:4px 6px; font-size:0.75em; background:rgba(0,0,0,0.3); border:1px solid rgba(0,255,255,0.2); color:#ecf0f1; border-radius:4px; font-family:Orbitron,sans-serif;" ');
    parts.push(`${canFoundSettlement ? "" : "disabled"}>`);
    parts.push('<button id="found-settlement-btn" ');
    parts.push(`style="padding:4px 10px; font-size:0.75em; background:${canFoundSettlement ? "rgba(0,255,255,0.15)" : "rgba(0,0,0,0.3)"}; `);
    parts.push(`border:1px solid ${canFoundSettlement ? "rgba(0,255,255,0.4)" : "rgba(0,255,255,0.1)"}; `);
    parts.push(`color:${canFoundSettlement ? "#00ffff" : "#4a5568"}; border-radius:4px; cursor:${canFoundSettlement ? "pointer" : "not-allowed"};" `);
    parts.push(`${canFoundSettlement ? "" : "disabled"}>Found</button>`);
    parts.push("</div></div>");
    parts.push("</div>");
    networkMap.innerHTML = parts.join("");
    const slParts = [];
    if (supplyLines.length > 0) {
      slParts.push('<div style="margin-bottom:10px;">');
      for (const sl of supplyLines) {
        slParts.push('<div style="padding:6px 8px; margin-bottom:4px; background:rgba(0,0,0,0.2); border-radius:4px; display:flex; justify-content:space-between; align-items:center;">');
        slParts.push('<div style="font-size:0.75em;">');
        slParts.push(`<span style="color:#00ffff;">${sl.amount} ${escapeHtml(sl.resource)}/day</span> `);
        slParts.push(`${escapeHtml(sl.fromName)} &rarr; ${escapeHtml(sl.toName)}`);
        slParts.push("</div>");
        slParts.push(`<button data-action="remove-supply-line" data-supply-line-id="${sl.id}" `);
        slParts.push('style="padding:2px 8px; font-size:0.65em; background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.3); color:#ff6b6b; border-radius:4px; cursor:pointer;">');
        slParts.push("Remove</button>");
        slParts.push("</div>");
      }
      slParts.push("</div>");
    } else {
      slParts.push('<div style="font-size:0.75em; color:#4a5568; margin-bottom:10px;">No supply lines established.</div>');
    }
    if (settlements.length >= 2) {
      slParts.push('<div style="padding:8px; background:rgba(0,0,0,0.2); border-radius:6px;">');
      slParts.push(`<div style="font-size:0.8em; margin-bottom:6px; color:${canCreateSupplyLine ? "#00ffff" : "#4a5568"};">`);
      slParts.push(`Create Supply Line ${canCreateSupplyLine ? "" : "(Infrastructure Lv 4 + Trade Lv 2 required)"}`);
      slParts.push("</div>");
      const disabledAttr = canCreateSupplyLine ? "" : "disabled";
      const selectStyle = "padding:4px; font-size:0.7em; background:rgba(0,0,0,0.3); border:1px solid rgba(0,255,255,0.2); color:#ecf0f1; border-radius:4px; font-family:Orbitron,sans-serif;";
      slParts.push('<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">');
      slParts.push(`<select id="sl-from" style="${selectStyle}" ${disabledAttr}>`);
      for (const s of settlements) {
        slParts.push(`<option value="${s.id}"${s.isCurrent ? " selected" : ""}>${escapeHtml(s.name)}</option>`);
      }
      slParts.push("</select>");
      slParts.push('<span style="font-size:0.75em; color:#8892b0;">&rarr;</span>');
      slParts.push(`<select id="sl-to" style="${selectStyle}" ${disabledAttr}>`);
      for (const s of settlements) {
        if (!s.isCurrent) {
          slParts.push(`<option value="${s.id}">${escapeHtml(s.name)}</option>`);
        }
      }
      slParts.push("</select>");
      const resources = ["food", "water", "wood", "stone", "clay", "fiber", "ore", "herbs", "fruit", "sticks"];
      slParts.push(`<select id="sl-resource" style="${selectStyle}" ${disabledAttr}>`);
      for (const r of resources) {
        slParts.push(`<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`);
      }
      slParts.push("</select>");
      slParts.push(`<input type="number" id="sl-amount" value="5" min="1" max="50" style="${selectStyle} width:50px;" ${disabledAttr}>`);
      slParts.push('<button id="create-supply-line-btn" ');
      slParts.push(`style="padding:4px 10px; font-size:0.7em; background:${canCreateSupplyLine ? "rgba(0,255,255,0.15)" : "rgba(0,0,0,0.3)"}; `);
      slParts.push(`border:1px solid ${canCreateSupplyLine ? "rgba(0,255,255,0.4)" : "rgba(0,255,255,0.1)"}; `);
      slParts.push(`color:${canCreateSupplyLine ? "#00ffff" : "#4a5568"}; border-radius:4px; cursor:${canCreateSupplyLine ? "pointer" : "not-allowed"};" `);
      slParts.push(`${disabledAttr}>Create</button>`);
      slParts.push("</div></div>");
    }
    supplyLinesDiv.innerHTML = '<div id="supply-line-list">' + slParts.join("") + "</div>";
  }
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function preRenderAllTabs() {
    updateHUD();
    updateDayNightCycle();
    updateTimeDisplay();
    updateTimeEmoji();
    updateTabBadges();
    updateSettlementTab();
    updateBookTab();
    updateCraftingTab();
    updateProductionTab();
    updateExplorationTab();
    updateWorldTab();
    updateNetworkTab();
    updateCraftingQueueDisplay();
    updateGatheringButtons();
  }
  function updateDisplay() {
    updateHUD();
    updateDayNightCycle();
    updateTabBadges();
    const activeTab = document.querySelector(".tab-panel.active");
    if (!activeTab) return;
    switch (activeTab.id) {
      case "tab-settlement":
        updateSettlementTab();
        if (document.getElementById("world-view")?.style.display !== "none") {
          updateWorldTab();
        }
        break;
      case "tab-book":
        updateBookTab();
        break;
      case "tab-crafting":
        updateCraftingTab();
        break;
      case "tab-production":
        updateProductionTab();
        break;
      case "tab-exploration":
        updateExplorationTab();
        break;
      case "tab-world":
        updateWorldTab();
        break;
      case "tab-network":
        updateNetworkTab();
        break;
    }
    updateCraftingQueueDisplay();
  }
  function initUI() {
    initTabs();
  }
  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function camelToLabel(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Multiplier$|Rate$|Bonus$/, "").trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }

  // audio.js
  var _audioCtx = null;
  var _muted = false;
  function _ctx() {
    return _audioCtx;
  }
  function _scheduleNote(ctx, destination, type, frequency, startTime, duration, peakGain = 0.4, attackTime = 0.01, releaseTime) {
    const release = releaseTime !== void 0 ? releaseTime : duration * 0.4;
    const sustainEnd = startTime + duration - release;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);
    gain.gain.setValueAtTime(peakGain * 0.7, sustainEnd);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
    osc.addEventListener("ended", () => {
      osc.disconnect();
      gain.disconnect();
    });
  }
  function _scheduleNoise(ctx, destination, startTime, duration, peakGain = 0.15) {
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1200, startTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(startTime);
    source.stop(startTime + duration);
    source.addEventListener("ended", () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    });
  }
  function initAudio() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        console.warn("[audio] Web Audio API unavailable:", err.message);
        return;
      }
    }
    if (_audioCtx.state === "suspended") {
      _audioCtx.resume().catch(() => {
      });
    }
  }
  function toggleMute() {
    _muted = !_muted;
    localStorage.setItem("postapoc_muted", _muted);
    return _muted;
  }
  function initMuteState() {
    _muted = localStorage.getItem("postapoc_muted") === "true";
  }
  function isMuted() {
    return _muted;
  }
  function playGather() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    _scheduleNote(ctx, dest, "sine", 440, now, 0.15, 0.25, 5e-3, 0.08);
    _scheduleNote(ctx, dest, "sine", 523, now + 0.1, 0.15, 0.2, 5e-3, 0.06);
  }
  function playCraft() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    _scheduleNote(ctx, dest, "square", 180, now, 0.2, 0.3, 3e-3, 0.12);
    _scheduleNote(ctx, dest, "square", 360, now, 0.2, 0.15, 3e-3, 0.1);
    _scheduleNoise(ctx, dest, now, 0.12, 0.2);
    _scheduleNote(ctx, dest, "square", 180, now + 0.22, 0.2, 0.22, 3e-3, 0.1);
    _scheduleNoise(ctx, dest, now + 0.22, 0.1, 0.14);
  }
  function playUnlock() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    const notes = [261, 329, 392, 523];
    const offsets = [0, 0.12, 0.24, 0.38];
    const durations = [0.22, 0.22, 0.22, 0.38];
    notes.forEach((freq, i) => {
      _scheduleNote(ctx, dest, "sine", freq, now + offsets[i], durations[i], 0.35, 0.01, durations[i] * 0.5);
    });
  }
  function playWrong() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    _scheduleNote(ctx, dest, "square", 466, now, 0.15, 0.2, 5e-3, 0.08);
    _scheduleNote(ctx, dest, "square", 370, now + 0.12, 0.18, 0.18, 5e-3, 0.1);
  }
  function playGameOver() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    const notes = [440, 392, 349, 330];
    const offsets = [0, 0.18, 0.36, 0.54];
    const durations = [0.25, 0.25, 0.25, 0.45];
    notes.forEach((freq, i) => {
      _scheduleNote(ctx, dest, "sawtooth", freq, now + offsets[i], durations[i], 0.18, 0.015, durations[i] * 0.55);
      _scheduleNote(ctx, dest, "sawtooth", freq * 1.005, now + offsets[i], durations[i], 0.08, 0.015, durations[i] * 0.55);
    });
  }
  function playClick() {
    const ctx = _ctx();
    if (!ctx || _muted) return;
    const now = ctx.currentTime;
    const dest = ctx.destination;
    _scheduleNoise(ctx, dest, now, 0.07, 0.12);
    _scheduleNote(ctx, dest, "sine", 120, now, 0.07, 0.1, 2e-3, 0.05);
  }

  // resources.js
  var getResourceCap2 = getResourceCap;
  var activeIntervals = [];
  var activeGathering = {};
  var gatherWorkers = /* @__PURE__ */ new Map();
  function trackInterval(id) {
    activeIntervals.push(id);
  }
  function untrackInterval(id) {
    activeIntervals = activeIntervals.filter((i) => i !== id);
  }
  function clearActiveIntervals() {
    activeIntervals.forEach((id) => clearInterval(id));
    activeIntervals = [];
    gatherWorkers.clear();
    for (const key of Object.keys(activeGathering)) {
      delete activeGathering[key];
    }
  }
  function resetGathering() {
    gatherWorkers.clear();
    for (const key of Object.keys(activeGathering)) {
      delete activeGathering[key];
    }
    let rawResources = [];
    try {
      const config = getConfig();
      rawResources = config.resources?.raw || [];
    } catch {
      return;
    }
    rawResources.forEach((resource) => {
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
  var WORKER_COLORS = [
    "#00ffff",
    "#ff6b35",
    "#39ff14",
    "#ff3cac",
    "#ffe66d",
    "#7b68ee",
    "#ff4757",
    "#2ed573",
    "#1e90ff",
    "#ffa502"
  ];
  var workerColorIndex = 0;
  function getToolMultiplierForResource(resource) {
    switch (resource) {
      case "fiber":
      case "herbs":
        return getEffect("cuttingToolMultiplier", 1);
      case "wood":
        return getEffect("choppingToolMultiplier", 1);
      case "stone":
      case "ore":
      case "clay":
      case "sand":
        return getEffect("miningToolMultiplier", 1);
      case "food":
      case "fruit":
        return getEffect("farmingToolMultiplier", 1);
      default:
        return 1;
    }
  }
  function getGatheringTime(resource) {
    const config = getConfig();
    let baseTime = config.gatheringTimes[resource];
    if (!baseTime) baseTime = 3e3;
    const toolMultiplier = getToolMultiplierForResource(resource);
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const difficultyBonus = preset?.gatheringBonus || 1;
    const gatheringEfficiency = gameState.gatheringEfficiency || 1;
    const toolEff = getEffect("toolEfficiencyMultiplier", 1);
    const productivity = getEffect("productivityMultiplier", 1);
    const effectiveTime = baseTime / (toolMultiplier * difficultyBonus * gatheringEfficiency * toolEff * productivity);
    return Math.max(500, effectiveTime);
  }
  function getGatherInfo(resource) {
    const toolMult = getToolMultiplierForResource(resource);
    const toolEff = getEffect("toolEfficiencyMultiplier", 1);
    const productivity = getEffect("productivityMultiplier", 1);
    const gatheringEfficiency = gameState.gatheringEfficiency || 1;
    const speedMult = toolMult * toolEff * productivity * gatheringEfficiency;
    const amount = Math.max(1, Math.round(toolMult));
    const bonuses = [];
    if (toolMult > 1) bonuses.push("Tool x" + toolMult.toFixed(1));
    if (toolEff > 1) bonuses.push("Forge x" + toolEff.toFixed(1));
    if (productivity > 1) bonuses.push("Productivity x" + productivity.toFixed(1));
    if (gatheringEfficiency > 1) bonuses.push("Event x" + gatheringEfficiency.toFixed(1));
    return { speedMult, amount, bonuses };
  }
  function gatherResource(resource) {
    if (gameState.availableWorkers <= 0) {
      logEvent("No available workers to gather resources.");
      return;
    }
    const cap = getResourceCap2(resource);
    if ((gameState.resources[resource] || 0) >= cap) {
      logEvent(`${resource.charAt(0).toUpperCase() + resource.slice(1)} storage is full.`);
      return;
    }
    const button = document.getElementById(`gather-${resource}`);
    gameState.availableWorkers--;
    gatherWorkers.set(resource, (gatherWorkers.get(resource) || 0) + 1);
    if (button && (gameState.availableWorkers <= 0 || (gameState.resources[resource] || 0) >= cap)) {
      button.disabled = true;
    }
    updateDisplay();
    const color = WORKER_COLORS[workerColorIndex % WORKER_COLORS.length];
    workerColorIndex++;
    const barContainer = document.getElementById(`${resource}-bars`);
    let fill = null;
    if (barContainer) {
      if (!barContainer.dataset.stacked) {
        barContainer.style.cssText += "position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;";
        barContainer.dataset.stacked = "1";
      }
      fill = document.createElement("div");
      fill.style.cssText = `position:absolute;top:0;left:0;height:100%;width:0%;border-radius:4px;background:${color};opacity:0.7;transition:width 0.1s linear;`;
      barContainer.appendChild(fill);
    }
    const tickInterval = 200;
    const duration = getGatheringTime(resource);
    const gatherStartTime = Date.now();
    activeGathering[resource] = { startTime: gatherStartTime, duration };
    const progressInterval = setInterval(() => {
      if (gameState.isGameOver) {
        clearInterval(progressInterval);
        untrackInterval(progressInterval);
        _returnGatherWorker(resource);
        if (fill) fill.remove();
        if (button) button.disabled = true;
        return;
      }
      const elapsed = Date.now() - gatherStartTime;
      const percentage = Math.min(100, elapsed / duration * 100);
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
  function _returnGatherWorker(resource) {
    const count = gatherWorkers.get(resource) || 1;
    if (count <= 1) {
      gatherWorkers.delete(resource);
    } else {
      gatherWorkers.set(resource, count - 1);
    }
  }
  function completeGathering(resource) {
    const toolMult = getToolMultiplierForResource(resource);
    const amount = Math.max(1, Math.round(toolMult));
    addResource(resource, amount);
    logEvent(`Gathered ${amount} ${resource}.`);
    playGather();
    gameState.stats.totalGathered = (gameState.stats.totalGathered || 0) + amount;
    if (gameState.studyGateProgress && Object.keys(gameState.studyGateProgress).length > 0) {
      if (gameState.studyGateProgress[resource] !== void 0) {
        gameState.studyGateProgress[resource] = Math.max(
          0,
          (gameState.studyGateProgress[resource] || 0) - amount
        );
      }
      const allMet = Object.values(gameState.studyGateProgress).every((v) => v <= 0);
      if (allMet) {
        gameState.studyGateProgress = {};
        logEvent("Resources gathered! You can study again.");
      }
    }
    gameState.availableWorkers++;
    const button = document.getElementById(`gather-${resource}`);
    if (button && gameState.availableWorkers > 0 && (gameState.resources[resource] || 0) < getResourceCap2(resource)) {
      button.disabled = false;
    }
    updateDisplay();
  }
  function addResource(resource, amount) {
    const cap = getResourceCap2(resource);
    gameState.resources[resource] = Math.min(
      (gameState.resources[resource] || 0) + amount,
      cap
    );
  }
  function capResources() {
    const config = getConfig();
    const allResources = [
      ...config.resources?.raw || [],
      ...config.resources?.processed || [],
      "hides"
    ];
    allResources.forEach((resource) => {
      const cap = getResourceCap2(resource);
      if ((gameState.resources[resource] || 0) > cap) {
        gameState.resources[resource] = cap;
      }
    });
  }
  function getSeasonConsumptionMultiplier() {
    switch (gameState.currentSeason) {
      case "winter":
        return { foodMult: 1.3, waterMult: 1 };
      case "summer":
        return { foodMult: 0.9, waterMult: 1.1 };
      case "autumn":
        return { foodMult: 1, waterMult: 0.95 };
      case "spring":
      default:
        return { foodMult: 1, waterMult: 1 };
    }
  }
  function consumeResources(meals = 1) {
    const config = getConfig();
    const pop = gameState.population;
    const MEALS_PER_DAY = 3;
    const baseFoodPerPerson = config.constants.BASE_FOOD_PER_PERSON || 2;
    const baseWaterPerPerson = config.constants.BASE_WATER_PER_PERSON || 1.5;
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const consumptionMult = preset?.consumptionMultiplier || 1;
    const shelterMult = getEffect("resourceConsumptionMultiplier", 1);
    const waterEfficiency = getEffect("waterEfficiencyMultiplier", 1);
    const season = getSeasonConsumptionMultiplier();
    const mealFraction = meals / MEALS_PER_DAY;
    const foodConsumed = baseFoodPerPerson * pop * shelterMult * consumptionMult * season.foodMult * mealFraction;
    gameState.resources.food = Math.max(0, (gameState.resources.food || 0) - foodConsumed);
    const waterConsumed = baseWaterPerPerson * pop * shelterMult * (1 / waterEfficiency) * consumptionMult * season.waterMult * mealFraction;
    gameState.resources.water = Math.max(0, (gameState.resources.water || 0) - waterConsumed);
    if (getEffect("fuelConsumptionRate", 0) > 0) {
      const fuelBase = getEffect("fuelConsumptionRate", 0);
      const winterFuelMult = gameState.currentSeason === "winter" ? 1.5 : 1;
      const fuelConsumed = fuelBase * pop * winterFuelMult * consumptionMult * mealFraction;
      gameState.resources.fuel = Math.max(0, (gameState.resources.fuel || 0) - fuelConsumed);
    }
    return { foodConsumed, waterConsumed };
  }
  function checkPopulationGrowth() {
    const config = getConfig();
    const housing = getTotalHousing();
    const immigrationRate = getEffect("immigrationRate", 0);
    if (immigrationRate > 0 && gameState.population < housing && Math.random() < immigrationRate) {
      gameState.population++;
      gameState.availableWorkers++;
      gameState.stats.peakPopulation = Math.max(gameState.stats.peakPopulation || 0, gameState.population);
      logEvent("A new settler has arrived, attracted by your settlement!");
      updateDisplay();
    }
    if (gameState.population >= housing) return;
    const threshold = config.constants.POPULATION_THRESHOLD || 50;
    if ((gameState.resources.food || 0) < threshold) return;
    if ((gameState.resources.water || 0) < threshold) return;
    if (gameState.populationMembers.length > 0) {
      const avgHappiness = gameState.populationMembers.reduce(
        (sum, m) => sum + (m.happiness || 50),
        0
      ) / gameState.populationMembers.length;
      if (avgHappiness < 40) return;
    }
    const healthMult = getEffect("populationHealthMultiplier", 1);
    const effectiveThreshold = healthMult > 1 ? Math.max(10, Math.floor(threshold / healthMult)) : threshold;
    if ((gameState.resources.food || 0) >= effectiveThreshold && (gameState.resources.water || 0) >= effectiveThreshold) {
      const happinessMult = getEffect("populationHappinessMultiplier", 1);
      if (happinessMult > 1) {
        const chance = Math.min(1, happinessMult * 0.5);
        if (Math.random() > chance) return;
      }
      gameState.population++;
      gameState.availableWorkers++;
      gameState.stats.peakPopulation = Math.max(gameState.stats.peakPopulation || 0, gameState.population);
      gameState.resources.food -= effectiveThreshold;
      gameState.resources.water -= effectiveThreshold;
      logEvent("The population has grown! You have a new available worker.");
      updateDisplay();
    }
  }
  function getCurrentChapter() {
    const knowledgeBuildingLevel = gameState.buildings.knowledge?.level || 0;
    return Math.min(knowledgeBuildingLevel + 1, 7);
  }
  function getNextStudyItem() {
    const config = getConfig();
    if (!config.items) return null;
    const maxChapter = getCurrentChapter();
    const studyableItems = config.items.filter((item) => item.chapter <= maxChapter).filter((item) => !gameState.unlockedBlueprints.includes(item.id)).filter((item) => item.knowledgeRequired <= gameState.knowledge + 1).filter((item) => {
      if (item.puzzle && typeof item.puzzle === "object" && item.puzzle.question) return true;
      if (item.puzzle && item.puzzleAnswer) return true;
      return false;
    }).sort((a, b) => a.knowledgeRequired - b.knowledgeRequired);
    return studyableItems[0] || null;
  }
  function hardnessToStudies(hardness) {
    switch (hardness) {
      case 1:
        return 3;
      case 2:
        return 5;
      case 3:
        return 7;
      default:
        return 3;
    }
  }
  function initItemStudyProgress(item) {
    const hardness = item.hardness || 1;
    const totalStudies = hardnessToStudies(hardness);
    const flashbackCount = Math.max(1, Math.floor(totalStudies / 3));
    const slots = [];
    const availableStudies = [];
    for (let i = 1; i < totalStudies; i++) availableStudies.push(i);
    const learningIdx = Math.floor(Math.random() * availableStudies.length);
    const learningStudy = availableStudies.splice(learningIdx, 1)[0];
    slots.push({ study: learningStudy, type: "learning" });
    for (let i = 1; i < flashbackCount && availableStudies.length > 0; i++) {
      const loreIdx = Math.floor(Math.random() * availableStudies.length);
      const loreStudy = availableStudies.splice(loreIdx, 1)[0];
      slots.push({ study: loreStudy, type: "lore" });
    }
    gameState.itemStudyProgress[item.id] = {
      studyCount: 0,
      totalStudies,
      flashbackSlots: slots,
      flashbacksShown: 0
    };
  }
  function isStudyGateMet() {
    if (gameState.knowledge === 0) return true;
    if (!gameState.studyGateProgress || Object.keys(gameState.studyGateProgress).length === 0) {
      return true;
    }
    refreshStudyGate();
    return Object.values(gameState.studyGateProgress).every((v) => v <= 0);
  }
  function refreshStudyGate() {
    if (!gameState.studyGateProgress || Object.keys(gameState.studyGateProgress).length === 0) return;
    const config = getConfig();
    const gateAmount = config.constants.STUDY_GATE_AMOUNT || 5;
    const scaledAmount = gateAmount * (1 + Math.floor(gameState.knowledge / 10));
    for (const resource of Object.keys(gameState.studyGateProgress)) {
      const inStock = gameState.resources[resource] || 0;
      const remaining = scaledAmount - Math.floor(inStock);
      gameState.studyGateProgress[resource] = Math.max(0, remaining);
    }
    if (Object.values(gameState.studyGateProgress).every((v) => v <= 0)) {
      gameState.studyGateProgress = {};
      logEvent("Resources gathered! You can study again.");
    }
  }
  function setStudyGate() {
    const config = getConfig();
    const gateAmount = config.constants.STUDY_GATE_AMOUNT || 5;
    const gateableResources = (gameState.unlockedResources || []).filter((r) => r !== "food" && r !== "water" && r !== "sticks");
    if (gateableResources.length === 0) {
      gameState.studyGateProgress = {};
      return;
    }
    const scaledAmount = gateAmount * (1 + Math.floor(gameState.knowledge / 10));
    const gate = {};
    gateableResources.forEach((r) => {
      const inStock = gameState.resources[r] || 0;
      const remaining = scaledAmount - Math.floor(inStock);
      if (remaining > 0) {
        gate[r] = remaining;
      }
    });
    gameState.studyGateProgress = gate;
    if (Object.keys(gate).length === 0) return;
    const needs = Object.entries(gate).map(([r, v]) => `${v} ${r.charAt(0).toUpperCase() + r.slice(1)}`).join(", ");
    logEvent(`Gather more resources before studying again: ${needs} needed.`);
  }
  function study() {
    const config = getConfig();
    if (gameState.isStudying) return;
    if (gameState.pendingPuzzle) {
      const pending = gameState.pendingPuzzle;
      const item = config.items.find((i) => i.id === pending.id || i.id === pending.itemId);
      if (item && !gameState.unlockedBlueprints.includes(item.id)) {
        showStudyPuzzle(item);
        return;
      }
      gameState.pendingPuzzle = null;
    }
    if (!isStudyGateMet()) {
      const remaining = Object.entries(gameState.studyGateProgress || {}).filter(([, v]) => v > 0).map(([r, v]) => `${v} ${r}`).join(", ");
      logEvent(`Gather more resources before studying again: ${remaining} needed.`);
      return;
    }
    if (gameState.availableWorkers <= 0) {
      logEvent("No available workers to study.");
      return;
    }
    const nextItem = getNextStudyItem();
    if (!nextItem) {
      const maxChapter = getCurrentChapter();
      const nextChapterItem = config.items.find(
        (item) => item.chapter === maxChapter + 1 && !gameState.unlockedBlueprints.includes(item.id)
      );
      if (nextChapterItem) {
        logEvent(`You need a better knowledge building to study Chapter ${maxChapter + 1}.`);
      } else {
        logEvent("Nothing left to study in the accessible chapters.");
      }
      return;
    }
    if (!gameState.itemStudyProgress[nextItem.id]) {
      initItemStudyProgress(nextItem);
    }
    const tracking = gameState.itemStudyProgress[nextItem.id];
    if (nextItem.chapter >= 3) {
      if ((gameState.resources.paper || 0) < 1) {
        logEvent("You need Paper to study advanced chapters.");
        return;
      }
      gameState.resources.paper -= 1;
    }
    gameState.availableWorkers--;
    gameState.isStudying = true;
    updateDisplay();
    const baseTime = config.constants.BASE_STUDY_TIME || 1e4;
    const knowledgeMult = getEffect("knowledgeGenerationMultiplier", 1);
    const researchSpeed = getEffect("researchSpeedMultiplier", 1);
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const studySpeedBonus = preset?.studySpeedBonus || 1;
    const effectiveTime = Math.max(200, baseTime / (knowledgeMult * researchSpeed * studySpeedBonus));
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
      gameState.studyBarProgress = Math.min(100, elapsed / effectiveTime * 100);
      if (elapsed >= effectiveTime) {
        clearInterval(studyInterval);
        untrackInterval(studyInterval);
        gameState.studyBarProgress = 0;
        gameState.availableWorkers++;
        tracking.studyCount++;
        const knowledgeGain = nextItem.knowledgePerStudy || 1;
        gameState.knowledge += knowledgeGain;
        gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
        gameState.stats.totalStudied = (gameState.stats.totalStudied || 0) + 1;
        gameState.currentChapter = getCurrentChapter();
        computeUnlockedResources();
        if (tracking.studyCount < tracking.totalStudies) {
          const flashbackSlot = tracking.flashbackSlots.find((s) => s.study === tracking.studyCount);
          if (flashbackSlot) {
            tracking.flashbacksShown++;
            if (flashbackSlot.type === "learning") {
              const flashbackText = nextItem.flashback || "A fragment of knowledge surfaces in your mind...";
              showFlashback(flashbackText);
            } else if (flashbackSlot.type === "lore") {
              const loreText = nextItem.loreFlashback || "A distant memory flickers through your thoughts...";
              showFlashback(loreText);
              if (nextItem.loreFlashback && nextItem.loreChronologicalOrder !== void 0) {
                const loreId = `study_lore_${nextItem.id}`;
                if (!gameState.collectedLore.some((l) => l.id === loreId)) {
                  gameState.collectedLore.push({
                    id: loreId,
                    chronologicalOrder: nextItem.loreChronologicalOrder,
                    text: nextItem.loreFlashback,
                    source: "study"
                  });
                  notifyTab("book");
                }
              }
            }
          }
          logEvent(`Studied ${nextItem.name}... (${tracking.studyCount}/${tracking.totalStudies})  +${knowledgeGain} knowledge`);
        } else {
          gameState.pendingPuzzle = { id: nextItem.id };
          playUnlock();
          showStudyPuzzle(nextItem);
          logEvent(`Studied ${nextItem.name}... (${tracking.studyCount}/${tracking.totalStudies}) \u2014 Puzzle time!`);
        }
        setStudyGate();
        gameState.isStudying = false;
        updateDisplay();
      }
    }, tickInterval);
    trackInterval(studyInterval);
  }
  function showStudyPuzzle(item) {
    const popup = document.getElementById("puzzle-popup");
    if (!popup) {
      _unlockBlueprint(item);
      return;
    }
    popup.dataset.puzzleType = "study";
    popup.dataset.itemId = item.id;
    const questionEl = document.getElementById("puzzle-question");
    const choicesEl = document.getElementById("puzzle-choices");
    let question, choices;
    if (item.puzzle && typeof item.puzzle === "object" && item.puzzle.question) {
      question = item.puzzle.question;
      const correctPool = item.puzzle.correctAnswers || ["Correct"];
      const correct = correctPool[Math.floor(Math.random() * correctPool.length)];
      const wrongPool = [...item.puzzle.wrongAnswers || ["Wrong A", "Wrong B"]];
      const wrongs = [];
      for (let i = 0; i < 2 && wrongPool.length > 0; i++) {
        const idx = Math.floor(Math.random() * wrongPool.length);
        wrongs.push(wrongPool.splice(idx, 1)[0]);
      }
      choices = [
        { text: correct, isCorrect: true },
        ...wrongs.map((w) => ({ text: w, isCorrect: false }))
      ];
      _shuffleArray(choices);
    } else {
      question = typeof item.puzzle === "string" ? item.puzzle : "What is this?";
      const correctText = item.puzzleAnswer || "Unknown";
      choices = [
        { text: correctText, isCorrect: true },
        { text: "Not this one", isCorrect: false },
        { text: "Nor this one", isCorrect: false }
      ];
      _shuffleArray(choices);
    }
    gameState.pendingPuzzle = {
      id: item.id,
      choices,
      hintsUsed: 0,
      wrongPenalty: typeof item.puzzle === "object" ? item.puzzle.wrongPenalty : null,
      hints: typeof item.puzzle === "object" ? item.puzzle.hints || [] : item.hints || []
    };
    if (questionEl) questionEl.textContent = question;
    if (choicesEl) {
      const buttons = choicesEl.querySelectorAll(".puzzle-choice");
      choices.forEach((choice, i) => {
        if (buttons[i]) {
          buttons[i].textContent = choice.text;
          buttons[i].dataset.choice = i;
          buttons[i].disabled = false;
          buttons[i].className = "puzzle-choice";
        }
      });
    }
    const hintsEl = document.getElementById("puzzle-hints");
    if (hintsEl) {
      while (hintsEl.firstChild) hintsEl.removeChild(hintsEl.firstChild);
    }
    const feedbackEl = document.getElementById("puzzle-feedback");
    if (feedbackEl) feedbackEl.textContent = "";
    const hintBtn = document.getElementById("puzzle-hint");
    if (hintBtn) {
      hintBtn.disabled = false;
      hintBtn.textContent = "Hint (2)";
    }
    popup.style.display = "flex";
  }
  function submitPuzzleChoice(choiceIndex) {
    if (!gameState.pendingPuzzle || !gameState.pendingPuzzle.choices) return false;
    const config = getConfig();
    const itemId = gameState.pendingPuzzle.id;
    const item = config.items.find((i) => i.id === itemId);
    if (!item) {
      gameState.pendingPuzzle = null;
      return false;
    }
    const choice = gameState.pendingPuzzle.choices[choiceIndex];
    if (!choice) return false;
    const choicesEl = document.getElementById("puzzle-choices");
    const buttons = choicesEl ? choicesEl.querySelectorAll(".puzzle-choice") : [];
    const feedbackEl = document.getElementById("puzzle-feedback");
    if (choice.isCorrect) {
      if (buttons[choiceIndex]) buttons[choiceIndex].classList.add("correct");
      setTimeout(() => {
        _unlockBlueprint(item);
      }, 600);
      return true;
    } else {
      if (buttons[choiceIndex]) {
        buttons[choiceIndex].classList.add("wrong");
        buttons[choiceIndex].disabled = true;
      }
      playWrong();
      if (gameState.pendingPuzzle.wrongPenalty) {
        _applyWrongPenalty(gameState.pendingPuzzle.wrongPenalty);
      }
      if (feedbackEl) {
        feedbackEl.textContent = "Wrong answer \u2014 try again!";
        feedbackEl.style.color = "#e74c3c";
      }
      return false;
    }
  }
  function _applyWrongPenalty(penalty) {
    if (!penalty || penalty.type !== "resource") return;
    const resource = penalty.resource || "food";
    const amount = penalty.amount || 2;
    gameState.resources[resource] = Math.max(
      0,
      (gameState.resources[resource] || 0) - amount
    );
    logEvent(`Wrong \u2014 lost ${amount} ${resource}.`);
    updateDisplay();
  }
  function getPuzzleHint() {
    if (!gameState.pendingPuzzle) return false;
    const pending = gameState.pendingPuzzle;
    const hints = pending.hints || [];
    const hintsUsed = pending.hintsUsed || 0;
    if (hintsUsed >= 2 || hintsUsed >= hints.length) {
      const hintBtn2 = document.getElementById("puzzle-hint");
      if (hintBtn2) hintBtn2.disabled = true;
      return false;
    }
    const hint = hints[hintsUsed];
    const hintsEl = document.getElementById("puzzle-hints");
    if (hint && hintsEl) {
      if (hint.type === "eliminate" || hintsUsed === 1 && typeof hint === "object") {
        const choicesEl = document.getElementById("puzzle-choices");
        const buttons = choicesEl ? choicesEl.querySelectorAll(".puzzle-choice") : [];
        const choices = pending.choices || [];
        for (let i = 0; i < choices.length; i++) {
          if (!choices[i].isCorrect && buttons[i] && !buttons[i].disabled && !buttons[i].classList.contains("eliminated")) {
            buttons[i].classList.add("eliminated");
            break;
          }
        }
        const hintDiv = document.createElement("div");
        hintDiv.style.cssText = "color:#e2b714; font-size:0.85em; margin-top:6px; padding:6px 8px; background:rgba(226,183,20,0.08); border-left:2px solid #e2b714; border-radius:4px;";
        hintDiv.textContent = typeof hint === "object" && hint.text ? hint.text : "One wrong answer eliminated.";
        hintsEl.appendChild(hintDiv);
      } else {
        const hintText = typeof hint === "object" && hint.text ? hint.text : typeof hint === "string" ? hint : "Think about what you learned...";
        const hintDiv = document.createElement("div");
        hintDiv.style.cssText = "color:#e2b714; font-size:0.85em; margin-top:6px; padding:6px 8px; background:rgba(226,183,20,0.08); border-left:2px solid #e2b714; border-radius:4px;";
        hintDiv.textContent = hintText;
        hintsEl.appendChild(hintDiv);
      }
    }
    pending.hintsUsed = hintsUsed + 1;
    const hintBtn = document.getElementById("puzzle-hint");
    if (hintBtn) {
      const remaining = Math.max(0, (hints.length > 2 ? 2 : hints.length) - pending.hintsUsed);
      if (remaining <= 0) {
        hintBtn.disabled = true;
        hintBtn.textContent = "No hints left";
      } else {
        hintBtn.textContent = `Hint (${remaining})`;
      }
    }
    return true;
  }
  function skipPuzzle() {
    const popup = document.getElementById("puzzle-popup");
    if (popup) popup.style.display = "none";
  }
  function _unlockBlueprint(item) {
    if (!gameState.unlockedBlueprints.includes(item.id)) {
      gameState.unlockedBlueprints.push(item.id);
    }
    gameState.pendingPuzzle = null;
    delete gameState.itemStudyProgress[item.id];
    const newResources = computeUnlockedResources();
    if (newResources.length > 0) {
      newResources.forEach((r) => {
        logEvent(`New resource discovered: ${r.charAt(0).toUpperCase() + r.slice(1)}!`);
      });
    }
    logEvent(`Correct! Unlocked: ${item.name}!`);
    playUnlock();
    notifyTab("crafting");
    notifyTab("book");
    if (item.didYouKnow) {
      logEvent(`Did you know? ${item.didYouKnow}`);
    }
    const popup = document.getElementById("puzzle-popup");
    if (popup) popup.style.display = "none";
    updateDisplay();
  }
  function _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // automation.js
  var CHAIN_TO_STATE_KEY2 = {
    farming: "food_farming",
    hunting: "food_hunting",
    fishing: "food_fishing"
  };
  function resolveStateKey2(chainId) {
    return CHAIN_TO_STATE_KEY2[chainId] || chainId;
  }
  function resolveConfigKey(stateKey) {
    for (const [configKey, mapped] of Object.entries(CHAIN_TO_STATE_KEY2)) {
      if (mapped === stateKey) return configKey;
    }
    return stateKey;
  }
  function assignWorkerToSingle(chainId, delta) {
    const stateKey = resolveStateKey2(chainId);
    const building = gameState.buildings[stateKey];
    if (!building || building.level === 0) return false;
    const current = gameState.automationAssignments[stateKey] || 0;
    const newCount = current + delta;
    if (newCount < 0) return false;
    if (delta > 0 && gameState.availableWorkers <= 0) return false;
    gameState.automationAssignments[stateKey] = newCount;
    gameState.availableWorkers -= delta;
    return true;
  }
  function assignWorkerToMultiple(chainId, instanceId, delta) {
    const stateKey = resolveStateKey2(chainId);
    const instances = gameState.multipleBuildings[stateKey];
    const instance = instances?.find((i) => i.id === instanceId);
    if (!instance) return false;
    const newCount = (instance.workersAssigned || 0) + delta;
    if (newCount < 0) return false;
    if (delta > 0 && gameState.availableWorkers <= 0) return false;
    instance.workersAssigned = newCount;
    gameState.availableWorkers -= delta;
    return true;
  }
  function runDailyProduction() {
    const config = getConfig();
    if (!config || !config.items) return [];
    const productionLog = [];
    const itemMap = /* @__PURE__ */ new Map();
    for (const item of config.items) {
      itemMap.set(item.id, item);
    }
    const productivityMult = getEffect("productivityMultiplier", 1);
    const speedMult = getEffect("productionSpeedMultiplier", 1);
    const distributionMult = getEffect("resourceDistributionMultiplier", 1);
    let globalMult = 1;
    if (productivityMult > 1) globalMult *= productivityMult;
    if (speedMult > 1) globalMult *= speedMult;
    if (distributionMult > 1) globalMult *= distributionMult;
    for (const stateKey of Object.keys(gameState.buildings)) {
      const building = gameState.buildings[stateKey];
      if (building.level === 0 || !building.itemId) continue;
      const workers = gameState.automationAssignments[stateKey] || 0;
      if (workers === 0) continue;
      const item = itemMap.get(building.itemId);
      if (!item || !item.productionOutput) continue;
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
            reason: "insufficient_input"
          });
          continue;
        }
        for (const [res, amount] of Object.entries(item.productionInput)) {
          gameState.resources[res] -= amount * workers;
        }
      }
      for (const [res, baseAmount] of Object.entries(item.productionOutput)) {
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
    for (const stateKey of Object.keys(gameState.multipleBuildings)) {
      const configKey = resolveConfigKey(stateKey);
      for (const instance of gameState.multipleBuildings[stateKey]) {
        if (!instance.itemId || (instance.workersAssigned || 0) === 0) continue;
        const item = itemMap.get(instance.itemId);
        if (!item || !item.productionOutput) continue;
        const workers = instance.workersAssigned;
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
              reason: "insufficient_input"
            });
            continue;
          }
          for (const [res, amount] of Object.entries(item.productionInput)) {
            gameState.resources[res] -= amount * workers;
          }
        }
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
  function getChainSpecificMultiplier(chainOrStateKey, resource) {
    let multiplier = 1;
    if (resource === "food") {
      const foodMult = getEffect("foodProductionMultiplier", 1);
      if (foodMult > 1) multiplier *= foodMult;
      const configKey = resolveConfigKey(chainOrStateKey);
      if (configKey === "farming") {
        const farmYield = getEffect("farmYieldMultiplier", 1);
        if (farmYield > 1) multiplier *= farmYield;
      }
      if (configKey === "hunting") {
        const huntingYield = getEffect("huntingYieldMultiplier", 1);
        if (huntingYield > 1) multiplier *= huntingYield;
      }
      if (configKey === "fishing") {
        const fishingYield = getEffect("fishingYieldMultiplier", 1);
        if (fishingYield > 1) multiplier *= fishingYield;
      }
    }
    if (resource === "water") {
      const waterMult = getEffect("waterProductionMultiplier", 1);
      if (waterMult > 1) multiplier *= waterMult;
    }
    if (resource === "bricks") {
      const bricksMult = getEffect("bricksProductionMultiplier", 1);
      if (bricksMult > 1) multiplier *= bricksMult;
    }
    if (resource === "metal") {
      const metalMult = getEffect("metalProductionMultiplier", 1);
      if (metalMult > 1) multiplier *= metalMult;
    }
    if (resource === "boards") {
      const boardsMult = getEffect("boardsProductionMultiplier", 1);
      if (boardsMult > 1) multiplier *= boardsMult;
    }
    if (resource === "cloth") {
      const clothMult = getEffect("clothProductionMultiplier", 1);
      if (clothMult > 1) multiplier *= clothMult;
    }
    if (resource === "leather") {
      const leatherMult = getEffect("leatherProductionMultiplier", 1);
      if (leatherMult > 1) multiplier *= leatherMult;
    }
    if (resource === "glass") {
      const glassMult = getEffect("glassProductionMultiplier", 1);
      if (glassMult > 1) multiplier *= glassMult;
    }
    if (resource === "fuel") {
      const fuelMult = getEffect("fuelProductionMultiplier", 1);
      if (fuelMult > 1) multiplier *= fuelMult;
    }
    if (resource === "medicine") {
      const medicineMult = getEffect("medicineProductionMultiplier", 1);
      if (medicineMult > 1) multiplier *= medicineMult;
    }
    if (resource === "paper") {
      const paperMult = getEffect("paperProductionMultiplier", 1);
      if (paperMult > 1) multiplier *= paperMult;
    }
    if (resource === "hides") {
      const hidesMult = getEffect("hidesProductionMultiplier", 1);
      if (hidesMult > 1) multiplier *= hidesMult;
    }
    return multiplier;
  }

  // save.js
  var SAVE_KEY = "postapoc_save_v2";
  function saveGame() {
    try {
      prepareForSave();
      const saveData = serializeState();
      try {
        const events = getActiveEvents();
        if (events && saveData.currentSettlement) {
          saveData.currentSettlement.activeEvents = JSON.parse(JSON.stringify(events));
        }
      } catch {
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      console.info("[save] Game saved (day %d).", gameState.day);
      return true;
    } catch (err) {
      console.error("[save] Failed to save game:", err);
      return false;
    }
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saveData = JSON.parse(raw);
      if (!saveData || saveData.version !== 2) {
        console.warn("[save] Incompatible save version:", saveData?.version);
        return false;
      }
      const success = deserializeState(saveData);
      if (!success) return false;
      try {
        if (gameState.activeEvents && Array.isArray(gameState.activeEvents)) {
          setActiveEvents(gameState.activeEvents.map((e) => ({ ...e })));
        }
      } catch {
      }
      recalculateAvailableWorkers();
      const offlineMs = Date.now() - (saveData.timestamp || Date.now());
      const daySpeed = gameState.settings?.daySpeed || 600;
      const offlineDays = Math.floor(offlineMs / (1e3 * daySpeed));
      if (offlineDays > 0) {
        const summary = simulateOfflineDays(offlineDays);
        console.info("[save] Offline for ~%d game days. Summary:", offlineDays, summary);
        gameState._welcomeBackSummary = summary;
      }
      console.info("[save] Game loaded (day %d).", gameState.day);
      return true;
    } catch (err) {
      console.error("[save] Failed to load game:", err);
      return false;
    }
  }
  function hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }
  function deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      console.info("[save] Save deleted.");
    } catch (err) {
      console.error("[save] Failed to delete save:", err);
    }
  }
  function exportSave() {
    return localStorage.getItem(SAVE_KEY) || "";
  }
  function importSave(data) {
    try {
      const parsed = JSON.parse(data);
      if (!parsed || parsed.version !== 2) {
        console.warn("[save] Import rejected: incompatible version:", parsed?.version);
        return false;
      }
      localStorage.setItem(SAVE_KEY, data);
      console.info("[save] Save imported successfully.");
      return true;
    } catch (err) {
      console.error("[save] Import failed:", err);
      return false;
    }
  }
  function recalculateAvailableWorkers() {
    const sickCount = (gameState.populationMembers || []).filter((m) => m.sick).length;
    const exploringWorkers = (gameState.explorations || []).filter((e) => e.inProgress).reduce((sum, e) => sum + (e.workersOut || 1), 0);
    let automationWorkers = 0;
    for (const count of Object.values(gameState.automationAssignments || {})) {
      automationWorkers += count || 0;
    }
    for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
      for (const instance of gameState.multipleBuildings[chainId] || []) {
        automationWorkers += instance.workersAssigned || 0;
      }
    }
    const computed = gameState.population - sickCount - exploringWorkers - automationWorkers;
    const minWorkers = gameState.population > 0 && automationWorkers === 0 && exploringWorkers === 0 ? 1 : 0;
    gameState.availableWorkers = Math.max(minWorkers, computed);
  }
  function simulateOfflineDays(rawDays) {
    const config = getConfig();
    const MAX_OFFLINE_DAYS = 200;
    const days = Math.min(rawDays, MAX_OFFLINE_DAYS);
    const preset = config.difficultyPresets?.[gameState.difficulty];
    const resourceFloor = preset?.afkResourceFloor ?? 0.1;
    const popFloor = preset?.afkPopulationFloor ?? 0.5;
    const startFood = gameState.resources.food || 0;
    const startWater = gameState.resources.water || 0;
    const startPop = gameState.population;
    const baseFoodPerPerson = config.constants?.BASE_FOOD_PER_PERSON || 2;
    const baseWaterPerPerson = config.constants?.BASE_WATER_PER_PERSON || 1.5;
    const consumptionMult = preset?.consumptionMultiplier || 1;
    let foodProduction = 0;
    let waterProduction = 0;
    for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
      for (const instance of gameState.multipleBuildings[chainId] || []) {
        if (!instance.itemId || !instance.workersAssigned) continue;
        const item = config.items?.find((i) => i.id === instance.itemId);
        if (!item) continue;
        const rate = item.productionRate || 0;
        const workers = instance.workersAssigned || 0;
        if (item.produces === "food" || item.productionOutput?.food) {
          foodProduction += rate * workers;
        }
        if (item.produces === "water" || item.productionOutput?.water) {
          waterProduction += rate * workers;
        }
      }
    }
    for (const chainId of Object.keys(gameState.buildings || {})) {
      const building = gameState.buildings[chainId];
      if (!building.itemId || building.level === 0) continue;
      const workers = gameState.automationAssignments?.[chainId] || 0;
      if (workers === 0) continue;
      const item = config.items?.find((i) => i.id === building.itemId);
      if (!item) continue;
      const rate = item.productionRate || 0;
      if (item.produces === "food" || item.productionOutput?.food) {
        foodProduction += rate * workers;
      }
      if (item.produces === "water" || item.productionOutput?.water) {
        waterProduction += rate * workers;
      }
    }
    const foodCap = config.constants?.BASE_RESOURCE_CAP || 200;
    const waterCap = config.constants?.BASE_RESOURCE_CAP || 200;
    let totalFoodProduced = 0;
    let totalWaterProduced = 0;
    let totalFoodConsumed = 0;
    let totalWaterConsumed = 0;
    for (let d = 0; d < days; d++) {
      const efficiency = d < 50 ? 1 : Math.max(0.1, 1 - (d - 50) * 0.01);
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
      const dayFoodCost = baseFoodPerPerson * gameState.population * consumptionMult;
      const dayWaterCost = baseWaterPerPerson * gameState.population * consumptionMult;
      totalFoodConsumed += dayFoodCost;
      totalWaterConsumed += dayWaterCost;
      gameState.resources.food = Math.max(0, (gameState.resources.food || 0) - dayFoodCost);
      gameState.resources.water = Math.max(0, (gameState.resources.water || 0) - dayWaterCost);
      if (gameState.resources.food <= 0 && gameState.resources.water <= 0) {
        const minPop = Math.max(1, Math.ceil(startPop * popFloor));
        if (gameState.population > minPop) {
          gameState.population = Math.max(minPop, gameState.population - 1);
        }
      }
      gameState.day++;
      gameState.totalDaysPlayed++;
    }
    const foodFloor = startFood * resourceFloor;
    const waterFloor = startWater * resourceFloor;
    gameState.resources.food = Math.max(gameState.resources.food || 0, foodFloor);
    gameState.resources.water = Math.max(gameState.resources.water || 0, waterFloor);
    const minPopulation = Math.max(1, Math.ceil(startPop * popFloor));
    gameState.population = Math.max(gameState.population, minPopulation);
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

  // population.js
  var NAMES = [
    "Ada",
    "Ben",
    "Clara",
    "Dex",
    "Eva",
    "Finn",
    "Grace",
    "Hugo",
    "Iris",
    "Jack",
    "Kate",
    "Leo",
    "Maya",
    "Noah",
    "Olive",
    "Paul",
    "Quinn",
    "Rex",
    "Sara",
    "Tom",
    "Uma",
    "Vic",
    "Willow",
    "Xander",
    "Yara",
    "Zane",
    "Ash",
    "Blake",
    "Cora",
    "Drew",
    "Elle",
    "Fox"
  ];
  var nameIndex = 0;
  function getNextName() {
    const name = NAMES[nameIndex % NAMES.length];
    nameIndex++;
    return name;
  }
  function createMember(name) {
    return {
      id: Date.now() + Math.random(),
      name: name || getNextName(),
      skills: {
        farming: 1,
        mining: 1,
        crafting: 1,
        research: 1,
        exploration: 1
      },
      health: 100,
      happiness: 50,
      assignment: null,
      sick: false,
      sickDaysRemaining: 0
    };
  }
  function initializePopulationMembers() {
    if (!gameState.populationMembers) gameState.populationMembers = [];
    while (gameState.populationMembers.length < gameState.population) {
      gameState.populationMembers.push(createMember());
    }
    nameIndex = gameState.populationMembers.length;
  }
  function addPopulationMember(name) {
    const member = createMember(name);
    gameState.populationMembers = gameState.populationMembers || [];
    gameState.populationMembers.push(member);
    return member;
  }
  function removePopulationMember() {
    if (!gameState.populationMembers || gameState.populationMembers.length === 0) return;
    gameState.populationMembers.sort((a, b) => a.health - b.health);
    const removed = gameState.populationMembers.shift();
    logEvent(`${removed.name} has left the settlement.`);
    return removed;
  }
  function updatePopulation() {
    if (!gameState.populationMembers || gameState.populationMembers.length === 0) return;
    const config = getConfig();
    const healthMult = getEffect("populationHealthMultiplier");
    const morale = getEffect("workerMoraleBoost");
    const skillMult = getEffect("populationSkillMultiplier");
    const medEff = getEffect("medicineEffectivenessMultiplier");
    const medicalLevel = gameState.buildings.medical?.level || 0;
    const treatmentCapacity = medicalLevel * 3;
    let eventSeverity = 1;
    if (gameState.difficulty) {
      const preset = config.difficultyPresets?.[gameState.difficulty];
      if (preset?.eventSeverity) eventSeverity = preset.eventSeverity;
    }
    const isWinter = gameState.currentSeason === "winter";
    const coldSicknessBonus = isWinter ? 0.02 : 0;
    const totalHousing = getTotalHousing();
    const isOvercrowded = totalHousing > 0 && gameState.population > totalHousing * 1.5;
    const overcrowdingBonus = isOvercrowded ? 0.03 : 0;
    let patientsBeingTreated = 0;
    gameState.populationMembers.forEach((member) => {
      if (!member.sick) {
        const sickChance = (0.02 + coldSicknessBonus + overcrowdingBonus) * eventSeverity / Math.max(1, healthMult);
        if (Math.random() < sickChance) {
          member.sick = true;
          member.sickDaysRemaining = Math.ceil(3 + Math.random() * 3);
          if (gameState.availableWorkers > 1) gameState.availableWorkers--;
          logEvent(`${member.name} has fallen ill!`);
        }
      }
      if (member.sick) {
        let healRate = 0.3;
        if (medicalLevel > 0 && patientsBeingTreated < treatmentCapacity) {
          patientsBeingTreated++;
          const hasMedicine = (gameState.resources.medicine || 0) >= 1;
          if (hasMedicine) {
            gameState.resources.medicine -= 1;
            healRate = 1 + medicalLevel * 0.5 * (medEff > 0 ? medEff : 1);
          } else {
            healRate = 0.5 + medicalLevel * 0.2;
          }
        }
        member.sickDaysRemaining -= healRate;
        if (member.sickDaysRemaining <= 0) {
          member.sick = false;
          member.sickDaysRemaining = 0;
          member.health = Math.min(100, member.health + 20);
          gameState.availableWorkers++;
          logEvent(`${member.name} has recovered!`);
        } else {
          member.health = Math.max(10, member.health - 5);
          if (medicalLevel === 0 && member.health <= 20 && Math.random() < 0.1 * eventSeverity) {
            member.health = 0;
            member.markedForRemoval = true;
            gameState.population = Math.max(0, gameState.population - 1);
            logEvent(`${member.name} has died from untreated illness.`, "danger");
          }
        }
      } else {
        member.health = Math.min(100, member.health + 1);
      }
      const baseHappiness = 50;
      const moraleBoost = morale > 0 ? morale * 10 : 0;
      const foodSatisfaction = Math.min(1, (gameState.resources.food || 0) / Math.max(1, gameState.population * 2));
      const waterSatisfaction = Math.min(1, (gameState.resources.water || 0) / Math.max(1, gameState.population * 2));
      const needsSatisfaction = (foodSatisfaction + waterSatisfaction) / 2;
      const happinessTarget = baseHappiness + moraleBoost + needsSatisfaction * 20 - (member.sick ? 20 : 0);
      member.happiness = member.happiness + (happinessTarget - member.happiness) * 0.1;
      member.happiness = Math.max(0, Math.min(100, member.happiness));
      if (member.assignment && !member.sick) {
        const skillKey = getSkillForAssignment(member.assignment);
        if (skillKey && member.skills[skillKey] !== void 0) {
          const growthRate = 0.01 * (skillMult > 0 ? Math.max(1, skillMult) : 1);
          member.skills[skillKey] += growthRate;
        }
      }
    });
    gameState.populationMembers = gameState.populationMembers.filter((m) => !m.markedForRemoval);
    const spoilReduction = getEffect("foodSpoilageReduction");
    const spoilChance = spoilReduction > 0 ? 0.03 * eventSeverity * (1 - spoilReduction) : 0.03 * eventSeverity;
    if (Math.random() < spoilChance) {
      const victim = gameState.populationMembers.find((m) => !m.sick);
      if (victim) {
        victim.sick = true;
        victim.sickDaysRemaining = 2;
        if (gameState.availableWorkers > 0) gameState.availableWorkers--;
        logEvent(`${victim.name} got food poisoning!`);
      }
    }
    const unhappyMembers = gameState.populationMembers.filter((m) => m.happiness < 20 && !m.sick);
    for (const member of unhappyMembers) {
      if (Math.random() < 0.05 * eventSeverity && gameState.population > 1) {
        gameState.populationMembers = gameState.populationMembers.filter((m) => m.id !== member.id);
        gameState.population = Math.max(1, gameState.population - 1);
        if (gameState.availableWorkers > 0) gameState.availableWorkers--;
        logEvent(`${member.name} left the settlement due to unhappiness.`, "warning");
        break;
      }
    }
  }
  function getSkillForAssignment(assignment) {
    const map = {
      // Food production chains
      food_farming: "farming",
      food_hunting: "farming",
      food_fishing: "farming",
      farming: "farming",
      hunting: "farming",
      fishing: "farming",
      water: "farming",
      // Old-style names
      farm: "farming",
      well: "farming",
      orchard: "farming",
      // Mining / processing
      quarry: "mining",
      forge: "mining",
      sawmill: "mining",
      kiln: "mining",
      // Research
      library: "research",
      school: "research",
      observatory: "research",
      university: "research",
      research_lab: "research",
      knowledge: "research",
      // Exploration
      exploration: "exploration",
      // Crafting
      workbench: "crafting",
      loom: "crafting",
      tannery: "crafting",
      glassworks: "crafting",
      charcoal_pit: "crafting",
      herbalist_hut: "crafting",
      paper_mill: "crafting"
    };
    return map[assignment] || null;
  }

  // exploration.js
  function isExplorationUnlocked() {
    return (gameState.multipleBuildings.defense || []).some((d) => d.level >= 3);
  }
  function startExploration(locationId) {
    const config = getConfig();
    const location = (config.explorationLocations || []).find((l) => l.id === locationId);
    if (!location) return false;
    const workersNeeded = location.workersRequired || 1;
    if (gameState.availableWorkers < workersNeeded) {
      logEvent(`Need ${workersNeeded} workers for this exploration. Only ${gameState.availableWorkers} available.`);
      return false;
    }
    const existing = (gameState.explorations || []).find((e) => e.id === locationId);
    if (existing && existing.inProgress) {
      logEvent("Already exploring this location.");
      return false;
    }
    gameState.availableWorkers -= workersNeeded;
    let duration = location.explorationTime;
    const navEff = getEffect("navigationEfficiencyMultiplier");
    if (navEff > 1) duration = Math.max(1, Math.floor(duration / navEff));
    const exploration = {
      id: locationId,
      name: location.name,
      inProgress: true,
      completed: false,
      daysRemaining: duration,
      startDay: gameState.day,
      workersOut: workersNeeded
    };
    gameState.explorations = gameState.explorations || [];
    const idx = gameState.explorations.findIndex((e) => e.id === locationId);
    if (idx >= 0) {
      gameState.explorations[idx] = exploration;
    } else {
      gameState.explorations.push(exploration);
    }
    logEvent(`Sent ${workersNeeded} workers to explore ${location.name}. Estimated ${duration} days.`);
    updateDisplay();
    return true;
  }
  function updateExplorations() {
    if (!isExplorationUnlocked()) return;
    const config = getConfig();
    const locations = config.explorationLocations || [];
    (gameState.explorations || []).forEach((exploration) => {
      if (!exploration.inProgress) return;
      exploration.daysRemaining--;
      if (exploration.daysRemaining <= 0) {
        exploration.inProgress = false;
        exploration.completed = true;
        const location = locations.find((l) => l.id === exploration.id);
        if (location) {
          completeExploration(location, exploration);
        } else {
          gameState.availableWorkers += exploration.workersOut || 1;
        }
      }
    });
  }
  function completeExploration(location, exploration) {
    const workersOut = exploration.workersOut || 1;
    const healthMult = getEffect("populationHealthMultiplier");
    const dangerScale = location.explorationTime / 3;
    let workersLost = 0;
    let workersSickened = 0;
    for (let i = 0; i < workersOut; i++) {
      const deathChance = 0.05 * dangerScale / Math.max(1, healthMult);
      if (Math.random() < deathChance) {
        workersLost++;
        continue;
      }
      const sickChance = 0.2 / Math.max(1, healthMult);
      if (Math.random() < sickChance) {
        workersSickened++;
      }
    }
    for (let i = 0; i < workersLost; i++) {
      gameState.population = Math.max(1, gameState.population - 1);
      removePopulationMember();
    }
    gameState.stats.workersLost = (gameState.stats.workersLost || 0) + workersLost;
    const healthyMembers = (gameState.populationMembers || []).filter((m) => !m.sick);
    for (let i = 0; i < workersSickened && i < healthyMembers.length; i++) {
      healthyMembers[i].sick = true;
      healthyMembers[i].sickDaysRemaining = 3 + Math.floor(Math.random() * 3);
    }
    const healthyReturning = workersOut - workersLost - workersSickened;
    gameState.availableWorkers += Math.max(0, healthyReturning);
    logEvent(`Exploration of ${location.name} complete!`);
    if (workersLost > 0) {
      logEvent(`${workersLost} worker${workersLost > 1 ? "s" : ""} did not return from ${location.name}.`);
    }
    if (workersSickened > 0) {
      const sickNames = healthyMembers.slice(0, workersSickened).map((m) => m.name).join(", ");
      logEvent(`${sickNames} returned from exploration feeling ill.`);
    }
    if (healthyReturning > 0 && workersLost === 0 && workersSickened === 0) {
      logEvent(`All ${healthyReturning} workers returned safely.`);
    }
    const discoveryMult = getEffect("resourceDiscoveryMultiplier");
    const discoveryRate = getEffect("resourceDiscoveryRate");
    if (location.rewards) {
      Object.entries(location.rewards).forEach(([resource, amount]) => {
        let finalAmount = Math.ceil(amount * discoveryMult);
        if (discoveryRate > 0 && Math.random() < discoveryRate) {
          finalAmount = Math.ceil(finalAmount * 1.5);
          logEvent(`Bonus discovery! Extra ${resource} found.`);
        }
        if (resource === "knowledge") {
          gameState.knowledge += finalAmount;
          gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
        } else if (resource in gameState.resources) {
          addResource(resource, finalAmount);
        }
        logEvent(`Found ${finalAmount} ${resource}.`);
      });
    }
    if (location.lore) {
      logEvent(`Lore: ${location.lore}`);
    }
    gameState.stats.totalExplored = (gameState.stats.totalExplored || 0) + 1;
    updateDisplay();
  }

  // quests.js
  function checkQuestAvailability() {
    const config = getConfig();
    const quests = config.quests || [];
    gameState.activeQuests = gameState.activeQuests || [];
    gameState.completedQuests = gameState.completedQuests || [];
    quests.forEach((quest) => {
      if (gameState.completedQuests.includes(quest.id)) return;
      if (gameState.activeQuests.some((q) => q.id === quest.id)) return;
      if (quest.prerequisite) {
        if (quest.prerequisite.quest && !gameState.completedQuests.includes(quest.prerequisite.quest)) return;
        if (quest.prerequisite.item && !isItemBuilt(quest.prerequisite.item)) return;
        if (quest.prerequisite.knowledge && gameState.knowledge < quest.prerequisite.knowledge) return;
        if (quest.prerequisite.day && gameState.day < quest.prerequisite.day) return;
      }
      gameState.activeQuests.push({
        id: quest.id,
        name: quest.name,
        description: quest.description,
        type: quest.type,
        target: quest.target,
        progress: 0,
        reward: quest.reward
      });
      logEvent(`New quest: ${quest.name}!`);
    });
  }
  function checkQuestCompletion() {
    if (!gameState.activeQuests || gameState.activeQuests.length === 0) return;
    const completed = [];
    gameState.activeQuests.forEach((quest) => {
      let progress = 0;
      let target = quest.target.amount || 1;
      switch (quest.type) {
        case "craft":
          progress = isItemBuilt(quest.target.item) ? 1 : 0;
          target = 1;
          break;
        case "population":
          progress = gameState.population;
          target = quest.target.amount;
          break;
        case "gather":
          progress = gameState.stats?.totalGathered || 0;
          target = quest.target.amount;
          break;
        case "explore":
          progress = gameState.stats?.totalExplored || 0;
          target = quest.target.amount;
          break;
        case "day":
          progress = gameState.day;
          target = quest.target.amount;
          break;
        case "build":
          progress = getTotalCraftedCount();
          target = quest.target.amount;
          break;
        case "knowledge":
          progress = gameState.knowledge;
          target = quest.target.amount;
          break;
        case "trade":
          progress = gameState.stats?.totalTraded || 0;
          target = quest.target.amount;
          break;
        default:
          break;
      }
      quest.progress = Math.min(progress, target);
      if (progress >= target) {
        completed.push(quest);
      }
    });
    completed.forEach((quest) => {
      gameState.activeQuests = gameState.activeQuests.filter((q) => q.id !== quest.id);
      gameState.completedQuests.push(quest.id);
      if (quest.reward) {
        Object.entries(quest.reward).forEach(([key, value]) => {
          if (key === "knowledge") {
            gameState.knowledge += value;
            gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
          } else if (key in gameState.resources) {
            addResource(key, value);
          }
        });
      }
      logEvent(`Quest complete: ${quest.name}! Rewards received.`);
    });
    if (completed.length > 0) {
      checkQuestAvailability();
      updateDisplay();
    }
  }

  // achievements.js
  function checkAchievements() {
    const config = getConfig();
    const achievementDefs = config.achievements || [];
    gameState.achievements = gameState.achievements || [];
    achievementDefs.forEach((achievement) => {
      if (gameState.achievements.includes(achievement.id)) return;
      let earned = false;
      switch (achievement.type) {
        case "craft":
          earned = isItemBuilt(achievement.target);
          break;
        case "craftCount":
          earned = getTotalCraftedCount() >= achievement.target;
          break;
        case "population":
          earned = gameState.population >= achievement.target;
          break;
        case "day":
          earned = gameState.day >= achievement.target;
          break;
        case "knowledge":
          earned = gameState.knowledge >= achievement.target;
          break;
        case "gather":
          earned = (gameState.stats?.totalGathered || 0) >= achievement.target;
          break;
        case "explore":
          earned = (gameState.stats?.totalExplored || 0) >= achievement.target;
          break;
        case "trade":
          earned = (gameState.stats?.totalTraded || 0) >= achievement.target;
          break;
        case "quest":
          earned = (gameState.completedQuests || []).length >= achievement.target;
          break;
        default:
          break;
      }
      if (earned) {
        gameState.achievements.push(achievement.id);
        logEvent(`Achievement unlocked: ${achievement.name}!`);
        showAchievementToast(achievement.name);
        if (achievement.reward) {
          Object.entries(achievement.reward).forEach(([key, value]) => {
            if (key === "knowledge") {
              gameState.knowledge += value;
              gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
            } else if (key in gameState.resources) {
              gameState.resources[key] += value;
            }
          });
        }
      }
    });
  }

  // factions.js
  function initializeFactions() {
    if (!gameState.factions) gameState.factions = [];
  }
  function checkFactionAppearance() {
    const config = getConfig();
    const factionDefs = config.factions || [];
    if (factionDefs.length === 0) return;
    if (!gameState.factions) gameState.factions = [];
    factionDefs.forEach((def) => {
      if (gameState.factions.some((f) => f.id === def.id)) return;
      let triggered = false;
      if (def.trigger.type === "population" && gameState.population >= def.trigger.threshold) triggered = true;
      if (def.trigger.type === "day" && gameState.day >= def.trigger.threshold) triggered = true;
      if (def.trigger.type === "craftedItem") {
        triggered = gameState.unlockedBlueprints.includes(def.trigger.item) || isItemBuilt2(def.trigger.item);
      }
      if (def.trigger.type === "knowledge" && gameState.knowledge >= def.trigger.threshold) triggered = true;
      if (triggered) {
        const faction = {
          id: def.id,
          name: def.name,
          description: def.description,
          state: "neutral",
          trust: 50,
          // 0-100 scale; 50 = cautious neutral starting point
          tradeAgreement: false,
          lastInteraction: gameState.day
        };
        gameState.factions.push(faction);
        logEvent(`A new settlement has been discovered: ${def.name}!`);
      }
    });
  }
  function isItemBuilt2(itemId) {
    for (const chainId of Object.keys(gameState.buildings)) {
      if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      if ((gameState.multipleBuildings[chainId] || []).some((inst) => inst.itemId === itemId)) {
        return true;
      }
    }
    return false;
  }
  function updateFactionState(faction) {
    if (faction.trust >= 80) {
      if (faction.state !== "allied") {
        faction.state = "allied";
        logEvent(`${faction.name} has become your ally!`);
      }
    } else if (faction.trust >= 60) {
      if (faction.state === "neutral" || faction.state === "hostile") {
        faction.state = "friendly";
        logEvent(`Relations with ${faction.name} have improved.`);
      }
    } else if (faction.trust <= 20) {
      if (faction.state !== "hostile") {
        faction.state = "hostile";
        logEvent(`${faction.name} has become hostile!`);
      }
    }
  }
  function updateFactions() {
    if (!gameState.factions || gameState.factions.length === 0) return;
    const culturalInfluence = getEffect("culturalInfluenceMultiplier");
    const culturalDev = getEffect("culturalDevelopmentRate");
    const weaponRate = getEffect("weaponCraftingRate");
    gameState.factions.forEach((faction) => {
      if (culturalInfluence > 1) {
        faction.trust = Math.min(100, faction.trust + culturalDev * 0.5);
      }
      updateFactionState(faction);
      if (faction.state === "allied" && faction.tradeAgreement) {
        const tradeBonus = Math.floor(2 + Math.random() * 3);
        const resources = ["food", "water", "wood", "stone"];
        const resource = resources[Math.floor(Math.random() * resources.length)];
        addResource(resource, tradeBonus);
      }
      if (faction.state === "hostile" && Math.random() < 0.1) {
        const defense = weaponRate > 0 ? 0.5 : 1;
        const loss = Math.floor((5 + Math.random() * 10) * defense);
        const resources = ["food", "water", "wood"];
        const target = resources[Math.floor(Math.random() * resources.length)];
        if ((gameState.resources[target] || 0) > loss) {
          gameState.resources[target] -= loss;
          logEvent(`${faction.name} raided your settlement! Lost ${loss} ${target}.`);
        } else {
          logEvent(`${faction.name} attempted a raid but found nothing worth taking.`);
        }
      }
    });
  }
  function sendGift(factionId, resource, amount) {
    const faction = (gameState.factions || []).find((f) => f.id === factionId);
    if (!faction) return false;
    if (faction.trust >= 100) {
      logEvent(`${faction.name} already trusts you fully.`);
      return false;
    }
    if ((gameState.resources[resource] || 0) < amount) {
      logEvent(`Not enough ${resource} for a gift.`);
      return false;
    }
    gameState.resources[resource] -= amount;
    const trustGain = Math.floor(amount / 5);
    faction.trust = Math.min(100, faction.trust + trustGain);
    faction.lastInteraction = gameState.day;
    logEvent(`Sent ${amount} ${resource} to ${faction.name}. Trust improved by ${trustGain}.`);
    updateFactionState(faction);
    updateDisplay();
    return true;
  }
  function establishTradeAgreement(factionId) {
    const faction = (gameState.factions || []).find((f) => f.id === factionId);
    if (!faction) return false;
    if (faction.state !== "friendly" && faction.state !== "allied") {
      logEvent(`${faction.name} is not interested in a trade agreement.`);
      return false;
    }
    faction.tradeAgreement = true;
    logEvent(`Trade agreement established with ${faction.name}!`);
    updateDisplay();
    return true;
  }

  // trading.js
  function isTradingUnlocked() {
    return gameState.buildings.trade?.level >= 1;
  }
  function updateTrading() {
    if (!isTradingUnlocked()) return;
    const config = getConfig();
    const tradingConfig = config.trading;
    if (!tradingConfig) return;
    const currencyRate = getEffect("currencyProductionRate");
    if (currencyRate > 0) {
      let production = currencyRate;
      production *= getEffect("currencyManagementEfficiency");
      production *= getEffect("economicOutputMultiplier");
      gameState.currency = (gameState.currency || 0) + production;
      if (production > 0.5) logEvent(`Mint produced ${production.toFixed(1)} currency.`);
    }
    const growthRate = getEffect("economicGrowthRate");
    if (growthRate > 0 && gameState.currency > 0) {
      const growth = gameState.currency * (growthRate / 100);
      gameState.currency += growth;
    }
    const investReturn = getEffect("investmentReturnMultiplier");
    if (investReturn > 1 && gameState.currency >= 50) {
      if (Math.random() < 0.1) {
        const bonus = Math.floor(gameState.currency * 0.02 * investReturn);
        if (bonus > 0) {
          const resources = ["food", "water", "wood", "stone"];
          const resource = resources[Math.floor(Math.random() * resources.length)];
          addResource(resource, bonus);
          logEvent(`Investment returned ${bonus} ${resource}.`);
        }
      }
    }
    checkTraderArrivals(tradingConfig);
    updateDisplay();
  }
  function checkTraderArrivals(tradingConfig) {
    if (!tradingConfig.traders) return;
    tradingConfig.traders.forEach((trader) => {
      if (trader.requiresItem && !isTraderRequirementMet(trader.requiresItem)) return;
      if (gameState.day % trader.frequency === 0) {
        const existing = (gameState.traderVisits || []).find((v) => v.id === trader.id);
        if (!existing) {
          gameState.traderVisits = gameState.traderVisits || [];
          gameState.traderVisits.push({
            id: trader.id,
            name: trader.name || trader.id.replace(/_/g, " "),
            arrivedDay: gameState.day,
            expiresDay: gameState.day + 3,
            // stays 3 days
            trades: generateTraderOffers(tradingConfig)
          });
          logEvent(`A ${trader.name || trader.id.replace(/_/g, " ")} has arrived at your marketplace!`);
        }
      }
    });
    gameState.traderVisits = (gameState.traderVisits || []).filter((v) => gameState.day <= v.expiresDay);
  }
  function isTraderRequirementMet(itemId) {
    if (gameState.unlockedBlueprints.includes(itemId)) return true;
    for (const chainId of Object.keys(gameState.buildings)) {
      if (gameState.buildings[chainId].itemId === itemId && gameState.buildings[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.tools)) {
      if (gameState.tools[chainId].itemId === itemId && gameState.tools[chainId].level > 0) {
        return true;
      }
    }
    for (const chainId of Object.keys(gameState.multipleBuildings)) {
      if ((gameState.multipleBuildings[chainId] || []).some((inst) => inst.itemId === itemId)) {
        return true;
      }
    }
    return false;
  }
  function generateTraderOffers(tradingConfig) {
    const baseRates = tradingConfig.baseExchangeRates || [];
    const tradeEff = getEffect("tradeEfficiencyMultiplier");
    return baseRates.map((rate) => ({
      give: rate.give,
      giveAmount: Math.max(1, Math.ceil(rate.giveAmount / tradeEff)),
      receive: rate.receive,
      receiveAmount: Math.ceil(rate.receiveAmount * tradeEff),
      available: true
    }));
  }
  function executeTrade(traderIndex, tradeIndex) {
    const trader = (gameState.traderVisits || [])[traderIndex];
    if (!trader) return false;
    const trade = trader.trades[tradeIndex];
    if (!trade || !trade.available) return false;
    if ((gameState.resources[trade.give] || 0) < trade.giveAmount) {
      logEvent(`Not enough ${trade.give} for this trade.`);
      return false;
    }
    const safety = getEffect("tradeShipSafetyMultiplier");
    if (trader.id === "coastal_trader" && safety < 1.5) {
      if (Math.random() < 0.15) {
        gameState.resources[trade.give] -= trade.giveAmount;
        logEvent(`Trade shipment was lost at sea! Lost ${trade.giveAmount} ${trade.give}.`);
        updateDisplay();
        return false;
      }
    }
    gameState.resources[trade.give] -= trade.giveAmount;
    addResource(trade.receive, trade.receiveAmount);
    gameState.stats.totalTraded = (gameState.stats.totalTraded || 0) + 1;
    logEvent(`Traded ${trade.giveAmount} ${trade.give} for ${trade.receiveAmount} ${trade.receive}.`);
    trade.available = false;
    updateDisplay();
    return true;
  }

  // techtree.js
  var TIER_NAMES = ["Ch1 Survival", "Ch2 Primitive", "Ch3 Settlement", "Ch4 Village", "Ch5 Industrial", "Ch6 Modern", "Ch7 Space"];
  var TIER_COLORS = {
    "Ch1 Survival": "#2ecc71",
    "Ch2 Primitive": "#27ae60",
    "Ch3 Settlement": "#3498db",
    "Ch4 Village": "#9b59b6",
    "Ch5 Industrial": "#e67e22",
    "Ch6 Modern": "#e74c3c",
    "Ch7 Space": "#f39c12"
  };
  var NODE_WIDTH = 110;
  var NODE_HEIGHT = 36;
  var TIER_GAP = 80;
  var NODE_GAP = 12;
  var PADDING = 30;
  function getItemTierName(item) {
    const chapter = item.chapter || 1;
    return TIER_NAMES[Math.min(chapter - 1, TIER_NAMES.length - 1)];
  }
  function polyfillRoundRect(ctx) {
    if (typeof ctx.roundRect === "function") return;
    ctx.roundRect = function roundRect(x, y, w, h, r) {
      this.beginPath();
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.arcTo(x + w, y, x + w, y + r, r);
      this.lineTo(x + w, y + h - r);
      this.arcTo(x + w, y + h, x + w - r, y + h, r);
      this.lineTo(x + r, y + h);
      this.arcTo(x, y + h, x, y + h - r, r);
      this.lineTo(x, y + r);
      this.arcTo(x, y, x + r, y, r);
      this.closePath();
    };
  }
  function renderTechTree(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const config = getConfig();
    const items = config.items;
    const ctx = canvas.getContext("2d");
    polyfillRoundRect(ctx);
    const tiers = {};
    TIER_NAMES.forEach((t) => {
      tiers[t] = [];
    });
    items.forEach((item) => {
      const tierName = getItemTierName(item);
      tiers[tierName].push(item);
    });
    const maxPerTier = Math.max(...Object.values(tiers).map((t) => t.length));
    const canvasWidth = Math.max(800, maxPerTier * (NODE_WIDTH + NODE_GAP) + PADDING * 2);
    const canvasHeight = TIER_NAMES.length * (NODE_HEIGHT + TIER_GAP) + PADDING * 2;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const techUnlockRate = getEffect("advancedTechUnlockRate");
    const nodePositions = {};
    TIER_NAMES.forEach((tierName, tierIdx) => {
      const tierItems = tiers[tierName];
      const y = PADDING + tierIdx * (NODE_HEIGHT + TIER_GAP);
      ctx.fillStyle = TIER_COLORS[tierName];
      ctx.font = "bold 12px Orbitron, monospace";
      ctx.fillText(tierName, PADDING, y - 5);
      tierItems.forEach((item, itemIdx) => {
        const x = PADDING + itemIdx * (NODE_WIDTH + NODE_GAP);
        const isCrafted = isItemBuilt(item.id);
        const isAvailable = !isCrafted && gameState.unlockedBlueprints.includes(item.id);
        const isLocked = !isCrafted && !isAvailable;
        let fillColor, textColor, borderColor;
        if (isCrafted) {
          fillColor = "rgba(46, 204, 113, 0.3)";
          textColor = "#2ecc71";
          borderColor = "#2ecc71";
        } else if (isAvailable) {
          fillColor = "rgba(0, 255, 255, 0.2)";
          textColor = "#00ffff";
          borderColor = "#00ffff";
        } else {
          fillColor = "rgba(100, 100, 100, 0.2)";
          textColor = "#666";
          borderColor = "#444";
        }
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, 6);
        ctx.fill();
        ctx.stroke();
        const showName = !isLocked || techUnlockRate > 0;
        const rawName = showName ? item.name : "???";
        const displayName = rawName.length > 14 ? rawName.substring(0, 12) + ".." : rawName;
        ctx.fillStyle = textColor;
        ctx.font = "9px Orbitron, monospace";
        ctx.fillText(displayName, x + 5, y + 15);
        ctx.font = "8px Orbitron, monospace";
        if (isCrafted) {
          ctx.fillStyle = "#2ecc71";
          ctx.fillText("BUILT", x + 5, y + 28);
        } else if (isAvailable) {
          ctx.fillStyle = "#00ffff";
          ctx.fillText("AVAILABLE", x + 5, y + 28);
        } else {
          ctx.fillStyle = "#555";
          ctx.fillText("LOCKED", x + 5, y + 28);
        }
        nodePositions[item.id] = {
          x: x + NODE_WIDTH / 2,
          y: y + NODE_HEIGHT / 2,
          top: y,
          bottom: y + NODE_HEIGHT,
          left: x,
          right: x + NODE_WIDTH
        };
      });
    });
    ctx.lineWidth = 1;
    items.forEach((item) => {
      const target = nodePositions[item.id];
      if (!target || !item.chain || item.level <= 1) return;
      const prevItem = items.find((i) => i.chain === item.chain && i.level === item.level - 1);
      if (!prevItem) return;
      const source = nodePositions[prevItem.id];
      if (!source) return;
      const itemBuilt = isItemBuilt(item.id);
      const prevBuilt = isItemBuilt(prevItem.id);
      ctx.strokeStyle = itemBuilt || prevBuilt ? "rgba(46, 204, 113, 0.4)" : "rgba(100, 100, 100, 0.3)";
      ctx.beginPath();
      ctx.moveTo(source.x, source.bottom);
      ctx.lineTo(target.x, target.top);
      ctx.stroke();
    });
  }
  function toggleTechTree() {
    const container = document.getElementById("tech-tree-container");
    if (!container) return;
    if (container.style.display === "none" || container.style.display === "") {
      container.style.display = "block";
      renderTechTree("tech-tree-canvas");
    } else {
      container.style.display = "none";
    }
  }

  // game.js
  var gameLoopInterval = null;
  var dayTickCounter = 0;
  var mealsEatenToday = 0;
  var saveInterval = null;
  async function initializeGame() {
    await loadGameConfig();
    try {
      const config = getConfig();
      initSettlements();
      initNetwork();
      computeUnlockedResources();
      updateGatheringVisibility();
    } catch (err) {
      console.error("[init] Config-dependent init failed:", err);
    }
    initMuteState();
    const soundBtn = document.getElementById("sound-toggle");
    if (soundBtn) {
      soundBtn.textContent = isMuted() ? "\u{1F507}" : "\u{1F50A}";
      soundBtn.addEventListener("click", () => {
        initAudio();
        toggleMute();
        soundBtn.textContent = isMuted() ? "\u{1F507}" : "\u{1F50A}";
      });
    }
    document.getElementById("puzzle-choices")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".puzzle-choice");
      if (!btn || btn.disabled) return;
      initAudio();
      const popup = document.getElementById("puzzle-popup");
      const type = popup?.dataset.puzzleType;
      if (type === "study") {
        const choiceIndex = parseInt(btn.dataset.choice, 10);
        submitPuzzleChoice(choiceIndex);
      }
    });
    document.getElementById("puzzle-skip")?.addEventListener("click", () => {
      const popup = document.getElementById("puzzle-popup");
      const type = popup?.dataset.puzzleType;
      if (type === "study") {
        skipPuzzle();
      } else if (type === "unlock") {
        gameState.pendingPuzzle = { type: "unlock", puzzleId: popup.dataset.puzzleId };
        popup.style.display = "none";
      } else if (type === "item_unlock") {
        gameState.pendingPuzzle = { type: "item_unlock", itemId: popup.dataset.itemId };
        popup.style.display = "none";
      } else {
        popup.style.display = "none";
      }
    });
    document.getElementById("puzzle-hint")?.addEventListener("click", () => {
      initAudio();
      getPuzzleHint();
    });
    document.getElementById("flashback-close")?.addEventListener("click", () => {
      const popup = document.getElementById("flashback-popup");
      if (popup) popup.style.display = "none";
    });
    document.getElementById("lore-play-btn")?.addEventListener("click", () => {
      startLoreSlideshow();
    });
    document.getElementById("lore-prev")?.addEventListener("click", () => {
      navigateLoreSlideshow(-1);
    });
    document.getElementById("lore-next")?.addEventListener("click", () => {
      navigateLoreSlideshow(1);
    });
    document.getElementById("lore-slideshow-close")?.addEventListener("click", () => {
      closeLoreSlideshow();
    });
    document.getElementById("lore-back-btn")?.addEventListener("click", () => {
      const archive = document.getElementById("lore-archive");
      const bookMain = document.getElementById("book-main-content");
      if (archive) archive.classList.remove("active");
      if (bookMain) bookMain.style.display = "";
      document.querySelector(".memories-btn.active")?.classList.remove("active");
    });
    document.getElementById("world-view-btn")?.addEventListener("click", () => {
      const worldView = document.getElementById("world-view");
      const campMain = document.getElementById("camp-main-content");
      if (worldView) worldView.style.display = "";
      if (campMain) campMain.style.display = "none";
    });
    document.getElementById("world-back-btn")?.addEventListener("click", () => {
      const worldView = document.getElementById("world-view");
      const campMain = document.getElementById("camp-main-content");
      if (worldView) worldView.style.display = "none";
      if (campMain) campMain.style.display = "";
    });
    document.getElementById("restart-game")?.addEventListener("click", () => {
      document.getElementById("game-over-popup").style.display = "none";
      resetGame();
    });
    document.getElementById("victory-continue")?.addEventListener("click", () => {
      document.getElementById("victory-popup").style.display = "none";
      gameState.sandboxMode = true;
      logEvent("Sandbox mode activated! Population cap removed. Keep building!");
    });
    document.getElementById("victory-restart")?.addEventListener("click", () => {
      document.getElementById("victory-popup").style.display = "none";
      resetGame();
    });
    document.getElementById("tech-tree-toggle")?.addEventListener("click", () => {
      toggleTechTree();
    });
    document.getElementById("restart-game-btn")?.addEventListener("click", () => {
      const popup = document.getElementById("restart-confirm-popup");
      if (popup) popup.style.display = "flex";
    });
    document.getElementById("restart-confirm-yes")?.addEventListener("click", () => {
      document.getElementById("restart-confirm-popup").style.display = "none";
      resetGame();
    });
    document.getElementById("restart-confirm-no")?.addEventListener("click", () => {
      document.getElementById("restart-confirm-popup").style.display = "none";
    });
    setupDevTools();
    document.getElementById("study-btn")?.addEventListener("click", () => {
      initAudio();
      study();
    });
    document.getElementById("gathering-buttons")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".gather-btn") || e.target.closest('button[id^="gather-"]');
      if (btn) {
        initAudio();
        const resource = btn.dataset.resource || btn.id?.replace("gather-", "");
        if (resource) gatherResource(resource);
      }
    });
    document.getElementById("crafting-categories")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".cat-btn");
      if (btn) {
        document.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        updateCraftingTab();
      }
    });
    document.getElementById("crafting-items")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".craft-btn") || e.target.closest("button[data-item-id]");
      if (btn && btn.dataset.itemId) {
        initAudio();
        const upgradeId = btn.dataset.upgradeInstanceId || null;
        if (startCrafting(btn.dataset.itemId, upgradeId)) {
          playCraft();
          logEvent(`Started crafting: ${btn.dataset.itemName || btn.dataset.itemId}`, "craft");
          updateCraftingTab();
          updateCraftingQueueDisplay();
        }
      }
    });
    document.getElementById("production-assignments")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".worker-btn") || e.target.closest("button[data-chain-id]");
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
    document.getElementById("trader-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-trader-idx]");
      if (!btn) return;
      initAudio();
      executeTrade(parseInt(btn.dataset.traderIdx), parseInt(btn.dataset.tradeIdx));
      updateTradingSection();
    });
    document.getElementById("exploration-locations")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-location-id]");
      if (!btn) return;
      initAudio();
      startExploration(btn.dataset.locationId);
      updateExplorationSection();
    });
    document.getElementById("faction-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-faction-id]");
      if (!btn) return;
      initAudio();
      const factionId = btn.dataset.factionId;
      const action = btn.dataset.action;
      if (action === "gift") {
        sendGift(factionId, "food", 10);
      } else if (action === "trade") {
        establishTradeAgreement(factionId);
      }
      updateFactionsSection();
    });
    document.getElementById("share-stats-btn")?.addEventListener("click", () => {
      const text = getShareableStats();
      navigator.clipboard.writeText(text).then(() => {
        logEvent("Stats copied to clipboard!");
        const btn = document.getElementById("share-stats-btn");
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy Stats to Clipboard";
        }, 2e3);
      }).catch(() => {
        logEvent("Could not copy stats. Try manually.");
      });
    });
    window.addEventListener("manual-save", () => {
      if (gameState.gameStarted && !gameState.isGameOver) {
        saveGame();
        showSaveIndicator();
        logEvent("Game saved manually.");
      }
    });
    document.getElementById("export-save-btn")?.addEventListener("click", () => {
      const data = exportSave();
      if (!data) {
        logEvent("No save data to export.");
        return;
      }
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `postapoc_save_day${gameState.day}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const status = document.getElementById("export-save-status");
      if (status) {
        status.textContent = "Save exported!";
        setTimeout(() => {
          status.textContent = "";
        }, 3e3);
      }
    });
    document.getElementById("import-save-btn")?.addEventListener("click", () => {
      document.getElementById("import-save-file")?.click();
    });
    document.getElementById("import-save-file")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (importSave(text)) {
          logEvent("Save imported. Reloading...");
          window.location.reload();
        } else {
          logEvent("Import failed: incompatible save version.");
        }
      } catch (err) {
        logEvent("Import failed: invalid file.");
        console.error("[import] Failed:", err);
      }
      e.target.value = "";
    });
    document.getElementById("tech-tree-btn")?.addEventListener("click", () => {
      toggleTechTree();
    });
    document.getElementById("tech-tree-close")?.addEventListener("click", () => {
      toggleTechTree();
    });
    window.addEventListener("beforeunload", () => {
      if (gameState.gameStarted && !gameState._restarting) saveGame();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && gameState.gameStarted && !gameState._restarting) saveGame();
    });
    document.getElementById("mod-file")?.addEventListener("change", async (e) => {
      await handleModFile(e, "mod-status");
    });
    document.getElementById("camp-mod-file")?.addEventListener("change", async (e) => {
      await handleModFile(e, "camp-mod-status");
    });
    document.getElementById("network-map")?.addEventListener("click", (e) => {
      const foundBtn = e.target.closest("#found-settlement-btn");
      if (foundBtn) {
        initAudio();
        playClick();
        const nameInput = document.getElementById("new-settlement-name");
        const name = (nameInput ? nameInput.value.trim() : "") || "Settlement " + ((gameState.settlements || []).length + 1);
        const newId = createSettlement(name);
        if (newId) {
          initializePopulationMembers();
          initializeFactions();
          computeUnlockedResources();
          updateGatheringVisibility();
          updateDisplay();
          updateNetworkTab();
          const newNameInput = document.getElementById("new-settlement-name");
          if (newNameInput) newNameInput.value = "";
        }
        return;
      }
      const switchBtn = e.target.closest('button[data-action="switch"]');
      if (switchBtn) {
        initAudio();
        playClick();
        const targetId = switchBtn.dataset.settlementId;
        if (targetId && switchSettlement(targetId)) {
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
    document.getElementById("supply-lines")?.addEventListener("click", (e) => {
      const createBtn = e.target.closest("#create-supply-line-btn");
      if (createBtn) {
        initAudio();
        playClick();
        const from = document.getElementById("sl-from")?.value;
        const to = document.getElementById("sl-to")?.value;
        const resource = document.getElementById("sl-resource")?.value;
        const amount = parseInt(document.getElementById("sl-amount")?.value || "5", 10);
        if (from && to && resource) {
          createSupplyLine(from, to, resource, amount);
          updateNetworkTab();
        }
        return;
      }
      const removeBtn = e.target.closest('button[data-action="remove-supply-line"]');
      if (removeBtn) {
        initAudio();
        playClick();
        removeSupplyLine(removeBtn.dataset.supplyLineId);
        updateNetworkTab();
        return;
      }
    });
    initUI();
    const gatherContainer = document.getElementById("gathering-buttons");
    if (gatherContainer) {
      gatherContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".gather-btn");
        if (!btn || btn.disabled) return;
        initAudio();
        gatherResource(btn.dataset.resource);
      });
    }
    document.getElementById("game-container").style.display = "block";
    document.getElementById("hud").style.display = "flex";
    document.getElementById("bottom-nav").style.display = "flex";
    if (hasSave()) {
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
        logEvent("Game loaded.");
        if (gameState._welcomeBackSummary) {
          const summary = gameState._welcomeBackSummary;
          delete gameState._welcomeBackSummary;
          setTimeout(() => showWelcomeBack(summary), 2500);
        }
      }
    } else {
      initSettlements();
      initNetwork();
      initializePopulationMembers();
      initializeFactions();
      gameState.gameStarted = true;
      computeUnlockedResources();
      updateGatheringVisibility();
      preRenderAllTabs();
      checkQuestAvailability();
      logEvent("You wake up alone in the wilderness. You have nothing but a worn book.", "story");
      logEvent("Study the Book to learn how to survive.", "info");
      startGameLoop();
      startAutoSave();
      if (!localStorage.getItem("postapoc_tutorial_seen")) {
        setTimeout(() => {
          const overlay = document.getElementById("tutorial-overlay");
          if (overlay) overlay.classList.add("active");
        }, 2500);
      }
    }
    const waitForFonts = new Promise((resolve) => {
      if (window.__fontsLoaded) return resolve();
      const check = setInterval(() => {
        if (window.__fontsLoaded) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 3e3);
    });
    const minDelay = new Promise((r) => setTimeout(r, 2e3));
    Promise.all([waitForFonts, minDelay]).then(() => {
      const splash = document.getElementById("splash-screen");
      if (splash) {
        splash.classList.add("dismissed");
        setTimeout(() => {
          splash.style.display = "none";
        }, 900);
      }
    });
  }
  function setupDevTools() {
    const header = document.querySelector("#dev-tools-card .section-header");
    const content = document.getElementById("dev-tools-content");
    if (header && content) {
      header.addEventListener("click", () => {
        const open = content.style.display !== "none";
        content.style.display = open ? "none" : "block";
        const arrow = header.querySelector(".toggle-arrow");
        if (arrow) arrow.textContent = open ? "\u25BC" : "\u25B2";
      });
    }
    document.getElementById("dev-day-speed")?.addEventListener("change", (e) => {
      const speed = parseInt(e.target.value, 10);
      if (speed > 0) {
        gameState.settings.daySpeed = speed;
        logEvent(`[Dev] Day speed set to ${speed}s.`);
      }
    });
    document.getElementById("dev-skip-day")?.addEventListener("click", () => {
      advanceDay();
      logEvent("[Dev] Skipped 1 day.");
      updateDisplay();
    });
    document.getElementById("dev-skip-week")?.addEventListener("click", () => {
      for (let i = 0; i < 7; i++) advanceDay();
      logEvent("[Dev] Skipped 7 days.");
      updateDisplay();
    });
    document.getElementById("dev-tools-content")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".dev-add-res");
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
    document.getElementById("dev-fill-all")?.addEventListener("click", () => {
      const config = getConfig();
      const allRes = (config.resources?.raw || []).concat(["food", "water"]);
      allRes.forEach((r) => {
        gameState.resources[r] = getResourceCap(r);
      });
      logEvent("[Dev] Filled all resources to cap.");
      updateDisplay();
    });
    document.getElementById("dev-clear-gate")?.addEventListener("click", () => {
      gameState.studyGateProgress = {};
      logEvent("[Dev] Study gate cleared.");
      updateDisplay();
    });
    document.getElementById("dev-add-knowledge")?.addEventListener("click", () => {
      gameState.knowledge += 20;
      gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
      logEvent("[Dev] Added 20 knowledge.");
      updateDisplay();
    });
    document.getElementById("dev-add-pop")?.addEventListener("click", () => {
      gameState.population++;
      gameState.availableWorkers++;
      addPopulationMember();
      logEvent("[Dev] Added 1 population.");
      updateDisplay();
    });
    document.getElementById("dev-unlock-all")?.addEventListener("click", () => {
      const config = getConfig();
      if (config.items) {
        config.items.forEach((item) => {
          if (!gameState.unlockedBlueprints.includes(item.id)) {
            gameState.unlockedBlueprints.push(item.id);
          }
        });
      }
      computeUnlockedResources();
      logEvent("[Dev] Unlocked all blueprints.");
      updateDisplay();
    });
    document.getElementById("dev-dump-state")?.addEventListener("click", () => {
      console.log("[Dev] gameState:", JSON.parse(JSON.stringify(gameState)));
      logEvent("[Dev] GameState logged to console (F12).");
    });
    document.getElementById("dev-heal-all")?.addEventListener("click", () => {
      (gameState.populationMembers || []).forEach((m) => {
        if (m.sick) {
          m.sick = false;
          m.sickDaysRemaining = 0;
          m.health = Math.min(100, m.health + 30);
        }
      });
      const sickCount = 0;
      const exploringWorkers = (gameState.explorations || []).filter((e) => e.inProgress).reduce((sum, e) => sum + (e.workersOut || 1), 0);
      let automationWorkers = 0;
      for (const count of Object.values(gameState.automationAssignments || {})) {
        automationWorkers += count || 0;
      }
      for (const chainId of Object.keys(gameState.multipleBuildings || {})) {
        for (const instance of gameState.multipleBuildings[chainId] || []) {
          automationWorkers += instance.workersAssigned || 0;
        }
      }
      gameState.availableWorkers = Math.max(0, gameState.population - sickCount - exploringWorkers - automationWorkers);
      logEvent("[Dev] Healed all sick members.");
      updateDisplay();
    });
    const speedSelect = document.getElementById("dev-day-speed");
    if (speedSelect) {
      const current = gameState.settings?.daySpeed || 600;
      const option = speedSelect.querySelector(`option[value="${current}"]`);
      if (option) option.selected = true;
    }
  }
  function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    dayTickCounter = 0;
    mealsEatenToday = 0;
    gameLoopInterval = setInterval(() => {
      if (!gameState.gameStarted || gameState.isGameOver) return;
      gameState.time++;
      dayTickCounter++;
      const daySpeed = gameState.settings?.daySpeed || 600;
      updateTimeEmoji();
      updateTimeDisplay();
      updateDayNightCycle();
      checkQuestCompletion();
      checkSurvival();
      updateDisplay();
      const mealInterval = Math.floor(daySpeed / 3);
      const mealsExpected = Math.min(3, Math.floor(dayTickCounter / mealInterval));
      if (mealsExpected > mealsEatenToday) {
        consumeResources(mealsExpected - mealsEatenToday);
        mealsEatenToday = mealsExpected;
      }
      if (!gameState.isStudying && gameState._pendingEventCheck) {
        gameState._pendingEventCheck = false;
        checkForEvents();
        checkMilestoneEvents();
      }
      if (dayTickCounter >= daySpeed) {
        dayTickCounter = 0;
        advanceDay();
        mealsEatenToday = 0;
      }
    }, 1e3);
  }
  function advanceDay() {
    gameState.day++;
    gameState.totalDaysPlayed++;
    gameState.stats.totalDaysInSettlement = (gameState.stats.totalDaysInSettlement || 0) + 1;
    if (mealsEatenToday < 3) {
      consumeResources(3 - mealsEatenToday);
      mealsEatenToday = 3;
    }
    runDailyProduction();
    capResources();
    updatePopulation();
    const _prevPop = gameState.population;
    const _prevQuests = (gameState.activeQuests || []).length;
    const _prevAchievements = (gameState.achievements || []).length;
    const _prevFactions = (gameState.factions || []).length;
    const _prevTraders = (gameState.traderVisits || []).length;
    const _prevDiscovered = (gameState.discoveredLocations || []).length;
    checkPopulationGrowth();
    while ((gameState.populationMembers?.length || 0) < gameState.population) {
      addPopulationMember();
    }
    updateWeather();
    if (gameState.day % 30 === 0) {
      advanceSeason();
    }
    updateActiveEvents();
    if (!gameState.isStudying) {
      checkForEvents();
      checkMilestoneEvents();
    } else {
      gameState._pendingEventCheck = true;
    }
    updateExplorations();
    checkFactionAppearance();
    updateFactions();
    if (isTradingUnlocked()) updateTrading();
    processSupplyLines();
    checkQuestAvailability();
    checkQuestCompletion();
    checkAchievements();
    if (gameState.population > _prevPop) notifyTab("settlement", gameState.population - _prevPop);
    if ((gameState.activeQuests || []).length > _prevQuests) notifyTab("world");
    if ((gameState.achievements || []).length > _prevAchievements) notifyTab("world");
    if ((gameState.factions || []).length > _prevFactions) notifyTab("world");
    if ((gameState.traderVisits || []).length > _prevTraders) notifyTab("world");
    if ((gameState.discoveredLocations || []).length > _prevDiscovered) notifyTab("exploration");
    updateTradingSection();
    updateExplorationSection();
    updateQuestsSection();
    updateAchievementsSection();
    updatePopulationSection();
    updateFactionsSection();
    updateStatsSection();
    updateNetworkTab();
    if (gameState.day % 5 === 0) {
      logEvent(
        `Day ${gameState.day} \u2014 Pop: ${gameState.population}, Food: ${Math.floor(gameState.resources.food)}, Water: ${Math.floor(gameState.resources.water)}`,
        "info"
      );
    }
  }
  function advanceSeason() {
    const seasons = ["spring", "summer", "autumn", "winter"];
    const currentIdx = seasons.indexOf(gameState.currentSeason);
    gameState.currentSeason = seasons[(currentIdx + 1) % 4];
    logEvent(`Season changed to ${gameState.currentSeason}.`, "season");
  }
  function checkSurvival() {
    if (gameState.resources.food <= 0 && gameState.resources.water <= 0 && gameState.population <= 0) {
      gameState.isGameOver = true;
      playGameOver();
      showGameOver();
      deleteSave();
    }
  }
  function startAutoSave() {
    if (saveInterval) clearInterval(saveInterval);
    saveInterval = setInterval(() => {
      if (gameState.gameStarted && !gameState.isGameOver) {
        saveGame();
        showSaveIndicator();
      }
    }, 3e4);
  }
  function showSaveIndicator() {
    const indicator = document.getElementById("save-indicator");
    if (!indicator) return;
    indicator.classList.add("show");
    setTimeout(() => indicator.classList.remove("show"), 1500);
  }
  function showWelcomeBack(summary) {
    const popup = document.getElementById("welcome-back-popup");
    const content = document.getElementById("welcome-back-content");
    if (!popup || !content) return;
    content.textContent = "";
    const wrap = document.createElement("div");
    const timeRow = document.createElement("div");
    timeRow.style.cssText = "text-align:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid rgba(0,255,255,0.15);";
    const dayText = document.createElement("div");
    dayText.style.cssText = "font-size:1.8em; font-weight:700; color:#00ffff;";
    dayText.textContent = `${summary.daysAdvanced}`;
    timeRow.appendChild(dayText);
    const dayLabel = document.createElement("div");
    dayLabel.style.cssText = "font-size:0.7em; color:#8494a7; text-transform:uppercase; letter-spacing:2px;";
    dayLabel.textContent = summary.daysAdvanced === 1 ? "day passed" : "days passed";
    timeRow.appendChild(dayLabel);
    if (summary.capped) {
      const capNote = document.createElement("div");
      capNote.style.cssText = "font-size:0.6em; color:#f39c12; margin-top:4px;";
      capNote.textContent = `(capped from ${summary.rawDays} days)`;
      timeRow.appendChild(capNote);
    }
    wrap.appendChild(timeRow);
    const buildRow = (icon, label, before, after, color) => {
      const net = after - before;
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);";
      const left = document.createElement("div");
      left.style.cssText = "display:flex; align-items:center; gap:8px;";
      const iconEl = document.createElement("span");
      iconEl.style.cssText = `font-size:1em;`;
      iconEl.textContent = icon;
      left.appendChild(iconEl);
      const labelEl = document.createElement("span");
      labelEl.style.cssText = `font-size:0.85em; color:${color}; font-weight:500;`;
      labelEl.textContent = label;
      left.appendChild(labelEl);
      row.appendChild(left);
      const right = document.createElement("div");
      right.style.cssText = "display:flex; align-items:center; gap:8px;";
      const vals = document.createElement("span");
      vals.style.cssText = "font-size:0.8em; color:#bdc3c7;";
      vals.textContent = `${before} \u2192 ${after}`;
      right.appendChild(vals);
      const netEl = document.createElement("span");
      const netColor = net > 0 ? "#2ecc71" : net < 0 ? "#e74c3c" : "#7f8c8d";
      const netSign = net > 0 ? "+" : "";
      netEl.style.cssText = `font-size:0.75em; padding:2px 6px; border-radius:4px; font-weight:600; color:${netColor}; background:${net > 0 ? "rgba(46,204,113,0.12)" : net < 0 ? "rgba(231,76,60,0.12)" : "rgba(127,140,141,0.1)"};`;
      netEl.textContent = `${netSign}${net}`;
      right.appendChild(netEl);
      row.appendChild(right);
      return row;
    };
    const statsSection = document.createElement("div");
    statsSection.style.cssText = "margin-bottom:10px;";
    statsSection.appendChild(buildRow("\u{1F33E}", "Food", summary.foodBefore, summary.foodAfter, "#f39c12"));
    statsSection.appendChild(buildRow("\u{1F4A7}", "Water", summary.waterBefore, summary.waterAfter, "#3498db"));
    if (summary.populationBefore !== summary.populationAfter) {
      statsSection.appendChild(buildRow("\u{1F465}", "Population", summary.populationBefore, summary.populationAfter, "#bb86fc"));
    }
    wrap.appendChild(statsSection);
    if (summary.foodProduced > 0 || summary.waterProduced > 0) {
      const prodSection = document.createElement("div");
      prodSection.style.cssText = "background:rgba(46,204,113,0.06); border:1px solid rgba(46,204,113,0.15); border-radius:8px; padding:8px 10px; margin-bottom:10px;";
      const prodTitle = document.createElement("div");
      prodTitle.style.cssText = "font-size:0.6em; color:#2ecc71; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;";
      prodTitle.textContent = "Worker Production";
      prodSection.appendChild(prodTitle);
      const prodDetails = document.createElement("div");
      prodDetails.style.cssText = "font-size:0.8em; color:#e0e4e8;";
      const parts = [];
      if (summary.foodProduced > 0) parts.push(`+${summary.foodProduced} food`);
      if (summary.waterProduced > 0) parts.push(`+${summary.waterProduced} water`);
      prodDetails.textContent = parts.join("  \xB7  ");
      prodSection.appendChild(prodDetails);
      wrap.appendChild(prodSection);
    }
    if (summary.foodConsumed > 0 || summary.waterConsumed > 0) {
      const consSection = document.createElement("div");
      consSection.style.cssText = "background:rgba(231,76,60,0.06); border:1px solid rgba(231,76,60,0.15); border-radius:8px; padding:8px 10px;";
      const consTitle = document.createElement("div");
      consTitle.style.cssText = "font-size:0.6em; color:#e74c3c; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;";
      consTitle.textContent = "Consumed";
      consSection.appendChild(consTitle);
      const consDetails = document.createElement("div");
      consDetails.style.cssText = "font-size:0.8em; color:#e0e4e8;";
      const parts = [];
      if (summary.foodConsumed > 0) parts.push(`-${summary.foodConsumed} food`);
      if (summary.waterConsumed > 0) parts.push(`-${summary.waterConsumed} water`);
      consDetails.textContent = parts.join("  \xB7  ");
      consSection.appendChild(consDetails);
      wrap.appendChild(consSection);
    }
    content.appendChild(wrap);
    popup.style.display = "flex";
    document.getElementById("welcome-back-dismiss")?.addEventListener("click", () => {
      popup.style.display = "none";
    }, { once: true });
  }
  async function handleModFile(e, statusElId) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const customConfig = JSON.parse(text);
      if (!customConfig.items && !customConfig.events && !customConfig.resources) {
        document.getElementById(statusElId).textContent = "Invalid config: needs items, events, or resources";
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
        config.explorationLocations = [...config.explorationLocations || [], ...customConfig.explorationLocations];
      }
      if (customConfig.quests) {
        config.quests = [...config.quests || [], ...customConfig.quests];
      }
      if (customConfig.achievements) {
        config.achievements = [...config.achievements || [], ...customConfig.achievements];
      }
      document.getElementById(statusElId).textContent = `Loaded: ${file.name}`;
      logEvent(`Mod loaded: ${file.name}`);
    } catch (err) {
      document.getElementById(statusElId).textContent = "Error: Invalid JSON file";
      console.error("[mod] Failed to load mod:", err);
    }
  }
  function resetGame() {
    gameState._restarting = true;
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
    deleteSave();
    localStorage.removeItem("postapoc_tutorial_seen");
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.display = "";
      splash.classList.remove("dismissed");
      const statusText = document.getElementById("splash-status-text");
      if (statusText) statusText.textContent = "Restarting";
    }
    document.getElementById("game-container").style.display = "none";
    document.getElementById("hud").style.display = "none";
    document.getElementById("bottom-nav").style.display = "none";
    document.querySelectorAll(".popup").forEach((p) => p.style.display = "none");
    const gameOverPopup = document.getElementById("game-over-popup");
    if (gameOverPopup) gameOverPopup.style.display = "none";
    const restartPopup = document.getElementById("restart-confirm-popup");
    if (restartPopup) restartPopup.style.display = "none";
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }
  initializeGame().catch((err) => {
    console.error("[bootstrap] initializeGame failed:", err);
  });
})();
