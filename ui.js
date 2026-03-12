import { gameState, getConfig, computeUnlockedResources } from './gameState.js';
import { updateCraftableItems } from './crafting.js';
import { getResourceCap, getGatherCount } from './resources.js';
import { playUnlock } from './audio.js';

const EFFECT_LABELS = {
    // Production rates
    foodProductionRate: 'Food production',
    waterProductionRate: 'Water production',
    stoneProductionRate: 'Stone production',
    oreProductionRate: 'Ore production',
    fruitProductionRate: 'Fruit production',
    clayProcessingRate: 'Clay processing',
    fiberProcessingRate: 'Fiber processing',
    oreProcessingRate: 'Ore processing',
    leatherProductionRate: 'Leather production',
    medicineProductionRate: 'Medicine production',
    clothProductionRate: 'Cloth production',
    glassProductionRate: 'Glass production',
    flourProductionRate: 'Flour production',
    textileProductionRate: 'Textile production',
    paperProductionRate: 'Paper production',
    tradeGoodsProductionRate: 'Trade goods',
    currencyProductionRate: 'Currency production',
    energyProductionRate: 'Energy production',
    bookProductionRate: 'Book production',
    // Gathering multipliers
    woodGatheringMultiplier: 'Wood gathering',
    stoneGatheringMultiplier: 'Stone gathering',
    oreGatheringMultiplier: 'Ore gathering',
    foodGatheringMultiplier: 'Food gathering',
    meatGatheringMultiplier: 'Meat gathering',
    fishingEfficiencyMultiplier: 'Fishing efficiency',
    fishingSuccessRate: 'Fishing success',
    // Resource management
    resourceConsumptionMultiplier: 'Resource consumption',
    storageCapacityMultiplier: 'Storage capacity',
    foodStorageMultiplier: 'Food storage',
    waterStorageMultiplier: 'Water storage',
    foodSpoilageReduction: 'Food spoilage reduction',
    waterEfficiencyMultiplier: 'Water efficiency',
    waterDistributionMultiplier: 'Water distribution',
    resourceEfficiencyMultiplier: 'Resource efficiency',
    resourceDistributionMultiplier: 'Resource distribution',
    resourceDiscoveryMultiplier: 'Resource discovery',
    resourceDiscoveryRate: 'Discovery rate',
    resourceDiscoveryChance: 'Discovery chance',
    resourceExchangeRate: 'Exchange rate',
    resourceConsumptionRate: 'Production cost',
    // Crafting & production
    craftingEfficiencyMultiplier: 'Crafting speed',
    advancedConstructionEfficiency: 'Advanced construction',
    toolEfficiencyMultiplier: 'Tool efficiency',
    productivityMultiplier: 'Productivity',
    productionSpeedMultiplier: 'Production speed',
    goodsProductionMultiplier: 'Goods production',
    weaponCraftingRate: 'Weapon crafting',
    clothingQualityMultiplier: 'Clothing quality',
    // Knowledge & research
    knowledgeGenerationMultiplier: 'Knowledge generation',
    knowledgeEfficiencyMultiplier: 'Knowledge efficiency',
    knowledgeSpreadMultiplier: 'Knowledge spread',
    knowledgePreservationRate: 'Knowledge preservation',
    researchSpeedMultiplier: 'Research speed',
    advancedTechUnlockRate: 'Tech unlock rate',
    advancedTechEfficiencyMultiplier: 'Tech efficiency',
    technologyAdvancementMultiplier: 'Tech advancement',
    astronomicalResearchRate: 'Astronomical research',
    breakthroughDiscoveryChance: 'Breakthrough chance',
    scientificDiscoveryRate: 'Scientific discovery',
    // Population
    populationHealthMultiplier: 'Population health',
    populationHappinessMultiplier: 'Population happiness',
    populationCapacityMultiplier: 'Population capacity',
    populationSkillMultiplier: 'Skill growth',
    populationStabilityMultiplier: 'Stability',
    immigrationRate: 'Immigration rate',
    workerMoraleBoost: 'Worker morale',
    medicineEffectivenessMultiplier: 'Medicine effectiveness',
    lifespanIncreaseYears: 'Lifespan increase',
    farmYieldMultiplier: 'Farm yield',
    foodProductionMultiplier: 'Food production boost',
    woodProductionMultiplier: 'Wood production boost',
    // Trade & economy
    tradeEfficiencyMultiplier: 'Trade efficiency',
    tradeRouteCapacity: 'Trade routes',
    tradeShipSafetyMultiplier: 'Ship safety',
    currencyManagementEfficiency: 'Currency management',
    loanAvailabilityRate: 'Loan availability',
    economicGrowthRate: 'Economic growth',
    investmentReturnMultiplier: 'Investment returns',
    economicOutputMultiplier: 'Economic output',
    crimeReductionRate: 'Crime reduction',
    // Culture & navigation
    culturalDevelopmentRate: 'Cultural development',
    culturalInfluenceMultiplier: 'Cultural influence',
    navigationEfficiencyMultiplier: 'Navigation',
    globalPrestigeMultiplier: 'Prestige',
};

