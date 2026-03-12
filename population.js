/**
 * population.js
 *
 * Population management for the post-apocalyptic survival game.
 * v2 — chain-based architecture. All resources accessed via gameState.resources.X,
 * housing from getTotalHousing(), medical building level from gameState.buildings.medical.level,
 * effects from chain-based getEffect().
 *
 * Handles:
 *   - Population member creation, initialization, and removal
 *   - Daily health/disease/recovery updates
 *   - Medicine consumption for treatment
 *   - Skill growth for assigned workers
 *   - Happiness tracking
 *   - Food spoilage sickness
 *   - Overcrowding disease spread
 */

import { gameState, getConfig, getTotalHousing } from './gameState.js';
import { logEvent } from './ui.js';
import { getEffect } from './effects.js';


// ─── Name Pool ────────────────────────────────────────────────────────────────

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


// ─── Member Creation ──────────────────────────────────────────────────────────

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


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize population members from current population count.
 * Called when starting a new game or loading a save that lacks members.
 */
export function initializePopulationMembers() {
  if (!gameState.populationMembers) gameState.populationMembers = [];

  // If we have population but not enough members, create them
  while (gameState.populationMembers.length < gameState.population) {
    gameState.populationMembers.push(createMember());
  }

  // Sync nameIndex to avoid duplicate names
  nameIndex = gameState.populationMembers.length;
}


/**
 * Add a new population member (called when population grows).
 * @param {string} [name] - Optional explicit name for the member.
 * @returns {object} The newly created member.
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
 * @returns {object|undefined} The removed member, or undefined if none.
 */
export function removePopulationMember() {
  if (!gameState.populationMembers || gameState.populationMembers.length === 0) return;

  // Remove the sickest or lowest health member
  gameState.populationMembers.sort((a, b) => a.health - b.health);
  const removed = gameState.populationMembers.shift();
  logEvent(`${removed.name} has left the settlement.`);
  return removed;
}


/**
 * Daily population update: diseases, treatment, skill gains, happiness.
 * Called once per in-game day from the game loop.
 *
 * Treatment flow:
 *   - Sick members are "in the hospital" (medical building)
 *   - Medical building consumes medicine per patient per day
 *   - Recovery based on medical building level + medicine effectiveness
 *   - No medical building = very slow natural recovery, higher death chance
 *   - No medicine = bed rest only, low effectiveness
 */
