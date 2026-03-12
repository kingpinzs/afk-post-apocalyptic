import { gameState, getConfig, computeUnlockedResources } from './gameState.js';
import { logEvent, updateDisplay, updateWorkingSection, showVictory, updateGatheringVisibility } from './ui.js';
import { updateAutomationControls } from './automation.js';
import { playCraft, playVictory, playUnlock } from './audio.js';
import { getEffect } from './effects.js';

let craftingInProgress = false;
let craftingIntervalId = null;

const TIERS = [
    { name: 'Survival', maxCost: 50, cssClass: 'tier-1' },
    { name: 'Settlement', maxCost: 100, cssClass: 'tier-2' },
    { name: 'Village', maxCost: 250, cssClass: 'tier-3' },
    { name: 'Town', maxCost: 500, cssClass: 'tier-4' },
    { name: 'Civilization', maxCost: Infinity, cssClass: 'tier-5' }
];

function getItemTier(item) {
    const totalCost = Object.values(item.requirements).reduce((a, b) => a + b, 0);
    return TIERS.find(t => totalCost < t.maxCost);
}

function formatEffect(effect) {
    const labels = {
        foodProductionRate: 'Food production',
        waterProductionRate: 'Water production',
        woodGatheringMultiplier: 'Wood gathering',
        stoneGatheringMultiplier: 'Stone gathering',
        oreGatheringMultiplier: 'Ore gathering',
        foodGatheringMultiplier: 'Food gathering',
        resourceConsumptionMultiplier: 'Resource consumption',
        storageCapacityMultiplier: 'Storage capacity',
        craftingEfficiencyMultiplier: 'Crafting speed',
        knowledgeGenerationMultiplier: 'Knowledge generation',
        populationHappinessMultiplier: 'Population happiness',
        researchSpeedMultiplier: 'Research speed',
        tradeEfficiencyMultiplier: 'Trade efficiency',
        populationHealthMultiplier: 'Population health',
        goodsProductionMultiplier: 'Goods production',
        productionSpeedMultiplier: 'Production speed'
    };
    return Object.entries(effect).map(([key, val]) => {
        const label = labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        if (val < 1) return `${label}: ${(val * 100).toFixed(0)}%`;
        if (val > 1 && val <= 5) return `${label}: ×${val}`;
        return `${label}: +${val}`;
    });
}

