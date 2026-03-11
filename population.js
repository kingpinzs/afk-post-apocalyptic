import { gameState, getConfig } from './gameState.js';
import { logEvent } from './ui.js';
import { getEffect } from './effects.js';

const NAMES = [
    'Ada', 'Ben', 'Clara', 'Dex', 'Eva', 'Finn', 'Grace', 'Hugo',
    'Iris', 'Jack', 'Kate', 'Leo', 'Maya', 'Noah', 'Olive', 'Paul',
    'Quinn', 'Rex', 'Sara', 'Tom', 'Uma', 'Vic', 'Willow', 'Xander',
    'Yara', 'Zane', 'Ash', 'Blake', 'Cora', 'Drew', 'Elle', 'Fox'
];

let nameIndex = 0;

function getNextName() {
    const name = NAMES[nameIndex % NAMES.length];
    nameIndex++;
    return name;
}

/**
 * Initialize population members from current population count.
 * Called when starting a new game or migrating an old save.
 */
export function initializePopulationMembers() {
    if (!gameState.populationMembers) gameState.populationMembers = [];

    // If we have population but no members, create them
    while (gameState.populationMembers.length < gameState.population) {
        gameState.populationMembers.push(createMember());
    }

    // Sync nameIndex to avoid duplicates
    nameIndex = gameState.populationMembers.length;
}

function createMember(name) {
    return {
        id: Date.now() + Math.random(),
        name: name || getNextName(),
        skills: {
            farming: 1,
            mining: 1,
            crafting: 1,
            research: 1,
            exploration: 1
        },
        health: 100,
        happiness: 50,
        assignment: null,
        sick: false,
        sickDaysRemaining: 0
    };
}

/**
 * Add a new population member (called when population grows).
 * @param {string} [name] - Optional explicit name for the member.
 * @returns {Object} The newly created member.
 */
export function addPopulationMember(name) {
    const member = createMember(name);
    gameState.populationMembers = gameState.populationMembers || [];
    gameState.populationMembers.push(member);
    return member;
}

/**
 * Remove a population member (called when someone dies/leaves).
 * Removes the sickest or lowest-health member.
 * @returns {Object|undefined} The removed member, or undefined if none.
 */
export function removePopulationMember() {
    if (gameState.populationMembers.length === 0) return;

    // Remove the sickest or lowest health member
    gameState.populationMembers.sort((a, b) => a.health - b.health);
    const removed = gameState.populationMembers.shift();
    logEvent(`${removed.name} has left the settlement.`);
    return removed;
}

/**
 * Daily population update: diseases, skill gains, happiness.
 * Should be called once per in-game day.
 */
export function updatePopulation() {
    if (!gameState.populationMembers || gameState.populationMembers.length === 0) return;

    const config = getConfig();
    const healthMult = getEffect('populationHealthMultiplier');
    const morale = getEffect('workerMoraleBoost');
    const skillMult = getEffect('populationSkillMultiplier');
    const medRate = getEffect('medicineProductionRate');
    const medEff = getEffect('medicineEffectivenessMultiplier');

    // Get difficulty settings
    let eventSeverity = 1;
    if (gameState.difficulty) {
        const preset = config.difficultyPresets?.[gameState.difficulty];
        if (preset?.eventSeverity) eventSeverity = preset.eventSeverity;
    }

    gameState.populationMembers.forEach(member => {
        // Disease check — reduced by health multiplier
        if (!member.sick && Math.random() < (0.02 * eventSeverity / Math.max(1, healthMult))) {
            member.sick = true;
            member.sickDaysRemaining = Math.ceil(3 + Math.random() * 3);
            logEvent(`${member.name} has fallen ill!`);
        }

        // Heal sick members
        if (member.sick) {
            // Medicine speeds up healing
            const healRate = 1 + (medRate * medEff);
            member.sickDaysRemaining -= healRate;

            if (member.sickDaysRemaining <= 0) {
                member.sick = false;
                member.sickDaysRemaining = 0;
                member.health = Math.min(100, member.health + 20);
                logEvent(`${member.name} has recovered!`);
            } else {
                member.health = Math.max(10, member.health - 5);
            }
        } else {
            // Natural health recovery
            member.health = Math.min(100, member.health + 1);
        }

        // Happiness update
        const baseHappiness = 50;
        const happinessTarget = baseHappiness + (morale > 1 ? (morale - 1) * 30 : 0);
        member.happiness = member.happiness + (happinessTarget - member.happiness) * 0.1;

        // Skill growth (populationSkillMultiplier from school)
        if (member.assignment) {
            const skillKey = getSkillForAssignment(member.assignment);
            if (skillKey && member.skills[skillKey] !== undefined) {
                member.skills[skillKey] += 0.01 * (skillMult > 1 ? skillMult : 1);
            }
        }
    });

    // foodSpoilageReduction (granary) — reduces food poisoning chance
    const spoilReduction = getEffect('foodSpoilageReduction');
    if (spoilReduction < 1 && Math.random() < (0.03 * eventSeverity * spoilReduction)) {
        const victim = gameState.populationMembers.find(m => !m.sick);
        if (victim) {
            victim.sick = true;
            victim.sickDaysRemaining = 2;
            logEvent(`${victim.name} got food poisoning!`);
        }
    }
}

/**
 * Map building assignments to the relevant skill type.
 * @param {string} assignment - The building/assignment id.
 * @returns {string|null} The skill key or null if unmapped.
 */
function getSkillForAssignment(assignment) {
    const map = {
        farm: 'farming',
        well: 'farming',
        orchard: 'farming',
        quarry: 'mining',
        forge: 'mining',
        sawmill: 'mining',
        library: 'research',
        school: 'research',
        observatory: 'research',
        university: 'research',
        research_lab: 'research'
    };
    return map[assignment] || null;
}

/**
 * Get count of available (non-sick) workers.
 * Falls back to raw population for saves without members array.
 * @returns {number}
 */
export function getHealthyWorkerCount() {
    if (!gameState.populationMembers || gameState.populationMembers.length === 0) {
        return gameState.population; // fallback for saves without members
    }
    return gameState.populationMembers.filter(m => !m.sick).length;
}

/**
 * Get the average skill multiplier for a given task based on all worker skills.
 * Returns 1 if no members exist (neutral multiplier).
 * @param {string} skillType - One of: farming, mining, crafting, research, exploration.
 * @returns {number}
 */
export function getWorkerSkillBonus(skillType) {
    if (!gameState.populationMembers || gameState.populationMembers.length === 0) return 1;

    // Average skill of all members for that skill type
    const total = gameState.populationMembers.reduce((sum, m) => sum + (m.skills[skillType] || 1), 0);
    return total / gameState.populationMembers.length;
}
