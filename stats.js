import { gameState } from './gameState.js';

export function ensureStats() {
    if (!gameState.stats) {
        gameState.stats = { resourcesGathered: {}, itemsCrafted: {} };
    }
    if (!gameState.stats.resourcesGathered) gameState.stats.resourcesGathered = {};
    if (!gameState.stats.itemsCrafted) gameState.stats.itemsCrafted = {};
}

export function recordResourceGain(resource, amount) {
    if (amount <= 0) return;
    ensureStats();
    gameState.stats.resourcesGathered[resource] =
        (gameState.stats.resourcesGathered[resource] || 0) + amount;
}

export function recordItemCraft(itemId) {
    ensureStats();
    gameState.stats.itemsCrafted[itemId] =
        (gameState.stats.itemsCrafted[itemId] || 0) + 1;
}
