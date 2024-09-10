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
    const button = document.getElementById(`gather-${resource}`);
    const progressBar = document.getElementById(`${resource}-progress-bar`);
    
    if (button.disabled) return;  // If already gathering, do nothing
    
    button.disabled = true;
    let progress = 0;
    const interval = 100;  // Update every 100ms
    const duration = getGatheringTime(resource);
    
    const progressInterval = setInterval(() => {
        progress += interval;
        const percentage = (progress / duration) * 100;
        progressBar.style.width = `${percentage}%`;
        
        if (progress >= duration) {
            clearInterval(progressInterval);
            completeGathering(resource);
            button.disabled = false;
            progressBar.style.width = '0%';
        }
    }, interval);
}

function getGatheringTime(resource) {
    let time = gatheringTimes[resource];
    if (resource === 'wood' && gameState.craftedItems.axe) {
        time /= gameState.craftedItems.axe.effect.woodGatheringMultiplier;
    }
    // You can add more modifiers here based on other upgrades or skills
    return time;
}

function completeGathering(resource) {
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