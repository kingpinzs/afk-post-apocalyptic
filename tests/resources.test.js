import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState, setGameConfig } from '../gameState.js';
import { getGatheringMultiplier, getGatheringTime } from '../resources.js';

setGameConfig({
    gatheringTimes: { wood: 1000 },
    seasons: [{ gatheringEfficiency: 1 }]
});

test('getGatheringMultiplier sums effects', () => {
    gameState.craftedItems = {
        axe: { effect: { woodGatheringMultiplier: 2 } },
        gloves: { effect: { woodGatheringMultiplier: 1.5 } }
    };
    const mult = getGatheringMultiplier('wood');
    assert.equal(mult, 3);
});

test('getGatheringTime uses multipliers', () => {
    gameState.craftedItems = {
        axe: { effect: { woodGatheringMultiplier: 2 } }
    };
    gameState.gatheringEfficiency = 1;
    gameState.seasonIndex = 0;
    const time = getGatheringTime('wood');
    assert.equal(time, 500); // 1000 / 2
});
