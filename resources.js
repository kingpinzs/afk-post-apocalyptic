import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay, updateWorkingSection, showUnlockPuzzle, showItemUnlockPuzzle, findNextItemUnlock } from './ui.js';
import { updateAutomationControls } from './automation.js';
import { updateCraftableItems } from './crafting.js';
import { playGather, playStudy, playUnlock } from './audio.js';
import { getEffect } from './effects.js';

let activeIntervals = [];
// Tracks how many workers are actively gathering each resource
const gatherWorkers = new Map();

function trackInterval(id) {
    activeIntervals.push(id);
}

function untrackInterval(id) {
    activeIntervals = activeIntervals.filter(i => i !== id);
}

export function clearActiveIntervals() {
    activeIntervals.forEach(id => clearInterval(id));
    activeIntervals = [];
    gatherWorkers.clear();
}

export function getGatherCount(resource) {
    return gatherWorkers.get(resource) || 0;
}

export function resetGathering() {
    gatherWorkers.clear();
    const config = getConfig();
    config.resources.forEach(resource => {
        const button = document.getElementById(`gather-${resource}`);
        if (button) {
            button.disabled = false;
            delete button.dataset.gathering;
        }
        const barsContainer = document.getElementById(`${resource}-bars`);
        if (barsContainer) {
            while (barsContainer.firstChild) barsContainer.removeChild(barsContainer.firstChild);
        }
    });
}

// Worker bar colors — distinct, visible on dark backgrounds
const WORKER_COLORS = [
    '#00ffff', '#ff6b35', '#39ff14', '#ff3cac',
    '#ffe66d', '#7b68ee', '#ff4757', '#2ed573',
    '#1e90ff', '#ffa502'
];
let workerColorIndex = 0;

