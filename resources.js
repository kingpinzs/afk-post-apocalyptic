import { gameState, getConfig, adjustAvailableWorkers, getPrestigeMultiplier } from './gameState.js';
import { logEvent, updateDisplay, updateWorkingSection, showUnlockPuzzle } from './ui.js';
import { checkAchievements } from './achievements.js';
import { recordResourceGain } from './stats.js';
import { updateAutomationControls } from './automation.js';
import { updateCraftableItems, areDependenciesMet } from './crafting.js';

export function getGatheringMultiplier(resource) {
    return Object.values(gameState.craftedItems).reduce((mult, item) => {
        if (item.effect) {
            const key = `${resource}GatheringMultiplier`;
            if (item.effect[key]) {
                mult *= item.effect[key];
            }
        }
        return mult;
    }, 1);
}


export function gatherResource(resource) {
    const config = getConfig();
    if (gameState.availableWorkers === 0) {
        logEvent("No available workers to gather resources.");
        return;
    }

    const button = document.getElementById(`gather-${resource}`);
    const progressBar = button.querySelector('.progress-bar');
    
    if (button.disabled) return;  // If already gathering, do nothing
    
    button.disabled = true;
    adjustAvailableWorkers(-1);
    gameState.currentWork = { type: 'gathering', resource: resource };
    updateWorkingSection();

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

export function getGatheringTime(resource) {
    const config = getConfig();
    let time = config.gatheringTimes[resource];
    time /= getGatheringMultiplier(resource);
    // Apply gathering efficiency modifier from events
    time /= (gameState.gatheringEfficiency || 1);
    const season = config.seasons[gameState.seasonIndex] || {};
    if (season.gatheringEfficiency) {
        time /= season.gatheringEfficiency;
    }
    // You can add more modifiers here based on other upgrades or skills
    return time;
}

export function getGatheringRate(resource) {
    return getGatheringMultiplier(resource) / (getGatheringTime(resource) / 1000);
}

export function scavenge() {
    if (gameState.availableWorkers === 0) {
        logEvent("No available workers to scavenge.");
        return;
    }

    const button = document.getElementById('scavenge');
    const progressBar = button.querySelector('.progress-bar');
    if (button.disabled) return;

    button.disabled = true;
    adjustAvailableWorkers(-1);
    gameState.currentWork = { type: 'scavenging' };
    updateWorkingSection();

    let progress = 0;
    const interval = 100;
    const duration = 4000;
    const progressInterval = setInterval(() => {
        progress += interval;
        progressBar.style.width = `${(progress / duration) * 100}%`;
        if (progress >= duration) {
            clearInterval(progressInterval);
            completeScavenge();
            button.disabled = false;
            progressBar.style.width = '0%';
        }
    }, interval);
}

function completeScavenge() {
    const rewards = ['wood', 'stone', 'food', 'water'];
    const resource = rewards[Math.floor(Math.random() * rewards.length)];
    const amount = Math.round((Math.random() * 2 + 1) * getPrestigeMultiplier());
    gameState[resource] = (gameState[resource] || 0) + amount;
    recordResourceGain(resource, amount);
    logEvent(`Scavenged ${amount} ${resource}.`);
    adjustAvailableWorkers(1);
    gameState.currentWork = null;
    updateDisplay();
    updateCraftableItems();
    updateWorkingSection();
    gameState.gatherCount += 1;
    checkAchievements();
}

function completeGathering(resource) {
    let amount = getGatheringMultiplier(resource);

    // Apply gathering efficiency modifier
    amount *= (gameState.gatheringEfficiency || 1);
    amount *= getPrestigeMultiplier();
    
    // Round the amount to avoid fractional resources
    amount = Math.round(amount);

    gameState[resource] += amount;
    recordResourceGain(resource, amount);
    logEvent(`Gathered ${amount} ${resource}.`);

    adjustAvailableWorkers(1);
    gameState.currentWork = null;
    
    updateDisplay();
    updateCraftableItems();
    updateWorkingSection();
    gameState.gatherCount += 1;
    checkAchievements();
}


export function consumeResources(seconds = 1) {
    const config = getConfig();
    const dailyRate = gameState.craftedItems.shelter ? 0.5 : 1;
    const season = config.seasons[gameState.seasonIndex] || {};
    const ratePerSecond = (dailyRate * gameState.population) / config.constants.DAY_LENGTH;
    const amount = ratePerSecond * seconds * (season.consumption || 1);

    const foodConsumed = Math.min(gameState.food, amount);
    const waterConsumed = Math.min(gameState.water, amount);

    gameState.food -= foodConsumed;
    gameState.water -= waterConsumed;

    gameState.dailyFoodConsumed += foodConsumed;
    gameState.dailyWaterConsumed += waterConsumed;
}

export function logDailyConsumption() {
    logEvent(`Consumed ${gameState.dailyFoodConsumed.toFixed(1)} food and ${gameState.dailyWaterConsumed.toFixed(1)} water for the day.`);
    gameState.dailyFoodConsumed = 0;
    gameState.dailyWaterConsumed = 0;
}


export function produceResources() {
    const mult = getPrestigeMultiplier();
    const season = getConfig().seasons[gameState.seasonIndex] || {};
    if (gameState.craftedItems.farm) {
        const base = gameState.craftedItems.farm.effect.foodProductionRate;
        const foodProduced = base * (gameState.automationAssignments.farm || 0) * mult * (season.production || 1);
        gameState.food += foodProduced;
        recordResourceGain('food', foodProduced);
        logEvent(`Farm produced ${foodProduced.toFixed(1)} food.`);
    }
    if (gameState.craftedItems.well) {
        const baseW = gameState.craftedItems.well.effect.waterProductionRate;
        const waterProduced = baseW * (gameState.automationAssignments.well || 0) * mult * (season.production || 1);
        gameState.water += waterProduced;
        recordResourceGain('water', waterProduced);
        logEvent(`Well produced ${waterProduced.toFixed(1)} water.`);
    }
    gameState.food = Math.min(gameState.food, 100);
    gameState.water = Math.min(gameState.water, 100);
    updateDisplay();
}

export function checkPopulationGrowth() {
    const config = getConfig();
    const threshold = config.constants.POPULATION_THRESHOLD;
    if (
        gameState.food >= threshold &&
        gameState.water >= threshold &&
        gameState.daysSinceGrowth >= config.constants.POPULATION_GROWTH_DAYS &&
        gameState.gatherCount >= config.constants.POPULATION_GATHER_REQUIRED &&
        gameState.studyCount >= config.constants.POPULATION_STUDY_REQUIRED &&
        gameState.craftCount >= config.constants.POPULATION_CRAFT_REQUIRED
    ) {
        gameState.population += 1;
        const cost = config.constants.POPULATION_GROWTH_COST;
        gameState.food = Math.max(0, gameState.food - cost);
        gameState.water = Math.max(0, gameState.water - cost);
        logEvent("Your settlement has grown! Train newcomers to put them to work.");
        gameState.gatherCount = 0;
        gameState.studyCount = 0;
        gameState.craftCount = 0;
        gameState.daysSinceGrowth = 0;
        updateAutomationControls();
        updateDisplay();
        checkAchievements();
    }
}

export function trainWorker() {
    if (gameState.population <= gameState.workers) {
        logEvent("No untrained population available.");
        return;
    }
    if (gameState.knowledge < 1) {
        logEvent("Not enough knowledge to train a worker.");
        return;
    }
    gameState.knowledge -= 1;
    gameState.workers += 1;
    adjustAvailableWorkers(1);
    logEvent("Trained a new worker.");
    updateAutomationControls();
    updateDisplay();
}

function getKnowledgeGainMultiplier() {
    return Object.values(gameState.craftedItems).reduce((mult, item) => {
        if (item.effect && item.effect.knowledgeGenerationMultiplier) {
            mult *= item.effect.knowledgeGenerationMultiplier;
        }
        return mult;
    }, 1);
}

function getResearchSpeedMultiplier() {
    return Object.values(gameState.craftedItems).reduce((mult, item) => {
        if (item.effect && item.effect.researchSpeedMultiplier) {
            mult *= item.effect.researchSpeedMultiplier;
        }
        return mult;
    }, 1);
}

function getNextUnlockPuzzle() {
    const config = getConfig();
    const puzzle = config.unlockPuzzles.find(p => !gameState.unlockedFeatures.includes(p.unlocks));
    if (puzzle) {
        return puzzle;
    }
    const nextItem = config.items.find(item => !gameState.unlockedFeatures.includes(item.id) && areDependenciesMet(item));
    if (nextItem) {
        return {
            id: `item_${nextItem.id}`,
            puzzle: nextItem.puzzle,
            answer: nextItem.puzzleAnswer,
            unlocks: nextItem.id
        };
    }
    return null;
}

export function study() {
    if (gameState.availableWorkers === 0) {
        logEvent("No available workers to study.");
        return;
    }

    adjustAvailableWorkers(-1);
    gameState.currentWork = { type: 'studying' };
    updateWorkingSection();

    const duration = 5000 / getResearchSpeedMultiplier();
    let progress = 0;
    const interval = 100;

    const progressInterval = setInterval(() => {
        progress += interval;
        updateWorkingSection(progress / duration);

        if (progress >= duration) {
            clearInterval(progressInterval);
            const knowledgeGain = 1 * getKnowledgeGainMultiplier();
            gameState.knowledge += knowledgeGain;
            logEvent(`Studied the book. Gained ${knowledgeGain.toFixed(1)} knowledge point${knowledgeGain !== 1 ? 's' : ''}.`);
            adjustAvailableWorkers(1);
            gameState.currentWork = null;
            updateDisplay();

            // Check if we should show an unlock puzzle
            const nextUnlock = getNextUnlockPuzzle();
            if (nextUnlock) {
                showUnlockPuzzle(nextUnlock);
            }
            updateWorkingSection();
            gameState.studyCount += 1;
            updateDisplay();
            checkAchievements();
        }
    }, interval); // Study time affected by research speed
}