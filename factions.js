/**
 * factions.js
 *
 * AI Factions / Diplomacy system for the post-apocalyptic survival game.
 *
 * Factions appear based on player progression triggers defined in knowledge_data.json.
 * Each faction has a trust level (0-100) that drives relationship state transitions
 * and unlocks trade agreements. Hostile factions can raid; allied factions provide
 * daily trade bonuses when a trade agreement is active.
 */

import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { addResource } from './resources.js';
import { getEffect } from './effects.js';

/** All valid relationship states in ascending order of friendliness. */
const FACTION_STATES = ['neutral', 'friendly', 'allied', 'hostile'];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Ensure the factions array exists on gameState.
 * Safe to call multiple times; only initialises if the property is absent.
 */
export function initializeFactions() {
    if (!gameState.factions) gameState.factions = [];
}

// ---------------------------------------------------------------------------
// Progression checks
// ---------------------------------------------------------------------------

/**
 * Compare current game progression against faction trigger thresholds.
 * Any faction whose trigger is newly satisfied is added to gameState.factions
 * and announced to the player in the event log.
 *
 * This should be called once per day-start.
 */
export function checkFactionAppearance() {
    const config = getConfig();
    const factionDefs = config.factions || [];
    if (factionDefs.length === 0) return;

    if (!gameState.factions) gameState.factions = [];

    factionDefs.forEach(def => {
        // Skip factions that have already appeared
        if (gameState.factions.some(f => f.id === def.id)) return;

        // Evaluate the trigger condition
        let triggered = false;
        if (def.trigger.type === 'population' && gameState.population >= def.trigger.threshold) triggered = true;
        if (def.trigger.type === 'day' && gameState.day >= def.trigger.threshold) triggered = true;
        if (def.trigger.type === 'craftedItem' && gameState.craftedItems[def.trigger.item]) triggered = true;
        if (def.trigger.type === 'knowledge' && gameState.knowledge >= def.trigger.threshold) triggered = true;

        if (triggered) {
            const faction = {
                id: def.id,
                name: def.name,
                description: def.description,
                state: 'neutral',
                trust: 50, // 0-100 scale; 50 = cautious neutral starting point
                tradeAgreement: false,
                lastInteraction: gameState.day
            };
            gameState.factions.push(faction);
            logEvent(`A new settlement has been discovered: ${def.name}!`);
        }
    });
}

// ---------------------------------------------------------------------------
// Daily updates
// ---------------------------------------------------------------------------

/**
 * Run daily faction logic: cultural drift, state transitions, trade bonuses,
 * and hostile raid attempts.
 *
 * Depends on:
 *   - culturalInfluenceMultiplier (crafted item aggregate effect)
 *   - culturalDevelopmentRate     (crafted item aggregate effect)
 *   - weaponCraftingRate          (crafted item aggregate effect, reduces raid damage)
 *
 * Should be called once per day-start, after checkFactionAppearance().
 */
/**
 * Update a faction's relationship state based on current trust level.
 */
function updateFactionState(faction) {
    if (faction.trust >= 80) {
        if (faction.state !== 'allied') {
            faction.state = 'allied';
            logEvent(`${faction.name} has become your ally!`);
        }
    } else if (faction.trust >= 60) {
        if (faction.state === 'neutral' || faction.state === 'hostile') {
            faction.state = 'friendly';
            logEvent(`Relations with ${faction.name} have improved.`);
        }
    } else if (faction.trust <= 20) {
        if (faction.state !== 'hostile') {
            faction.state = 'hostile';
            logEvent(`${faction.name} has become hostile!`);
        }
    }
}