export function updatePopulation() {
  if (!gameState.populationMembers || gameState.populationMembers.length === 0) return;

  const config = getConfig();

  // ── Gather effect values from chain-based buildings ──────────────────
  const healthMult = getEffect('populationHealthMultiplier');
  const morale = getEffect('workerMoraleBoost');
  const skillMult = getEffect('populationSkillMultiplier');
  const medEff = getEffect('medicineEffectivenessMultiplier');

  // Medical building level determines treatment capacity
  const medicalLevel = gameState.buildings.medical?.level || 0;
  const treatmentCapacity = medicalLevel * 3; // 3 patients per medical level

  // ── Difficulty modifiers ────────────────────────────────────────────
  let eventSeverity = 1;
  if (gameState.difficulty) {
    const preset = config.difficultyPresets?.[gameState.difficulty];
    if (preset?.eventSeverity) eventSeverity = preset.eventSeverity;
  }

  // ── Season modifiers ───────────────────────────────────────────────
  const isWinter = gameState.currentSeason === 'winter';
  const coldSicknessBonus = isWinter ? 0.02 : 0;

  // ── Housing check for overcrowding ─────────────────────────────────
  const totalHousing = getTotalHousing();
  const isOvercrowded = totalHousing > 0 && gameState.population > totalHousing * 1.5;
  const overcrowdingBonus = isOvercrowded ? 0.03 : 0;

  // Track how many patients we can treat this day
  let patientsBeingTreated = 0;

  gameState.populationMembers.forEach(member => {
    // ── Disease Check ───────────────────────────────────────────────
    // Base 2% chance, modified by health multiplier, difficulty, winter cold, overcrowding
    if (!member.sick) {
      const sickChance = (0.02 + coldSicknessBonus + overcrowdingBonus) * eventSeverity / Math.max(1, healthMult);
      if (Math.random() < sickChance) {
        member.sick = true;
        member.sickDaysRemaining = Math.ceil(3 + Math.random() * 3);
        if (gameState.availableWorkers > 0) gameState.availableWorkers--;
        logEvent(`${member.name} has fallen ill!`);
      }
    }

    // ── Treatment / Recovery ────────────────────────────────────────
    if (member.sick) {
      let healRate = 0.3; // Very slow natural recovery (no medical building)

      if (medicalLevel > 0 && patientsBeingTreated < treatmentCapacity) {
        // Patient is being treated in medical building
        patientsBeingTreated++;

        // Consume medicine if available
        const hasMedicine = (gameState.resources.medicine || 0) >= 1;
        if (hasMedicine) {
          gameState.resources.medicine -= 1;
          // Full treatment: medical level + medicine effectiveness
          healRate = 1 + (medicalLevel * 0.5 * (medEff > 0 ? medEff : 1));
        } else {
          // Bed rest only (medical building but no medicine)
          healRate = 0.5 + (medicalLevel * 0.2);
        }
      }
      // Else: no medical building or over capacity — very slow natural recovery

      member.sickDaysRemaining -= healRate;

      if (member.sickDaysRemaining <= 0) {
        member.sick = false;
        member.sickDaysRemaining = 0;
        member.health = Math.min(100, member.health + 20);
        gameState.availableWorkers++;
        logEvent(`${member.name} has recovered!`);
      } else {
        // Ongoing sickness damages health
        member.health = Math.max(10, member.health - 5);

        // Death chance for untreated sick members (no medical building or no medicine)
        if (medicalLevel === 0 && member.health <= 20 && Math.random() < 0.1 * eventSeverity) {
          // Remove this member (death)
          member.health = 0;
          member.markedForRemoval = true;
          gameState.population = Math.max(0, gameState.population - 1);
          logEvent(`${member.name} has died from untreated illness.`, 'danger');
        }
      }
    } else {
      // Natural health recovery for healthy members
      member.health = Math.min(100, member.health + 1);
    }

    // ── Happiness Update ────────────────────────────────────────────
    const baseHappiness = 50;
    const moraleBoost = morale > 0 ? morale * 10 : 0;

    // Food and water satisfaction (0-1 scale)
    const foodSatisfaction = Math.min(1, (gameState.resources.food || 0) / Math.max(1, gameState.population * 2));
    const waterSatisfaction = Math.min(1, (gameState.resources.water || 0) / Math.max(1, gameState.population * 2));
    const needsSatisfaction = (foodSatisfaction + waterSatisfaction) / 2;

    const happinessTarget = baseHappiness + moraleBoost + (needsSatisfaction * 20) - (member.sick ? 20 : 0);
    member.happiness = member.happiness + (happinessTarget - member.happiness) * 0.1;
    member.happiness = Math.max(0, Math.min(100, member.happiness));

    // ── Skill Growth ────────────────────────────────────────────────
    // Workers assigned to tasks gain skill over time
    if (member.assignment && !member.sick) {
      const skillKey = getSkillForAssignment(member.assignment);
      if (skillKey && member.skills[skillKey] !== undefined) {
        const growthRate = 0.01 * (skillMult > 0 ? Math.max(1, skillMult) : 1);
        member.skills[skillKey] += growthRate;
      }
    }
  });

  // ── Remove dead members ───────────────────────────────────────────
  gameState.populationMembers = gameState.populationMembers.filter(m => !m.markedForRemoval);

  // ── Food Spoilage Check (Granary effect) ──────────────────────────
  const spoilReduction = getEffect('foodSpoilageReduction');
  // If no granary (spoilReduction = 0), use base food poisoning rate
  const spoilChance = spoilReduction > 0
    ? 0.03 * eventSeverity * (1 - spoilReduction)  // Granary reduces chance
    : 0.03 * eventSeverity;                          // No granary: full chance

  if (Math.random() < spoilChance) {
    const victim = gameState.populationMembers.find(m => !m.sick);
    if (victim) {
      victim.sick = true;
      victim.sickDaysRemaining = 2;
      if (gameState.availableWorkers > 0) gameState.availableWorkers--;
      logEvent(`${victim.name} got food poisoning!`);
    }
  }

  // ── Unhappiness Departure ─────────────────────────────────────────
  // If happiness < 20, there's a chance a member leaves (not death)
  const unhappyMembers = gameState.populationMembers.filter(m => m.happiness < 20 && !m.sick);
  for (const member of unhappyMembers) {
    if (Math.random() < 0.05 * eventSeverity && gameState.population > 1) {
      gameState.populationMembers = gameState.populationMembers.filter(m => m.id !== member.id);
      gameState.population = Math.max(1, gameState.population - 1);
      if (gameState.availableWorkers > 0) gameState.availableWorkers--;
      logEvent(`${member.name} left the settlement due to unhappiness.`, 'warning');
      break; // Only one departure per day
    }
  }
}


// ─── Assignment → Skill Mapping ───────────────────────────────────────────────

/**
 * Map building/chain assignments to the relevant skill type.
 * Supports both old-style assignment names and new chain IDs.
 *
 * @param {string} assignment - The building/assignment id.
 * @returns {string|null} The skill key or null if unmapped.
 */
function getSkillForAssignment(assignment) {
  const map = {
    // Food production chains
    food_farming: 'farming',
    food_hunting: 'farming',
    food_fishing: 'farming',
    farming: 'farming',
    hunting: 'farming',
    fishing: 'farming',
    water: 'farming',
    // Old-style names
    farm: 'farming',
    well: 'farming',
    orchard: 'farming',
    // Mining / processing
    quarry: 'mining',
    forge: 'mining',
    sawmill: 'mining',
    kiln: 'mining',
    // Research
    library: 'research',
    school: 'research',
    observatory: 'research',
    university: 'research',
    research_lab: 'research',
    knowledge: 'research',
    // Exploration
    exploration: 'exploration',
    // Crafting
    workbench: 'crafting',
    loom: 'crafting',
    tannery: 'crafting',
    glassworks: 'crafting',
    charcoal_pit: 'crafting',
    herbalist_hut: 'crafting',
    paper_mill: 'crafting'
  };
  return map[assignment] || null;
}


// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get count of available (non-sick) workers.
 * Falls back to raw population for saves without members array.
 * @returns {number}
 */
export function getHealthyWorkerCount() {
  if (!gameState.populationMembers || gameState.populationMembers.length === 0) {
    return gameState.population;
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

  const total = gameState.populationMembers.reduce((sum, m) => sum + (m.skills[skillType] || 1), 0);
  return total / gameState.populationMembers.length;
}