export function gatherResource(resource) {
    if (gameState.availableWorkers <= 0) {
        logEvent("No available workers to gather resources.");
        return;
    }

    // Don't gather if resource is already at cap
    if (gameState[resource] >= getResourceCap(resource)) return;

    const button = document.getElementById(`gather-${resource}`);

    // Assign worker
    gameState.availableWorkers--;
    gatherWorkers.set(resource, (gatherWorkers.get(resource) || 0) + 1);
    gameState.activeWork.push({ type: 'gathering', resource: resource });
    updateWorkingSection();

    // Disable button only if no more idle workers or resource capped
    if (gameState.availableWorkers <= 0 || gameState[resource] >= getResourceCap(resource)) {
        button.disabled = true;
    }
    updateDisplay();

    // Create individual progress bar for this worker (z-stacked / overlapping)
    const color = WORKER_COLORS[workerColorIndex % WORKER_COLORS.length];
    workerColorIndex++;
    const barContainer = document.getElementById(`${resource}-bars`);
    // Ensure container is set up for stacking
    if (!barContainer.dataset.stacked) {
        barContainer.style.cssText += 'position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;';
        barContainer.dataset.stacked = '1';
    }
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;top:0;left:0;height:100%;width:0%;border-radius:4px;background:${color};opacity:0.7;transition:width 0.1s linear;`;
    barContainer.appendChild(fill);

    let progress = 0;
    const interval = 100;
    const duration = getGatheringTime(resource);

    const progressInterval = setInterval(() => {
        // Stop gathering if game over mid-gather
        if (gameState.isGameOver) {
            clearInterval(progressInterval);
            untrackInterval(progressInterval);
            _returnGatherWorker(resource);
            fill.remove();
            button.disabled = true;
            updateWorkingSection();
            return;
        }

        progress += interval;
        const percentage = Math.min(100, (progress / duration) * 100);
        fill.style.width = `${percentage}%`;

        if (progress >= duration) {
            clearInterval(progressInterval);
            untrackInterval(progressInterval);
            _returnGatherWorker(resource);
            fill.remove();
            completeGathering(resource);
        }
    }, interval);
    trackInterval(progressInterval);
}

function _returnGatherWorker(resource) {
    const count = gatherWorkers.get(resource) || 1;
    if (count <= 1) {
        gatherWorkers.delete(resource);
    } else {
        gatherWorkers.set(resource, count - 1);
    }
}

function getGatheringTime(resource) {
    const config = getConfig();
    let time = config.gatheringTimes[resource];
    const multiplier = getToolMultiplier(resource);
    if (multiplier > 1) {
        time /= multiplier;
    }
    time /= (gameState.gatheringEfficiency || 1);

    // toolEfficiencyMultiplier (blacksmith) — global gathering speed bonus
    const toolEff = getEffect('toolEfficiencyMultiplier');
    if (toolEff > 1) time /= toolEff;

    // productivityMultiplier (brewery) — global gathering bonus
    const productivity = getEffect('productivityMultiplier');
    if (productivity > 1) time /= productivity;

    // Apply difficulty modifier if set
    if (gameState.difficulty) {
        const config2 = getConfig();
        const preset = config2.difficultyPresets?.[gameState.difficulty];
        if (preset?.gatheringBonus) time /= preset.gatheringBonus;
    }

    return Math.max(500, time); // Minimum 0.5s gathering time
}

function getToolMultiplier(resource) {
    // Check all crafted items for gathering multipliers that match this resource
    const multiplierKeys = {
        wood: 'woodGatheringMultiplier',
        stone: 'stoneGatheringMultiplier',
        ore: 'oreGatheringMultiplier',
        food: 'foodGatheringMultiplier'
    };
    const key = multiplierKeys[resource];
    if (!key) return 1;

    let multiplier = getEffect(key);

    // meatGatheringMultiplier (hunting_lodge) stacks with food
    if (resource === 'food') {
        multiplier *= getEffect('meatGatheringMultiplier');
    }

    return multiplier;
}

function completeGathering(resource) {
    let amount = getToolMultiplier(resource);
    amount = Math.max(1, Math.round(amount));

    addResource(resource, amount);
    logEvent(`Gathered ${amount} ${resource}.`);
    playGather();

    // Track stats for achievements
    gameState.stats.totalGathered = (gameState.stats.totalGathered || 0) + amount;

    gameState.availableWorkers++;

    // Remove ONE matching entry from activeWork (not all)
    const idx = gameState.activeWork.findIndex(w => w.type === 'gathering' && w.resource === resource);
    if (idx !== -1) gameState.activeWork.splice(idx, 1);

    updateDisplay();
    updateCraftableItems();
    updateWorkingSection();
}

export function consumeResources(meals = 1) {
    // Use effect engine for resource consumption multiplier
    const consumptionMult = getEffect('resourceConsumptionMultiplier');

    // waterEfficiencyMultiplier (irrigation) reduces water consumption
    const waterEfficiency = getEffect('waterEfficiencyMultiplier');

    // Apply difficulty modifier
    let difficultyMult = 1;
    if (gameState.difficulty) {
        const config = getConfig();
        const preset = config.difficultyPresets?.[gameState.difficulty];
        if (preset?.consumptionMultiplier) difficultyMult = preset.consumptionMultiplier;
    }

    // Diminishing per-capita cost: base * sqrt(population)
    const BASE_FOOD = 3;
    const BASE_WATER = 2;
    const pop = gameState.population;
    const foodConsumption = Math.min(gameState.food, (BASE_FOOD * Math.sqrt(pop) * consumptionMult * difficultyMult) / meals);
    const waterMult = waterEfficiency > 1 ? consumptionMult / waterEfficiency : consumptionMult;
    const waterConsumption = Math.min(gameState.water, (BASE_WATER * Math.sqrt(pop) * waterMult * difficultyMult) / meals);

    gameState.food -= foodConsumption;
    gameState.water -= waterConsumption;
}

/**
 * Per-resource storage cap. Applies global storehouse multiplier
 * plus resource-specific multipliers (granary for food, pottery for water).
 *
 * @param {string} [resource] - Optional resource name for per-resource bonuses.
 * @returns {number} The cap for the given resource.
 */
export function getResourceCap(resource) {
    const config = getConfig();
    const tiers = config.resourceCapTiers;
    let cap = 100;

    if (tiers) {
        for (const tier of tiers) {
            if (!tier.requires || gameState.unlockedFeatures.includes(tier.requires)) {
                cap = tier.cap;
                break;
            }
        }
    }

    // Global storage multiplier (storehouse)
    cap *= getEffect('storageCapacityMultiplier');

    // Per-resource storage multipliers
    if (resource === 'food') {
        cap *= getEffect('foodStorageMultiplier');
    } else if (resource === 'water') {
        cap *= getEffect('waterStorageMultiplier');
    }

    return cap;
}

export function addResource(resource, amount) {
    const cap = getResourceCap(resource);
    gameState[resource] += amount;
    // Cap all gathering resources (knowledge is uncapped)
    if (resource !== 'knowledge') {
        gameState[resource] = Math.min(gameState[resource], cap);
    }
}

export function capResources() {
    const config = getConfig();
    config.resources.forEach(resource => {
        const cap = getResourceCap(resource);
        gameState[resource] = Math.min(gameState[resource], cap);
    });
}

export function checkPopulationGrowth() {
    const config = getConfig();
    let threshold = config.constants.POPULATION_THRESHOLD;

    // populationCapacityMultiplier (metropolis) — caps max population.
    // Sandbox mode bypasses the cap so the player can keep growing freely.
    const maxPop = Math.floor(10 * getEffect('populationCapacityMultiplier'));
    if (!gameState.sandboxMode && gameState.population >= maxPop) return;

    // populationHealthMultiplier (apothecary, aqueduct, hospital) — reduces growth threshold
    const healthMult = getEffect('populationHealthMultiplier');
    if (healthMult > 1) threshold = Math.max(10, Math.floor(threshold / healthMult));

    // immigrationRate (monument) — passive daily growth chance independent of resources
    const immigrationRate = getEffect('immigrationRate');
    if (immigrationRate > 0 && Math.random() < immigrationRate && gameState.population < maxPop) {
        gameState.population += 1;
        gameState.availableWorkers += 1;
        logEvent("A new settler has arrived, attracted by your settlement!");
        updateAutomationControls();
    }

    // Standard resource-based growth
    if (gameState.food >= threshold && gameState.water >= threshold) {
        // populationHappinessMultiplier — makes growth probabilistic when > 1
        const happinessMult = getEffect('populationHappinessMultiplier');
        if (happinessMult > 1) {
            const chance = Math.min(1, happinessMult * 0.5);
            if (Math.random() > chance) return; // Happiness roll failed
        }

        gameState.population += 1;
        gameState.availableWorkers += 1;
        gameState.food -= threshold;
        gameState.water -= threshold;
        logEvent("The population has grown! You have a new available worker.");
        updateAutomationControls();
    }
}

export function study() {
    if (gameState.studyGate) {
        logEvent("Gather the new resources before studying again.");
        return;
    }
    if (gameState.availableWorkers <= 0) {
        logEvent("No available workers to study.");
        return;
    }

    gameState.availableWorkers--;
    gameState.activeWork.push({ type: 'studying' });
    updateWorkingSection();
    updateDisplay();

    let progress = 0;
    const interval = 100;
    let duration = 5000;

    // knowledgeGenerationMultiplier (library, school, observatory)
    const knowledgeMult = getEffect('knowledgeGenerationMultiplier');
    if (knowledgeMult > 1) duration /= knowledgeMult;

    // researchSpeedMultiplier (scriptorium, university, research_lab) — stacks
    const researchSpeed = getEffect('researchSpeedMultiplier');
    if (researchSpeed > 1) duration /= researchSpeed;

    duration = Math.max(200, duration); // Minimum 0.2s study time

    const studyInterval = setInterval(() => {
        progress += interval;
        updateWorkingSection();

        if (progress >= duration) {
            clearInterval(studyInterval);
            untrackInterval(studyInterval);

            let knowledgeGained = 1;

            // knowledgeSpreadMultiplier (printing_press) — multiplies knowledge gained
            const spreadMult = getEffect('knowledgeSpreadMultiplier');
            if (spreadMult > 1) knowledgeGained = Math.round(knowledgeGained * spreadMult);

            // knowledgeEfficiencyMultiplier (paper_mill) — chance for +1 bonus
            const efficiencyMult = getEffect('knowledgeEfficiencyMultiplier');
            if (efficiencyMult > 1 && Math.random() < (efficiencyMult - 1)) {
                knowledgeGained += 1;
            }

            gameState.knowledge += knowledgeGained;
            gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
            logEvent(`Studied the book. Gained ${knowledgeGained} knowledge point${knowledgeGained > 1 ? 's' : ''}.`);
            playStudy();

            // Track stats for achievements
            gameState.stats.totalStudied = (gameState.stats.totalStudied || 0) + knowledgeGained;

            gameState.availableWorkers++;
            gameState.activeWork = gameState.activeWork.filter(w => w.type !== 'studying');
            updateDisplay();
            updateWorkingSection();

            const config = getConfig();

            // Set study gate on currently unlocked gathering resources
            // (skips naturally on first study since only food/water are unlocked)
            const gatherableResources = (gameState.unlockedResources || [])
                .filter(r => r !== 'food' && r !== 'water');
            if (gatherableResources.length > 0) {
                const gateAmount = config.constants.STUDY_GATE_AMOUNT || 5;
                const gate = {};
                gatherableResources.forEach(r => { gate[r] = gateAmount; });
                gameState.studyGate = gate;
                const names = gatherableResources.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
                logEvent(`Gather ${gateAmount} of each resource (${names}) before studying again.`);
            }

            updateDisplay();

            const nextUnlock = config.unlockPuzzles.find(puzzle =>
                !gameState.unlockedFeatures.includes(puzzle.unlocks) &&
                gameState.knowledge >= puzzle.knowledgeRequired
            );
            if (nextUnlock) {
                playUnlock();
                showUnlockPuzzle(nextUnlock);
            } else {
                const nextItem = findNextItemUnlock(config);
                if (nextItem) {
                    playUnlock();
                    showItemUnlockPuzzle(nextItem);
                }
            }
        }
    }, interval);
    trackInterval(studyInterval);
}
