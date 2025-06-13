let gameConfig;

export const gameState = {
    unlockedFeatures: [],
    craftedItems: {},
    automationAssignments: {},
    automationProgress: {},
    currentWork: null,
    craftingQueue: [],
    currentBookIndex: 0,
    workers: 0,
    gatherCount: 0,
    studyCount: 0,
    craftCount: 0,
    daysSinceGrowth: 0,
    dailyFoodConsumed: 0,
    dailyWaterConsumed: 0,
    lastSaved: null,
    prestigePoints: 0,
    achievements: {}
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
        if (!gameState.achievements) gameState.achievements = {};
        gameState.availableWorkers = gameState.workers;
        gameState.automationProgress = {};
        gameState.dailyFoodConsumed = 0;
        gameState.dailyWaterConsumed = 0;
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

export function adjustAvailableWorkers(delta) {
    gameState.availableWorkers = Math.max(
        0,
        Math.min(gameState.availableWorkers + delta, gameState.workers)
    );
}

export function getPrestigeMultiplier() {
    let mult = 1 + (gameState.prestigePoints || 0) * 0.1;
    Object.values(gameState.craftedItems).forEach(item => {
        if (item.effect && item.effect.globalPrestigeMultiplier) {
            mult *= item.effect.globalPrestigeMultiplier;
        }
    });
    return mult;
}