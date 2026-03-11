let gameConfig;

export const gameState = {
    unlockedFeatures: [],
    craftedItems: {},
    automationAssignments: {},
    currentWork: null,
    craftingQueue: [],
    isGameOver: false,
    maxKnowledge: 0,
    gatheringEfficiency: 1,
    gatheringModifiers: [],
    unlockedResources: ['food', 'water'],
    studyGate: null,

    // Phase 2: Weather & Seasons
    currentSeason: 'spring',
    currentWeather: 'clear',
    seenMilestones: [],

    // Phase 3: Trading & Economy
    currency: 0,
    traderVisits: [],
    activeTrades: [],

    // Phase 4: Exploration, Quests, Achievements
    explorations: [],
    activeQuests: [],
    completedQuests: [],
    achievements: [],
    stats: {
        totalCrafted: 0,
        totalGathered: 0,
        totalStudied: 0,
        totalTraded: 0,
        totalExplored: 0
    },

    // Phase 5: Difficulty & Population
    difficulty: 'normal',
    populationMembers: [],

    // Phase 6: Prestige & Sandbox
    prestigePoints: 0,
    prestigeBonuses: {},
    sandboxMode: false,

    // Phase 7: Factions / Diplomacy
    factions: [],

    // Save versioning
    saveVersion: 1
};

export async function loadGameConfig() {
    try {
        const response = await fetch('knowledge_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        gameConfig = await response.json();

        // Initialize gameState with values from config
        Object.assign(gameState, gameConfig.initialState);
        gameState.availableWorkers = gameState.population;
    } catch (error) {
        console.error("Failed to load game configuration:", error);
    }
}

export function getConfig() {
    if (!gameConfig) {
        throw new Error("Game configuration has not been loaded yet.");
    }
    return gameConfig;
}

export function computeUnlockedResources() {
    const config = getConfig();
    const unlocks = config.resourceUnlocks;
    if (!unlocks) return [];

    const newList = [];
    for (const [resource, rule] of Object.entries(unlocks)) {
        if (rule.type === 'always') {
            newList.push(resource);
        } else if (rule.type === 'feature' && gameState.unlockedFeatures.includes(rule.requires)) {
            newList.push(resource);
        } else if (rule.type === 'item' && gameState.craftedItems[rule.requires]) {
            newList.push(resource);
        }
    }

    const prev = gameState.unlockedResources;
    const newlyUnlocked = newList.filter(r => !prev.includes(r));
    gameState.unlockedResources = newList;
    return newlyUnlocked;
}