function formatTime(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function updateCraftableItems() {
    if (!gameState.unlockedFeatures.includes('crafting')) {
        document.getElementById('crafting').style.display = 'none';
        return;
    }

    document.getElementById('crafting').style.display = 'block';
    const config = getConfig();
    const container = document.getElementById('craftable-items');

    // P9: Capture collapsed tier state before rebuilding
    const collapsedTiers = new Set();
    container.querySelectorAll('.tier-group.collapsed').forEach(el => {
        const h4 = el.querySelector('h4');
        if (h4) collapsedTiers.add(h4.textContent);
    });

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // Collect available items grouped by tier
    const tierGroups = new Map();
    TIERS.forEach(t => tierGroups.set(t.name, { tier: t, items: [] }));

    const tierGate = { settlement: 'settlement_tier', village: 'village_tier', town: 'town_tier', civilization: 'civilization_tier' };

    config.items.forEach(item => {
        if (gameState.craftedItems[item.id]) return;

        const isFeatureGate = config.unlockPuzzles.some(p => p.unlocks === item.id);
        const hasPuzzleLock = !!item.puzzle && !isFeatureGate;
        const isUnlocked = (!isFeatureGate && !hasPuzzleLock)
            || gameState.unlockedFeatures.includes(item.id);
        const meetsKnowledgeReq = !item.knowledgeRequired
            || (gameState.maxKnowledge || gameState.knowledge) >= item.knowledgeRequired;
        const tierUnlocked = !item.tier || gameState.unlockedFeatures.includes(tierGate[item.tier]);
        const depsMet = areDependenciesMet(item);

        // Feature gates (unlockPuzzles) stay fully hidden until unlocked
        if (isFeatureGate && !gameState.unlockedFeatures.includes(item.id)) return;
        if (!tierUnlocked || !depsMet) return;

        const tier = getItemTier(item);
        // Puzzle-locked items show grayed out; unlocked items show normally
        const locked = hasPuzzleLock && !isUnlocked;
        tierGroups.get(tier.name).items.push({ ...item, _locked: locked, _meetsKnowledge: meetsKnowledgeReq });
    });

    // Render each non-empty tier
    tierGroups.forEach(({ tier, items }) => {
        if (items.length === 0) return;

        const group = document.createElement('div');
        group.className = `tier-group ${tier.cssClass}`;

        const header = document.createElement('div');
        header.className = 'tier-header';
        header.addEventListener('click', () => group.classList.toggle('collapsed'));

        const titleRow = document.createElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.alignItems = 'center';
        titleRow.style.gap = '10px';

        const h4 = document.createElement('h4');
        h4.textContent = tier.name;
        titleRow.appendChild(h4);

        const badge = document.createElement('span');
        badge.className = 'tier-badge';
        const unlockedCount = items.filter(i => !i._locked).length;
        const lockedCount = items.filter(i => i._locked).length;
        badge.textContent = lockedCount > 0
            ? `${unlockedCount} available, ${lockedCount} locked`
            : `${unlockedCount} available`;
        titleRow.appendChild(badge);

        header.appendChild(titleRow);

        const arrow = document.createElement('span');
        arrow.className = 'collapse-arrow';
        arrow.textContent = '▼';
        header.appendChild(arrow);

        group.appendChild(header);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'tier-items';

        items.forEach(item => {
            const wrapper = document.createElement('div');
            wrapper.className = 'craft-btn-wrapper';

            const button = document.createElement('button');

            if (item._locked) {
                // Locked item — grayed out, not craftable
                const lockText = item._meetsKnowledge
                    ? `${item.name} — Study to unlock`
                    : `${item.name} — Requires ${item.knowledgeRequired} knowledge`;
                button.textContent = lockText;
                button.disabled = true;
                button.classList.add('locked-item');
            } else {
                const canCraft = Object.entries(item.requirements).every(
                    ([resource, amount]) => gameState[resource] >= amount
                );
                const reqText = Object.entries(item.requirements)
                    .map(([resource, amount]) => `${amount} ${resource}`)
                    .join(', ');
                button.textContent = `Craft ${item.name} (${reqText})`;
                button.disabled = !canCraft || gameState.availableWorkers === 0;
                button.addEventListener('click', () => startCrafting(item));
            }

            // Tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'item-tooltip';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'tooltip-name';
            nameDiv.textContent = item.name;
            tooltip.appendChild(nameDiv);

            if (item.description) {
                const descDiv = document.createElement('div');
                descDiv.className = 'tooltip-desc';
                descDiv.textContent = item.description;
                tooltip.appendChild(descDiv);
            }

            if (item.effect) {
                const effectDiv = document.createElement('div');
                effectDiv.className = 'tooltip-effect';
                formatEffect(item.effect).forEach(line => {
                    const span = document.createElement('span');
                    span.textContent = line;
                    effectDiv.appendChild(span);
                });
                tooltip.appendChild(effectDiv);
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'tooltip-time';
            timeDiv.textContent = `Craft time: ${formatTime(item.craftingTime)}`;
            tooltip.appendChild(timeDiv);

            wrapper.appendChild(tooltip);
            wrapper.appendChild(button);
            itemsContainer.appendChild(wrapper);
        });

        // P9: Restore collapsed state
        if (collapsedTiers.has(tier.name)) group.classList.add('collapsed');

        group.appendChild(itemsContainer);
        container.appendChild(group);
    });
}

function areDependenciesMet(item) {
    return item.dependencies.every(depId => gameState.craftedItems[depId]);
}

function startCrafting(item) {
    if (gameState.availableWorkers <= 0) {
        logEvent("No available workers to start crafting.");
        return;
    }

    // Re-check resources (they may have changed since the puzzle was shown)
    const canAfford = Object.entries(item.requirements).every(
        ([resource, amount]) => gameState[resource] >= amount
    );
    if (!canAfford) {
        logEvent("Not enough resources to craft " + item.name + ".");
        return;
    }

    // resourceEfficiencyMultiplier (assembly_line) — reduces crafting resource costs
    const resEfficiency = getEffect('resourceEfficiencyMultiplier');
    if (resEfficiency > 1) {
        // Reduce costs but don't go below 1
        Object.entries(item.requirements).forEach(([resource, amount]) => {
            const reduced = Math.max(1, Math.ceil(amount / resEfficiency));
            gameState[resource] -= reduced;
        });
    } else {
        Object.entries(item.requirements).forEach(([resource, amount]) => {
            gameState[resource] -= amount;
        });
    }

    gameState.availableWorkers--;
    let effectiveDuration = item.craftingTime;

    // craftingEfficiencyMultiplier (knife) — general crafting speed
    const craftingEff = getEffect('craftingEfficiencyMultiplier');
    if (craftingEff > 1) effectiveDuration /= craftingEff;

    // advancedConstructionEfficiency (glassworks) — reduces crafting time for Town+ tier items
    const tier = getItemTier(item);
    if (tier && (tier.name === 'Town' || tier.name === 'Civilization')) {
        const advEff = getEffect('advancedConstructionEfficiency', 1);
        if (advEff > 1) effectiveDuration /= advEff;
    }
    gameState.craftingQueue.push({
        item: item,
        progress: 0,
        duration: effectiveDuration
    });

    updateCraftingQueueDisplay();
    updateCraftableItems();
    updateDisplay();
    processQueue();
}

export function processQueue() {
    if (gameState.craftingQueue.length === 0 || craftingInProgress) return;

    craftingInProgress = true;
    const currentCraft = gameState.craftingQueue[0];
    gameState.activeWork.push({ type: 'crafting', item: currentCraft.item });
    updateWorkingSection();

    craftingIntervalId = setInterval(() => {
        if (gameState.isGameOver) {
            clearInterval(craftingIntervalId);
            craftingIntervalId = null;
            craftingInProgress = false;
            gameState.availableWorkers++;
            gameState.activeWork = gameState.activeWork.filter(w => w.type !== 'crafting');
            return;
        }
        currentCraft.progress += 100;
        updateWorkingSection();
        updateCraftingQueueDisplay();

        if (currentCraft.progress >= currentCraft.duration) {
            clearInterval(craftingIntervalId);
            craftingIntervalId = null;
            completeCrafting(currentCraft.item);
        }
    }, 100);
}

function completeCrafting(item) {
    craftingInProgress = false;

    // -----------------------------------------------------------------------
    // Phase 6C: Quality roll
    // Weights are shifted toward higher tiers by clothingQualityMultiplier
    // and weaponCraftingRate bonuses from already-built items.
    // -----------------------------------------------------------------------
    const qualityLevels = [
        { name: 'Common',     multiplier: 1.0, weight: 0.60 },
        { name: 'Fine',       multiplier: 1.2, weight: 0.25 },
        { name: 'Superior',   multiplier: 1.5, weight: 0.10 },
        { name: 'Masterwork', multiplier: 2.0, weight: 0.05 }
    ];

    // Aggregate quality bonus from built items — each relevant effect shifts
    // the roll "left" so higher-tier buckets become more likely.
    let qualityBonus = 0;
    for (const ci of Object.values(gameState.craftedItems)) {
        if (ci?.effect?.clothingQualityMultiplier) qualityBonus += 0.1;
        if (ci?.effect?.weaponCraftingRate)         qualityBonus += 0.05;
    }

    // Shift the random roll toward 0 (higher weights), clamped at 0.
    let roll = Math.max(0, Math.random() - qualityBonus);

    let cumulative     = 0;
    let selectedQuality = qualityLevels[0]; // default: Common
    for (const q of qualityLevels) {
        cumulative += q.weight;
        if (roll <= cumulative) {
            selectedQuality = q;
            break;
        }
    }

    // Build an enhanced copy of the item with quality-scaled effects.
    // Multiplier-type effects are scaled from 1 (e.g. ×1.5 becomes ×1+0.5×qual).
    // Rate/additive effects are scaled directly.
    const scaledEffect = item.effect
        ? Object.fromEntries(
            Object.entries(item.effect).map(([k, v]) => {
                if (typeof v === 'number' && v > 0) {
                    const scaled = k.endsWith('Multiplier')
                        ? 1 + (v - 1) * selectedQuality.multiplier
                        : v * selectedQuality.multiplier;
                    return [k, scaled];
                }
                return [k, v];
            })
        )
        : undefined;

    const enhancedItem = {
        ...item,
        quality:           selectedQuality.name,
        qualityMultiplier: selectedQuality.multiplier,
        effect:            scaledEffect
    };

    gameState.craftedItems[item.id] = enhancedItem;

    // Quality-aware log: only mention tier above Common to avoid noise.
    const qualityPrefix = selectedQuality.name !== 'Common' ? `${selectedQuality.name} ` : '';
    logEvent(`Crafted ${qualityPrefix}${item.name}!`);
    playCraft();

    // Track stats for achievements
    gameState.stats.totalCrafted = (gameState.stats.totalCrafted || 0) + 1;

    gameState.availableWorkers++;
    gameState.activeWork = gameState.activeWork.filter(w => w.type !== 'crafting');
    gameState.craftingQueue.shift();

    const newlyUnlocked = computeUnlockedResources();
    updateGatheringVisibility();
    if (newlyUnlocked.length > 0) {
        playUnlock();
    }
    newlyUnlocked.forEach(r => {
        logEvent(`New resource available: ${r.charAt(0).toUpperCase() + r.slice(1)}!`);
    });

    updateCraftingQueueDisplay();
    updateCraftableItems();
    updateDisplay();
    updateWorkingSection();
    updateAutomationControls();

    // Crafting complete animation
    const queueContainer = document.getElementById('crafting-queue');
    const completeDiv = document.createElement('div');
    completeDiv.className = 'crafting-item crafting-complete';
    const completeSpan = document.createElement('span');
    completeSpan.textContent = `${item.name} complete!`;
    completeDiv.appendChild(completeSpan);
    queueContainer.prepend(completeDiv);
    setTimeout(() => {
        if (completeDiv.parentNode) {
            completeDiv.parentNode.removeChild(completeDiv);
        }
    }, 1000);

    // Victory check
    if (item.id === 'space_program') {
        playVictory();
        showVictory();
    }

    if (gameState.craftingQueue.length > 0) {
        processQueue();
    }
}

function updateCraftingQueueDisplay() {
    const queueContainer = document.getElementById('crafting-queue');
    const existing = queueContainer.querySelectorAll('.crafting-item:not(.crafting-complete)');
    existing.forEach(el => queueContainer.removeChild(el));

    gameState.craftingQueue.forEach(craft => {
        const div = document.createElement('div');
        div.className = 'crafting-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = craft.item.name;
        div.appendChild(nameSpan);

        const barContainer = document.createElement('div');
        barContainer.className = 'progress-bar-container';

        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        bar.style.width = `${(craft.progress / craft.duration) * 100}%`;

        barContainer.appendChild(bar);
        div.appendChild(barContainer);
        queueContainer.appendChild(div);
    });
}

export function clearCraftingInterval() {
    if (craftingIntervalId) {
        clearInterval(craftingIntervalId);
        craftingIntervalId = null;
    }
    craftingInProgress = false;
    updateCraftingQueueDisplay();
}
