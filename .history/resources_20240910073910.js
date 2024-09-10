// resources.js

import { gameState, CONSTANTS } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';

export function gatherResource(resource) {
    let amount = 1;
    if (resource === 'wood' && gameState.craftedItems.axe) {
        amount = gameState.craftedItems.axe.effect.woodGatheringMultiplier;
    }
    gameState[resource] += amount;
    logEvent(`Gathered ${amount} ${resource}.`);
    updateDisplay();
}

export function consumeResources() {
    const consumptionRate = gameState.craftedItems.shelter ? 0.5 : 1;
    gameState.food -= consumptionRate * gameState.population;
    gameState.water -= consumptionRate * gameState.population;
    gameState.food = Math.max(0, Math.min(gameState.food, 100));
    gameState.water = Math.max(0, Math.min(gameState.water, 100));
    logEvent(`Consumed ${consumptionRate * gameState.population} food and ${consumptionRate * gameState.population} water for the day.`);
}

export function produceResources() {
    if (gameState.craftedItems.farm) {
        gameState.food += gameState.craftedItems.farm.effect.foodProductionRate * (gameState.automationAssignments.farm || 0);
        logEvent(`Farm produced ${gameState.craftedItems.farm.effect.foodProductionRate * (gameState.automationAssignments.farm || 0)} food.`);
    }
    if (gameState.craftedItems.well) {
        gameState.water += gameState.craftedItems.well.effect.waterProductionRate * (gameState.automationAssignments.well || 0);
        logEvent(`Well produced ${gameState.craftedItems.well.effect.waterProductionRate * (gameState.automationAssignments.well || 0)} water.`);
    }
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