/**
 * effects.js
 *
 * Central effect aggregation utility.
 * Replaces all ad-hoc Object.values(gameState.craftedItems).forEach(...) patterns
 * with a single function that computes the aggregate value of any effect key
 * across all crafted items.
 *
 * Two aggregation modes:
 *   - Multiplicative (keys ending in "Multiplier"): start at 1.0, multiply each
 *   - Additive (everything else — Rate, Chance, Years, Boost, etc.): start at 0, sum each
 */

import { gameState } from './gameState.js';

/**
 * Compute the aggregate value of an effect key across all crafted items.
 *
 * @param {string} effectKey  - The effect key to aggregate (e.g. 'craftingEfficiencyMultiplier')
 * @param {number} [defaultValue] - Override the base value. If omitted, multiplicative keys
 *                                  default to 1.0 and additive keys default to 0.
 * @returns {number} The aggregated effect value.
 */
export function getEffect(effectKey, defaultValue) {
    const isMultiplicative = effectKey.endsWith('Multiplier');
    const base = defaultValue !== undefined ? defaultValue : (isMultiplicative ? 1 : 0);

    let result = base;

    for (const item of Object.values(gameState.craftedItems)) {
        if (item?.effect?.[effectKey] !== undefined) {
            if (isMultiplicative) {
                result *= item.effect[effectKey];
            } else {
                result += item.effect[effectKey];
            }
        }
    }

    return result;
}

/**
 * Check whether any crafted item provides a specific effect key.
 *
 * @param {string} effectKey
 * @returns {boolean}
 */
export function hasEffect(effectKey) {
    for (const item of Object.values(gameState.craftedItems)) {
        if (item?.effect?.[effectKey] !== undefined) {
            return true;
        }
    }
    return false;
}