function formatEffectLine(key, val) {
    const label = EFFECT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    if (val < 1) return `${label}: ${(val * 100).toFixed(0)}%`;
    if (val > 1 && val <= 5) return `${label}: ×${val}`;
    return `${label}: +${val}`;
}

export function updateBuiltItems() {
    const container = document.getElementById('built-items');
    const list = document.getElementById('built-items-list');
    const items = Object.values(gameState.craftedItems);

    if (items.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    while (list.firstChild) list.removeChild(list.firstChild);

    items.forEach(item => {
        if (!item) return;
        const div = document.createElement('div');
        div.className = 'built-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'built-item-name';

        // Phase 6E: Append quality tier when above Common and colour-code it.
        const qualityText = (item.quality && item.quality !== 'Common')
            ? ` [${item.quality}]`
            : '';
        nameSpan.textContent = item.name + qualityText;

        // Quality colour coding
        const QUALITY_COLORS = {
            Fine:       '#3498db',
            Superior:   '#9b59b6',
            Masterwork: '#f1c40f'
        };
        if (item.quality && QUALITY_COLORS[item.quality]) {
            nameSpan.style.color = QUALITY_COLORS[item.quality];
        }

        div.appendChild(nameSpan);

        if (item.effect) {
            const effectsDiv = document.createElement('div');
            effectsDiv.className = 'built-item-effects';
            Object.entries(item.effect).forEach(([key, val]) => {
                const span = document.createElement('span');
                span.textContent = formatEffectLine(key, val);
                effectsDiv.appendChild(span);
            });
            div.appendChild(effectsDiv);
        }

        list.appendChild(div);
    });
}

export function updateDisplay() {
    const config = getConfig();

    // Update inventory resource counts with per-resource cap display
    const foodCap = getResourceCap('food');
    const waterCap = getResourceCap('water');

    document.getElementById('food').textContent = Math.floor(gameState.food);
    document.getElementById('water').textContent = Math.floor(gameState.water);
    document.getElementById('knowledge').textContent = Math.floor(gameState.knowledge);

    // Show "amount / cap" for gathering resources in inventory
    ['wood', 'stone', 'clay', 'fiber', 'ore', 'herbs', 'fruit'].forEach(r => {
        const el = document.getElementById(r);
        if (el) el.textContent = `${Math.floor(gameState[r] || 0)} / ${getResourceCap(r)}`;
    });

    // Update food/water bars with dynamic per-resource cap
    document.getElementById('food-bar').max = foodCap;
    document.getElementById('food-bar').value = gameState.food;
    document.getElementById('food-max').textContent = foodCap;
    document.getElementById('water-bar').max = waterCap;
    document.getElementById('water-bar').value = gameState.water;
    document.getElementById('water-max').textContent = waterCap;

    // Show currency in HUD if > 0
    const currencyEl = document.getElementById('currency-display');
    if (currencyEl) {
        currencyEl.textContent = Math.floor(gameState.currency || 0);
        const currencyItem = document.getElementById('currency-item');
        if (currencyItem) currencyItem.style.display = gameState.currency > 0 ? '' : 'none';
    }

    // Disable/enable gather buttons based on workers and caps
    config.resources.forEach(resource => {
        const button = document.getElementById(`gather-${resource}`);
        if (!button) return;
        const rCap = getResourceCap(resource);
        if (gameState[resource] >= rCap || gameState.availableWorkers <= 0) {
            button.disabled = true;
        } else {
            button.disabled = false;
        }
    });

    // Check study gate — clear when all required resources are met
    if (gameState.studyGate) {
        const met = Object.entries(gameState.studyGate).every(
            ([resource, amount]) => gameState[resource] >= amount
        );
        if (met) {
            gameState.studyGate = null;
            playUnlock();
            logEvent('Study is available again!');
        }
    }

    // Disable study button when gate is active or studying in progress
    const studyBtn = document.getElementById('study');
    if (studyBtn) {
        if (gameState.studyGate) {
            studyBtn.disabled = true;
            const remaining = Object.entries(gameState.studyGate)
                .filter(([r, amt]) => gameState[r] < amt)
                .map(([r, amt]) => `${Math.max(0, amt - Math.floor(gameState[r]))} ${r}`)
                .join(', ');
            studyBtn.textContent = `Study the Book (need ${remaining})`;
        } else if (gameState.activeWork.some(w => w.type === 'studying')) {
            studyBtn.disabled = true;
            studyBtn.textContent = 'Studying...';
        } else {
            studyBtn.disabled = false;
            studyBtn.textContent = 'Study the Book';
        }
    }

    document.getElementById('population-count').textContent = gameState.population;
    document.getElementById('available-workers').textContent = gameState.availableWorkers;
    document.getElementById('day-count').textContent = gameState.day;

    updateBuiltItems();
    updateWeatherDisplay();
}

export function updateWorkingSection() {
    const container = document.getElementById('current-work');
    const workProgressContainer = document.getElementById('work-progress-container');

    // Clear previous entries
    while (container.firstChild) container.removeChild(container.firstChild);
    workProgressContainer.style.display = 'none';

    if (gameState.activeWork.length === 0) {
        container.textContent = 'All workers idle';
        return;
    }

    // Group gathering workers by resource to show counts
    const gatherCounts = {};
    const otherWork = [];
    gameState.activeWork.forEach(w => {
        if (w.type === 'gathering') {
            gatherCounts[w.resource] = (gatherCounts[w.resource] || 0) + 1;
        } else {
            otherWork.push(w);
        }
    });

    // Render grouped gathering lines
    for (const [resource, count] of Object.entries(gatherCounts)) {
        const span = document.createElement('span');
        span.style.cssText = 'display:block;font-size:0.75em;margin:2px 0;opacity:0.9;';
        span.textContent = count > 1
            ? `Gathering ${resource} (${count} workers)`
            : `Gathering ${resource}`;
        container.appendChild(span);
    }

    // Render other work (crafting, studying)
    otherWork.forEach(w => {
        const label = w.type === 'crafting' ? `Crafting ${w.item?.name || '...'}`
            : w.type === 'studying' ? 'Studying the book'
            : w.type;
        const span = document.createElement('span');
        span.style.cssText = 'display:block;font-size:0.75em;margin:2px 0;opacity:0.9;';
        span.textContent = label;
        container.appendChild(span);
    });
}

export function updateTimeDisplay() {
    const config = getConfig();
    // Map 0..DAY_LENGTH ticks to a 24-hour clock starting at 6:00 AM
    const totalMinutes = Math.floor((gameState.time / config.constants.DAY_LENGTH) * 1440); // 1440 = 24*60
    const hours = (Math.floor(totalMinutes / 60) + 6) % 24;
    const minutes = totalMinutes % 60;
    document.getElementById('time-display').textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function updateTimeEmoji() {
    const config = getConfig();
    const timeEmojiElement = document.getElementById('time-emoji');
    if (gameState.time < config.constants.DAY_PHASE) {
        timeEmojiElement.textContent = '☀️';
    } else {
        timeEmojiElement.textContent = '🌙';
    }
}

export function logEvent(message) {
    const eventLog = document.getElementById('event-log');
    const li = document.createElement('li');
    li.textContent = message;
    eventLog.prepend(li);
    if (eventLog.children.length > 5) {
        eventLog.removeChild(eventLog.lastChild);
    }
}

export function showUnlockPuzzle(puzzle) {
    const puzzlePopup = document.getElementById('puzzle-popup');
    document.getElementById('puzzle-title').textContent = 'Unlock New Feature';
    document.getElementById('puzzle-description').textContent = puzzle.puzzle;
    document.getElementById('puzzle-answer').value = '';
    puzzlePopup.style.display = 'block';
    puzzlePopup.dataset.puzzleId = puzzle.id;
    puzzlePopup.dataset.puzzleType = 'unlock';
}

export function submitUnlockPuzzleAnswer() {
    if (gameState.isGameOver) return;

    const config = getConfig();
    const puzzlePopup = document.getElementById('puzzle-popup');
    const puzzleId = puzzlePopup.dataset.puzzleId;
    const puzzle = config.unlockPuzzles.find(p => p.id === puzzleId);
    const answer = document.getElementById('puzzle-answer').value.toLowerCase();

    if (answer === puzzle.answer.toLowerCase()) {
        gameState.unlockedFeatures.push(puzzle.unlocks);
        logEvent(`Unlocked: ${puzzle.unlocks}!`);
        puzzlePopup.style.display = 'none';
        updateCraftableItems();

        const newlyUnlocked = computeUnlockedResources();
        updateGatheringVisibility();
        if (newlyUnlocked.length > 0) {
            playUnlock();
        }
        newlyUnlocked.forEach(r => {
            logEvent(`New resource available: ${r.charAt(0).toUpperCase() + r.slice(1)}!`);
        });

        // Merge newly unlocked resources into existing study gate
        if (newlyUnlocked.length > 0) {
            const gateAmount = config.constants.STUDY_GATE_AMOUNT || 5;
            if (!gameState.studyGate) gameState.studyGate = {};
            newlyUnlocked.forEach(r => { gameState.studyGate[r] = gateAmount; });
            const names = newlyUnlocked.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
            logEvent(`Gather ${gateAmount} of each new resource (${names}) before studying again.`);
        }

        // No chaining — next puzzle requires another study action
    } else {
        logEvent('Incorrect answer. Try again!');
    }
}

export function findNextItemUnlock(config) {
    return config.items.find(item =>
        item.puzzle && item.puzzleAnswer &&
        !gameState.unlockedFeatures.includes(item.id) &&
        !config.unlockPuzzles.some(p => p.unlocks === item.id) &&
        gameState.knowledge >= (item.knowledgeRequired || 0) &&
        item.dependencies.every(depId => gameState.craftedItems[depId])
    );
}

export function showItemUnlockPuzzle(item) {
    const puzzlePopup = document.getElementById('puzzle-popup');
    document.getElementById('puzzle-title').textContent = 'Unlock New Item';
    document.getElementById('puzzle-description').textContent = item.puzzle;
    document.getElementById('puzzle-answer').value = '';
    puzzlePopup.style.display = 'block';
    puzzlePopup.dataset.puzzleType = 'item_unlock';
    puzzlePopup.dataset.itemId = item.id;
}

export function submitItemUnlockPuzzleAnswer() {
    if (gameState.isGameOver) return;

    const config = getConfig();
    const puzzlePopup = document.getElementById('puzzle-popup');
    const itemId = puzzlePopup.dataset.itemId;
    const item = config.items.find(i => i.id === itemId);

    if (!item) {
        logEvent('Error: item not found. Close and try again.');
        return;
    }

    const answer = document.getElementById('puzzle-answer').value.trim().toLowerCase();

    if (answer === item.puzzleAnswer.toLowerCase()) {
        gameState.unlockedFeatures.push(item.id);
        logEvent(`Unlocked: ${item.name}!`);
        puzzlePopup.style.display = 'none';
        updateCraftableItems();
    } else {
        logEvent('Incorrect answer. Try again!');
    }
}

export function showAchievementToast(name) {
    const toast = document.getElementById('achievement-toast');
    document.getElementById('achievement-toast-name').textContent = name;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

export function showGameOver() {
    document.getElementById('puzzle-popup').style.display = 'none';
    document.getElementById('game-over-popup').style.display = 'block';
}

export function showVictory() {
    document.getElementById('puzzle-popup').style.display = 'none';
    document.getElementById('game-over-popup').style.display = 'none';

    const statsDiv = document.getElementById('victory-stats');
    while (statsDiv.firstChild) statsDiv.removeChild(statsDiv.firstChild);

    const stats = [
        `Day: ${gameState.day}`,
        `Population: ${gameState.population}`,
        `Buildings crafted: ${Object.keys(gameState.craftedItems).length}`,
        `Knowledge: ${gameState.knowledge}`
    ];

    stats.forEach(text => {
        const p = document.createElement('p');
        p.textContent = text;
        statsDiv.appendChild(p);
    });

    document.getElementById('victory-popup').style.display = 'block';
}

export function clearEventLog() {
    const eventLog = document.getElementById('event-log');
    while (eventLog.firstChild) {
        eventLog.removeChild(eventLog.firstChild);
    }
}

export function updateDayNightCycle() {
    // Day/night info is shown in the HUD (emoji + clock). No separate card needed.
}

const WEATHER_EMOJI = {
    clear: '☀️',
    cloudy: '☁️',
    rain: '🌧️',
    storm: '⛈️',
    drought: '🏜️',
    snow: '❄️'
};

export function updateWeatherDisplay() {
    const weatherEl = document.getElementById('weather-display');
    const emojiEl = document.getElementById('weather-emoji');
    const seasonEl = document.getElementById('season-display');
    if (weatherEl) {
        weatherEl.textContent = (gameState.currentWeather || 'clear').charAt(0).toUpperCase() + (gameState.currentWeather || 'clear').slice(1);
    }
    if (emojiEl) {
        emojiEl.textContent = WEATHER_EMOJI[gameState.currentWeather] || '☀️';
    }
    if (seasonEl) {
        seasonEl.textContent = (gameState.currentSeason || 'spring').charAt(0).toUpperCase() + (gameState.currentSeason || 'spring').slice(1);
    }
}

/**
 * Display a milestone event popup with choice buttons.
 * @param {Object} milestone - The milestone event config object.
 * @param {Function} onChoiceSelected - Callback invoked with the selected choice object.
 */
export function showMilestoneEvent(milestone, onChoiceSelected) {
    const popup = document.getElementById('puzzle-popup');
    document.getElementById('puzzle-title').textContent = milestone.title;
    document.getElementById('puzzle-description').textContent = milestone.description;

    // Hide the answer input and submit/skip buttons
    document.getElementById('puzzle-answer').style.display = 'none';
    document.getElementById('submit-puzzle').style.display = 'none';
    document.getElementById('skip-puzzle').style.display = 'none';

    // Create choice buttons container (reuse if already exists)
    let choicesContainer = document.getElementById('milestone-choices');
    if (!choicesContainer) {
        choicesContainer = document.createElement('div');
        choicesContainer.id = 'milestone-choices';
        choicesContainer.style.marginTop = '15px';
        popup.appendChild(choicesContainer);
    }
    while (choicesContainer.firstChild) choicesContainer.removeChild(choicesContainer.firstChild);

    milestone.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.textContent = choice.label;
        btn.title = choice.description;
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.marginBottom = '8px';
        btn.addEventListener('click', () => {
            if (onChoiceSelected) onChoiceSelected(choice);
            // Restore popup elements for puzzle use
            document.getElementById('puzzle-answer').style.display = '';
            document.getElementById('submit-puzzle').style.display = '';
            document.getElementById('skip-puzzle').style.display = '';
            while (choicesContainer.firstChild) choicesContainer.removeChild(choicesContainer.firstChild);
            popup.style.display = 'none';
        });
        choicesContainer.appendChild(btn);

        // Show description below button
        const desc = document.createElement('p');
        desc.textContent = choice.description;
        desc.style.fontSize = '0.7em';
        desc.style.color = '#7f8c8d';
        desc.style.marginTop = '-5px';
        desc.style.marginBottom = '10px';
        choicesContainer.appendChild(desc);
    });

    popup.dataset.puzzleType = 'event_choice';
    popup.style.display = 'block';
}

/**
 * Render the trading section based on current gameState.traderVisits.
 * Called from the game loop and after trades are executed.
 * Trade button click handling is delegated from game.js via event delegation on #trader-list.
 */
export function updateTradingSection() {
    const tradingSection = document.getElementById('trading');
    if (!tradingSection) return;

    // Show section only when marketplace is built
    if (!gameState.craftedItems.marketplace) {
        tradingSection.style.display = 'none';
        return;
    }
    tradingSection.style.display = 'block';

    const traderList = document.getElementById('trader-list');
    const noTraders = document.getElementById('no-traders');
    if (!traderList) return;

    // Clear existing trader cards
    while (traderList.firstChild) traderList.removeChild(traderList.firstChild);

    const visits = gameState.traderVisits || [];
    if (visits.length === 0) {
        if (noTraders) noTraders.style.display = 'block';
        return;
    }
    if (noTraders) noTraders.style.display = 'none';

    visits.forEach((trader, traderIdx) => {
        const traderDiv = document.createElement('div');
        traderDiv.style.marginBottom = '15px';

        const nameP = document.createElement('p');
        nameP.style.fontWeight = '700';
        nameP.style.color = '#f39c12';
        nameP.textContent = `${trader.name} (leaves in ${trader.expiresDay - gameState.day} days)`;
        traderDiv.appendChild(nameP);

        trader.trades.forEach((trade, tradeIdx) => {
            const tradeBtn = document.createElement('button');
            tradeBtn.textContent = `${trade.giveAmount} ${trade.give} for ${trade.receiveAmount} ${trade.receive}`;
            tradeBtn.disabled = !trade.available || (gameState[trade.give] || 0) < trade.giveAmount;
            tradeBtn.style.display = 'block';
            tradeBtn.style.width = '100%';
            tradeBtn.style.marginBottom = '5px';
            tradeBtn.style.fontSize = '12px';

            if (!trade.available) {
                tradeBtn.textContent += ' (completed)';
            }

            // Store indices as data attributes for the delegated click handler in game.js
            tradeBtn.dataset.traderIdx = traderIdx;
            tradeBtn.dataset.tradeIdx = tradeIdx;

            traderDiv.appendChild(tradeBtn);
        });

        traderList.appendChild(traderDiv);
    });
}

export function updateGatheringVisibility() {
    const unlocked = gameState.unlockedResources;

    // Toggle gather-action buttons
    document.querySelectorAll('.gather-action[data-resource]').forEach(el => {
        el.style.display = unlocked.includes(el.dataset.resource) ? 'flex' : 'none';
    });

    // Toggle inventory items
    let anyResourceVisible = false;
    document.querySelectorAll('#inventory-items p[data-resource]').forEach(el => {
        const visible = unlocked.includes(el.dataset.resource);
        el.style.display = visible ? '' : 'none';
        if (visible) anyResourceVisible = true;
    });

    // Hide placeholder once any resource beyond knowledge is visible
    const placeholder = document.getElementById('inventory-placeholder');
    if (placeholder) {
        placeholder.style.display = anyResourceVisible ? 'none' : '';
    }
}

/**
 * Render the exploration section.
 * Hides the section if the watchtower has not been built.
 * Shows in-progress explorations and buttons to start available ones.
 */
export function updateExplorationSection() {
    const section = document.getElementById('exploration');
    if (!section) return;

    if (!gameState.craftedItems.watchtower) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const config = getConfig();
    const locations = config.explorationLocations || [];
    const locationsDiv = document.getElementById('exploration-locations');
    const activeDiv = document.getElementById('active-explorations');

    if (!locationsDiv || !activeDiv) return;

    // Clear both containers
    while (locationsDiv.firstChild) locationsDiv.removeChild(locationsDiv.firstChild);
    while (activeDiv.firstChild) activeDiv.removeChild(activeDiv.firstChild);

    // Render each qualifying location
    locations.forEach(loc => {
        const exploration = (gameState.explorations || []).find(e => e.id === loc.id);

        // Skip completed
        if (exploration && exploration.completed) return;

        // Skip if knowledge requirement not met
        if (loc.knowledgeRequired && gameState.knowledge < loc.knowledgeRequired) return;

        // Skip if required item not built
        if (loc.requiresItem && !gameState.craftedItems[loc.requiresItem]) return;

        // Never show hidden locations in the list
        if (loc.hidden) return;

        if (exploration && exploration.inProgress) {
            // Show in-progress entry in the active div
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            const p = document.createElement('p');
            const workersOut = exploration.workersOut || 1;
            p.textContent = `Exploring ${loc.name}... (${exploration.daysRemaining} days remaining, ${workersOut} worker${workersOut > 1 ? 's' : ''})`;
            p.style.color = '#f39c12';
            div.appendChild(p);
            activeDiv.appendChild(div);
            return;
        }

        // Render a start button for available locations
        const workersNeeded = loc.workersRequired || 1;
        const btn = document.createElement('button');
        btn.textContent = `Explore: ${loc.name} (${workersNeeded} worker${workersNeeded > 1 ? 's' : ''})`;
        btn.title = loc.description;
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.marginBottom = '8px';
        btn.style.fontSize = '12px';
        btn.disabled = gameState.availableWorkers < workersNeeded;
        btn.dataset.locationId = loc.id;
        locationsDiv.appendChild(btn);
    });
}

/**
 * Render the quests section.
 * Hides the section when there are no active quests.
 * Shows up to 5 active quests with a progress bar each.
 */
export function updateQuestsSection() {
    const section = document.getElementById('quests-section');
    if (!section) return;

    const quests = gameState.activeQuests || [];
    if (quests.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const list = document.getElementById('quest-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    quests.slice(0, 5).forEach(quest => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.style.padding = '8px';
        div.style.background = 'rgba(0, 255, 255, 0.06)';
        div.style.borderRadius = '8px';
        div.style.border = '1px solid rgba(0, 255, 255, 0.15)';

        const nameP = document.createElement('p');
        nameP.style.fontWeight = '700';
        nameP.style.marginBottom = '4px';
        nameP.textContent = quest.name;
        div.appendChild(nameP);

        const descP = document.createElement('p');
        descP.style.fontSize = '0.75em';
        descP.style.color = '#7f8c8d';
        descP.textContent = quest.description;
        div.appendChild(descP);

        // Progress bar
        const target = quest.target?.amount || 1;
        const progress = Math.min(quest.progress || 0, target);
        const barContainer = document.createElement('div');
        barContainer.className = 'progress-bar-container';
        barContainer.style.marginTop = '5px';
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        bar.style.width = `${(progress / target) * 100}%`;
        bar.style.backgroundColor = '#f39c12';
        barContainer.appendChild(bar);
        div.appendChild(barContainer);

        const progressText = document.createElement('p');
        progressText.style.fontSize = '0.65em';
        progressText.style.color = '#7f8c8d';
        progressText.style.textAlign = 'right';
        progressText.textContent = `${progress} / ${target}`;
        div.appendChild(progressText);

        list.appendChild(div);
    });
}

/**
 * Render the population section.
 * Hides the section when there are no population members.
 * Shows each member's name, health, and best skill. Sick members are highlighted in red.
 */
export function updatePopulationSection() {
    const section = document.getElementById('population-section');
    if (!section) return;

    const members = gameState.populationMembers || [];
    if (members.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const list = document.getElementById('population-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    members.forEach(member => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '6px 10px';
        div.style.marginBottom = '4px';
        div.style.background = member.sick ? 'rgba(231, 76, 60, 0.15)' : 'rgba(0, 255, 255, 0.06)';
        div.style.borderRadius = '6px';
        div.style.border = member.sick ? '1px solid rgba(231, 76, 60, 0.3)' : '1px solid rgba(0, 255, 255, 0.15)';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontSize = '0.8em';
        nameSpan.style.color = member.sick ? '#e74c3c' : '#00ffff';
        nameSpan.textContent = member.name + (member.sick ? ' (sick)' : '');
        div.appendChild(nameSpan);

        const infoSpan = document.createElement('span');
        infoSpan.style.fontSize = '0.65em';
        infoSpan.style.color = '#7f8c8d';
        const topSkill = Object.entries(member.skills).sort((a, b) => b[1] - a[1])[0];
        infoSpan.textContent = `HP:${Math.floor(member.health)} Best:${topSkill[0]}(${topSkill[1].toFixed(1)})`;
        div.appendChild(infoSpan);

        list.appendChild(div);
    });
}

/**
 * Render the factions / diplomacy section.
 *
 * The section is hidden when no factions have appeared yet and shown the
 * moment at least one faction is present. Each faction card displays:
 *   - Name and current relationship state (colour-coded)
 *   - Short description
 *   - Trust bar (0-100)
 *   - Action buttons: Send Gift (10 food) and Trade Agreement
 *
 * Button clicks are wired via event delegation in game.js on #faction-list.
 */
export function updateFactionsSection() {
    const section = document.getElementById('factions-section');
    if (!section) return;

    const factions = gameState.factions || [];
    if (factions.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const list = document.getElementById('faction-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    const stateColors = {
        neutral: '#7f8c8d',
        friendly: '#3498db',
        allied: '#2ecc71',
        hostile: '#e74c3c'
    };

    factions.forEach(faction => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.marginBottom = '8px';
        div.style.background = 'rgba(0, 0, 0, 0.2)';
        div.style.borderRadius = '8px';
        div.style.border = `1px solid ${stateColors[faction.state] || '#555'}`;

        // Header row: faction name + relationship state badge
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '5px';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = '700';
        nameSpan.style.color = stateColors[faction.state] || '#7f8c8d';
        nameSpan.textContent = faction.name;
        header.appendChild(nameSpan);

        const stateSpan = document.createElement('span');
        stateSpan.style.fontSize = '0.7em';
        stateSpan.style.color = stateColors[faction.state] || '#555';
        stateSpan.textContent = faction.state.toUpperCase();
        header.appendChild(stateSpan);

        div.appendChild(header);

        // Description
        const descP = document.createElement('p');
        descP.style.fontSize = '0.7em';
        descP.style.color = '#7f8c8d';
        descP.style.marginBottom = '5px';
        descP.textContent = faction.description;
        div.appendChild(descP);

        // Trust bar
        const trustContainer = document.createElement('div');
        trustContainer.style.height = '6px';
        trustContainer.style.background = 'rgba(255,255,255,0.1)';
        trustContainer.style.borderRadius = '3px';
        trustContainer.style.overflow = 'hidden';
        trustContainer.style.marginBottom = '8px';

        const trustBar = document.createElement('div');
        trustBar.style.height = '100%';
        trustBar.style.width = `${faction.trust}%`;
        trustBar.style.background = stateColors[faction.state] || '#555';
        trustBar.style.borderRadius = '3px';
        trustBar.style.transition = 'width 0.3s';
        trustContainer.appendChild(trustBar);
        div.appendChild(trustContainer);

        // Action buttons
        const btnDiv = document.createElement('div');
        btnDiv.style.display = 'flex';
        btnDiv.style.gap = '5px';

        if (faction.state !== 'hostile') {
            const giftBtn = document.createElement('button');
            giftBtn.textContent = 'Send Gift (10 food)';
            giftBtn.style.fontSize = '10px';
            giftBtn.style.padding = '4px 8px';
            giftBtn.dataset.factionId = faction.id;
            giftBtn.dataset.action = 'gift';
            giftBtn.disabled = (gameState.food || 0) < 10;
            btnDiv.appendChild(giftBtn);
        }

        if ((faction.state === 'friendly' || faction.state === 'allied') && !faction.tradeAgreement) {
            const tradeBtn = document.createElement('button');
            tradeBtn.textContent = 'Trade Agreement';
            tradeBtn.style.fontSize = '10px';
            tradeBtn.style.padding = '4px 8px';
            tradeBtn.dataset.factionId = faction.id;
            tradeBtn.dataset.action = 'trade';
            btnDiv.appendChild(tradeBtn);
        }

        if (faction.tradeAgreement) {
            const tradeInfo = document.createElement('span');
            tradeInfo.style.fontSize = '0.65em';
            tradeInfo.style.color = '#2ecc71';
            tradeInfo.textContent = 'Trade partner';
            btnDiv.appendChild(tradeInfo);
        }

        div.appendChild(btnDiv);
        list.appendChild(div);
    });
}

/**
 * Render the achievements section.
 * Always visible once any achievement definition exists.
 * Earned achievements are highlighted in green; unearned show their description.
 */
export function updateAchievementsSection() {
    const section = document.getElementById('achievements-section');
    if (!section) return;

    const config = getConfig();
    const achievementDefs = config.achievements || [];
    if (achievementDefs.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const list = document.getElementById('achievement-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    const earned = gameState.achievements || [];

    achievementDefs.forEach(ach => {
        const isEarned = earned.includes(ach.id);
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '6px 10px';
        div.style.marginBottom = '4px';
        div.style.background = isEarned ? 'rgba(46, 204, 113, 0.15)' : 'rgba(0, 0, 0, 0.2)';
        div.style.borderRadius = '6px';
        div.style.border = isEarned ? '1px solid rgba(46, 204, 113, 0.3)' : '1px solid rgba(255,255,255,0.05)';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontSize = '0.8em';
        nameSpan.style.color = isEarned ? '#2ecc71' : '#7f8c8d';
        nameSpan.textContent = ach.name;
        div.appendChild(nameSpan);

        const statusSpan = document.createElement('span');
        statusSpan.style.fontSize = '0.7em';
        statusSpan.textContent = isEarned ? '\u2713' : ach.description;
        statusSpan.style.color = isEarned ? '#2ecc71' : '#555';
        div.appendChild(statusSpan);

        list.appendChild(div);
    });
}
