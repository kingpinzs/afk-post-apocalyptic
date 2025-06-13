import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState, getPrestigeMultiplier, adjustAvailableWorkers, setGameConfig } from '../gameState.js';

// Setup minimal config for tests
setGameConfig({});

// Reset gameState before each test
function resetState() {
    for (const key of Object.keys(gameState)) {
        if (typeof gameState[key] === 'number') {
            gameState[key] = 0;
        } else if (Array.isArray(gameState[key])) {
            gameState[key] = [];
        } else if (typeof gameState[key] === 'object') {
            gameState[key] = {};
        } else {
            gameState[key] = null;
        }
    }
}

test('adjustAvailableWorkers respects limits', () => {
    resetState();
    gameState.workers = 5;
    gameState.availableWorkers = 3;
    adjustAvailableWorkers(-2);
    assert.equal(gameState.availableWorkers, 1);
    adjustAvailableWorkers(10);
    assert.equal(gameState.availableWorkers, 5);
});

test('getPrestigeMultiplier uses prestige points and items', () => {
    resetState();
    gameState.prestigePoints = 5; // base multiplier 1 + 0.5 = 1.5
    gameState.craftedItems = {
        testItem: { effect: { globalPrestigeMultiplier: 2 } }
    };
    const mult = getPrestigeMultiplier();
    assert.equal(mult, 3); // 1.5 * 2
});
