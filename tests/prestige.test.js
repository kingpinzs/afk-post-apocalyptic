import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState } from '../gameState.js';
import { calculatePrestigeGain } from '../prestige.js';

function reset() {
    gameState.knowledge = 0;
}

test('calculatePrestigeGain floors result', () => {
    reset();
    gameState.knowledge = 150;
    assert.equal(calculatePrestigeGain(), 1);
    gameState.knowledge = 50;
    assert.equal(calculatePrestigeGain(), 0);
});
