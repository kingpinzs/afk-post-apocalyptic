// gameState.js

export const gameState = {
    food: 100,
    water: 100,
    wood: 0,
    stone: 0,
    knowledge: 0,
    population: 1,
    unassignedPopulation: 0,
    day: 1,
    time: 0,
    craftedItems: {},
    automationAssignments: {}
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