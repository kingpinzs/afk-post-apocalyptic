import { gameState } from './gameState.js';
import { updateDisplay } from './ui.js';
import { updateCraftableItems } from './crafting.js';
import { updateAutomationControls } from './automation.js';

export function calculatePrestigeGain() {
    return Math.floor((gameState.knowledge || 0) / 100);
}

export function resetState() {
    Object.assign(gameState, {
        food: 100,
        water: 100,
        wood: 0,
        stone: 0,
        clay: 0,
        fiber: 0,
        ore: 0,
        herbs: 0,
        fruit: 0,
        knowledge: 0,
        population: 1,
        workers: 0,
        day: 1,
        time: 0,
        craftedItems: {},
        automationAssignments: {},
        availableWorkers: 0,
        gatherCount: 0,
        studyCount: 0,
        craftCount: 0,
        daysSinceGrowth: 0,
        dailyFoodConsumed: 0,
        dailyWaterConsumed: 0
    });
}

export function prestigeGame() {
    const gain = calculatePrestigeGain();
    if (gain <= 0) {
        alert('You need at least 100 knowledge to prestige.');
        return;
    }
    gameState.prestigePoints = (gameState.prestigePoints || 0) + gain;
    resetState();
    updateCraftableItems();
    updateAutomationControls();
    updateDisplay();
}