export function updateFactions() {
    if (!gameState.factions || gameState.factions.length === 0) return;

    const culturalInfluence = getEffect('culturalInfluenceMultiplier');
    const culturalDev = getEffect('culturalDevelopmentRate');
    const weaponRate = getEffect('weaponCraftingRate');

    gameState.factions.forEach(faction => {
        // --- Cultural influence trust drift ---
        // Settlement with cultural buildings passively improves diplomatic relations.
        if (culturalInfluence > 1) {
            faction.trust = Math.min(100, faction.trust + culturalDev * 0.5);
        }

        // --- State transitions based on trust level ---
        updateFactionState(faction);

        // --- Allied trade bonuses ---
        // Allied factions with an active trade agreement send a small random
        // resource gift each day.
        if (faction.state === 'allied' && faction.tradeAgreement) {
            const tradeBonus = Math.floor(2 + Math.random() * 3);
            const resources = ['food', 'water', 'wood', 'stone'];
            const resource = resources[Math.floor(Math.random() * resources.length)];
            addResource(resource, tradeBonus);
        }

        // --- Hostile raid attempts ---
        // 10 % daily chance. Weapon infrastructure halves the resource loss.
        if (faction.state === 'hostile' && Math.random() < 0.1) {
            const defense = weaponRate > 0 ? 0.5 : 1;
            const loss = Math.floor((5 + Math.random() * 10) * defense);
            const resources = ['food', 'water', 'wood'];
            const target = resources[Math.floor(Math.random() * resources.length)];

            if ((gameState[target] || 0) > loss) {
                gameState[target] -= loss;
                logEvent(`${faction.name} raided your settlement! Lost ${loss} ${target}.`);
            } else {
                logEvent(`${faction.name} attempted a raid but found nothing worth taking.`);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Diplomatic actions
// ---------------------------------------------------------------------------

/**
 * Send a resource gift to a faction to increase trust.
 *
 * The trust gain is proportional to the amount sent (1 point per 5 units).
 * The resource is deducted from gameState immediately.
 *
 * @param {string} factionId - The faction's unique ID.
 * @param {string} resource  - Name of the resource to send (e.g. 'food').
 * @param {number} amount    - Quantity to send.
 * @returns {boolean} true when the gift was delivered, false if prerequisites
 *                    were not met (faction not found or insufficient resources).
 */
export function sendGift(factionId, resource, amount) {
    const faction = (gameState.factions || []).find(f => f.id === factionId);
    if (!faction) return false;

    if (faction.trust >= 100) {
        logEvent(`${faction.name} already trusts you fully.`);
        return false;
    }

    if ((gameState[resource] || 0) < amount) {
        logEvent(`Not enough ${resource} for a gift.`);
        return false;
    }

    gameState[resource] -= amount;
    const trustGain = Math.floor(amount / 5);
    faction.trust = Math.min(100, faction.trust + trustGain);
    faction.lastInteraction = gameState.day;

    logEvent(`Sent ${amount} ${resource} to ${faction.name}. Trust improved by ${trustGain}.`);

    // Update state immediately after trust change
    updateFactionState(faction);
    updateDisplay();
    return true;
}

/**
 * Propose a formal trade agreement to a friendly or allied faction.
 *
 * Once established the faction will send daily resource gifts (see updateFactions).
 * Requires the faction to be at least 'friendly' state.
 *
 * @param {string} factionId - The faction's unique ID.
 * @returns {boolean} true when the agreement was established, false otherwise.
 */
export function establishTradeAgreement(factionId) {
    const faction = (gameState.factions || []).find(f => f.id === factionId);
    if (!faction) return false;

    if (faction.state !== 'friendly' && faction.state !== 'allied') {
        logEvent(`${faction.name} is not interested in a trade agreement.`);
        return false;
    }

    faction.tradeAgreement = true;
    logEvent(`Trade agreement established with ${faction.name}!`);
    updateDisplay();
    return true;
}

// ---------------------------------------------------------------------------
// Read-only accessor
// ---------------------------------------------------------------------------

/**
 * Return the live factions array for UI rendering.
 * Always returns an array (empty when no factions have appeared yet).
 *
 * @returns {Array}
 */
export function getFactions() {
    return gameState.factions || [];
}
