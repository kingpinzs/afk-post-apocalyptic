export const gameState = {
    craftedItems: {},
    automationAssignments: {},
    currentWork: null,
    craftingQueue: []
};

export const CONSTANTS = {
    DAY_LENGTH: 10, // 10 minutes per day
    DAY_PHASE: 5, // 5 minutes of daylight
    POPULATION_THRESHOLD: 50 // Resources required for population growth
};

export let knowledgeData;

export function loadKnowledgeData() {
    return fetch('knowledge_data.json')
        .then(response => response.json())
        .then(data => {
            knowledgeData = data;
        });
}

export async function loadGameConfig() {
    const response = await fetch('knowledge_data.json');
    gameConfig = await response.json();
    
    // Initialize gameState with values from config
    Object.assign(gameState, gameConfig.initialState);
    gameState.availableWorkers = gameState.population;
}

export function getConfig() {
    return gameConfig;
}
