import { gameState, CONSTANTS } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { updateAutomationControls } from './automation.js';
import { updateCraftableItems } from './crafting.js';

const gatheringTimes = {
    wood: 5000,  // 5 seconds
    stone: 7000, // 7 seconds
    food: 3000,  // 3 seconds
    water: 2000  // 2 seconds
};

const gatheringProgresses = {
    wood: 0,
    stone: 0,
    food: 0,
    water: 0
};

export function gatherResource(resource) {
    let amount = 1;
    if (resource === 'wood' && gameState.craftedItems.axe) {
        amount = gameState.craftedItems.axe.effect.woodGatheringMultiplier;
    }
    gameState[resource] += amount;
    logEvent(`Gathered ${amount} ${resource}.`);
    updateDisplay();
    updateCraftableItems();
}

export function consumeResources() {
    const consumptionRate = gameState.craftedItems.shelter ? 0.5 : 1;
    const foodConsumption = Math.min(gameState.food, consumptionRate * gameState.population);
    const waterConsumption = Math.min(gameState.water, consumptionRate * gameState.population);
    
    gameState.food -= foodConsumption;
    gameState.water -= waterConsumption;
    
    logEvent(`Consumed ${foodConsumption.toFixed(1)} food and ${waterConsumption.toFixed(1)} water for the day.`);
}

export function produceResources() {
    if (gameState.craftedItems.farm) {
        const foodProduced = gameState.craftedItems.farm.effect.foodProductionRate * (gameState.automationAssignments.farm || 0);
        gameState.food += foodProduced;
        logEvent(`Farm produced ${foodProduced.toFixed(1)} food.`);
    }
    if (gameState.craftedItems.well) {
        const waterProduced = gameState.craftedItems.well.effect.waterProductionRate * (gameState.automationAssignments.well || 0);
        gameState.water += waterProduced;
        logEvent(`Well produced ${waterProduced.toFixed(1)} water.`);
    }
    gameState.food = Math.min(gameState.food, 100);
    gameState.water = Math.min(gameState.water, 100);
}

export function checkPopulationGrowth() {
    if (gameState.food >= CONSTANTS.POPULATION_THRESHOLD && gameState.water >= CONSTANTS.POPULATION_THRESHOLD) {
        gameState.population += 1;
        gameState.unassignedPopulation += 1;
        gameState.food -= CONSTANTS.POPULATION_THRESHOLD;
        gameState.water -= CONSTANTS.POPULATION_THRESHOLD;
        logEvent("The population has grown! You have a new unassigned worker.");
        updateAutomationControls();
    }
}

export function study() {
    gameState.knowledge += 1;
    logEvent('Studied the book. Gained 1 knowledge point.');
    updateDisplay();
    updateCraftableItems();
}