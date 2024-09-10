let gameConfig;

export const gameState = {
    unlockedFeatures: [],
    craftedItems: {},
    automationAssignments: {},
    currentWork: null,
    craftingQueue: []
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