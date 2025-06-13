import { gameState } from './gameState.js';
import { recordResourceGain } from './stats.js';

export function changeResource(resource, amount) {
    if (!Object.prototype.hasOwnProperty.call(gameState, resource)) {
        gameState[resource] = 0;
    }
    gameState[resource] += amount;
    if (amount > 0) {
        recordResourceGain(resource, amount);
    }
    return gameState[resource];
}

export function addResource(resource, amount) {
    return changeResource(resource, amount);
}

export function subtractResource(resource, amount) {
    return changeResource(resource, -amount);
}

export function getResource(resource) {
    return gameState[resource] || 0;
}
