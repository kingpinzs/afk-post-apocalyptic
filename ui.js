import { gameState, getConfig, getPrestigeMultiplier } from './gameState.js';
import { updateCraftableItems } from './crafting.js';
import { getGatheringMultiplier } from './resources.js';

export function updateDisplay() {
    document.getElementById('food').textContent = Math.floor(gameState.food);
    document.getElementById('water').textContent = Math.floor(gameState.water);
    document.getElementById('wood').textContent = Math.floor(gameState.wood);
    document.getElementById('stone').textContent = Math.floor(gameState.stone);
    document.getElementById('knowledge').textContent = Math.floor(gameState.knowledge);
    document.getElementById('clay').textContent = Math.floor(gameState.clay);
    document.getElementById('fiber').textContent = Math.floor(gameState.fiber);
    document.getElementById('ore').textContent = Math.floor(gameState.ore);
    document.getElementById('herbs').textContent = Math.floor(gameState.herbs);
    document.getElementById('fruit').textContent = Math.floor(gameState.fruit);
    document.getElementById('food-bar').value = gameState.food;
    document.getElementById('water-bar').value = gameState.water;
    document.getElementById('population-count').textContent = gameState.population;
    document.getElementById('available-workers').textContent = gameState.availableWorkers;
    document.getElementById('total-workers').textContent = gameState.workers;
    document.getElementById('day-count').textContent = gameState.day;
    const prestigeEl = document.getElementById('prestige-points');
    if (prestigeEl) prestigeEl.textContent = gameState.prestigePoints || 0;
    updateGatherButtons();
    updateGrowthIndicators();
    updateStatsDisplay();
}

// Previously displayed current work progress. Section removed, so keep stub.
export function updateWorkingSection() {}

export function updateTimeDisplay() {
    const config = getConfig();
    const hours = Math.floor(gameState.time / 60);
    const minutes = gameState.time % 60;
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

export function showEventPopup(event) {
    const popup = document.getElementById('event-popup');
    const nameEl = document.getElementById('event-name');
    const descEl = document.getElementById('event-description');
    nameEl.textContent = event.name;
    descEl.textContent = event.description;
    popup.style.display = 'block';
    const config = getConfig();
    const duration = event.duration ? event.duration * config.constants.DAY_LENGTH : 0;
    const displaySeconds = Math.max(duration, 3);
    if (popup._timeout) clearTimeout(popup._timeout);
    popup._timeout = setTimeout(() => {
        popup.style.display = 'none';
    }, displaySeconds * 1000);
}

export function showUnlockPuzzle(puzzle) {
    const puzzlePopup = document.getElementById('puzzle-popup');
    document.getElementById('puzzle-title').textContent = 'Unlock New Feature';
    document.getElementById('puzzle-description').textContent = puzzle.puzzle;
    document.getElementById('puzzle-answer').value = '';
    puzzlePopup.style.display = 'block';
    puzzlePopup.dataset.puzzleId = puzzle.id;
}

export function submitUnlockPuzzleAnswer() {
    const config = getConfig();
    const puzzlePopup = document.getElementById('puzzle-popup');
    const puzzleId = puzzlePopup.dataset.puzzleId;
    let unlock = null;
    let correctAnswer = '';
    let puzzle = config.unlockPuzzles.find(p => p.id === puzzleId);
    if (puzzle) {
        unlock = puzzle.unlocks;
        correctAnswer = puzzle.answer.toLowerCase();
    } else {
        const itemId = puzzleId.replace('item_', '');
        const item = config.items.find(i => i.id === itemId);
        if (item) {
            unlock = item.id;
            correctAnswer = item.puzzleAnswer.toLowerCase();
        }
    }

    const answer = document.getElementById('puzzle-answer').value.toLowerCase();

    if (unlock && answer === correctAnswer) {
        gameState.unlockedFeatures.push(unlock);
        logEvent(`Unlocked: ${unlock}!`);
        puzzlePopup.style.display = 'none';
        updateCraftableItems();
    } else {
        alert('Incorrect answer. Try again!');
    }
}

export function closePuzzlePopup() {
    document.getElementById('puzzle-popup').style.display = 'none';
}

export function openSettingsMenu() {
    document.getElementById('settings-menu').style.display = 'block';
}

export function closeSettingsMenu() {
    document.getElementById('settings-menu').style.display = 'none';
}

export function updateGatherButtons() {
    const config = getConfig();
    config.resources.forEach(resource => {
        const button = document.getElementById(`gather-${resource}`);
        if (!button) return;
        let multiplierSpan = button.querySelector('.multiplier');
        if (!multiplierSpan) {
            multiplierSpan = document.createElement('span');
            multiplierSpan.className = 'multiplier';
            button.appendChild(multiplierSpan);
        }
        const mult = getGatheringMultiplier(resource) * getPrestigeMultiplier();
        multiplierSpan.textContent = mult > 1 ? `x${mult}` : '';
    });
}

export function updateGrowthIndicators() {
    const config = getConfig();
    const list = document.getElementById('growth-requirements');
    if (!list) return;
    const threshold = config.constants.POPULATION_THRESHOLD;
    const items = [
        { met: gameState.food >= threshold, text: `Food \u2265 ${threshold}` },
        { met: gameState.water >= threshold, text: `Water \u2265 ${threshold}` },
        {
            met: gameState.daysSinceGrowth >= config.constants.POPULATION_GROWTH_DAYS,
            text: `Days ${gameState.daysSinceGrowth}/${config.constants.POPULATION_GROWTH_DAYS}`
        },
        {
            met: gameState.gatherCount >= config.constants.POPULATION_GATHER_REQUIRED,
            text: `Gather ${gameState.gatherCount}/${config.constants.POPULATION_GATHER_REQUIRED}`
        },
        {
            met: gameState.studyCount >= config.constants.POPULATION_STUDY_REQUIRED,
            text: `Study ${gameState.studyCount}/${config.constants.POPULATION_STUDY_REQUIRED}`
        },
        {
            met: gameState.craftCount >= config.constants.POPULATION_CRAFT_REQUIRED,
            text: `Craft ${gameState.craftCount}/${config.constants.POPULATION_CRAFT_REQUIRED}`
        }
    ];

    list.innerHTML = '';
    items.forEach(req => {
        const li = document.createElement('li');
        li.textContent = `${req.met ? '✅' : '❌'} ${req.text}`;
        list.appendChild(li);
    });
}

export function updateStatsDisplay() {
    const container = document.getElementById('stats-content');
    if (!container) return;
    const stats = gameState.stats || { resourcesGathered: {}, itemsCrafted: {} };
    container.innerHTML = '';

    const dayP = document.createElement('p');
    dayP.textContent = `Days Survived: ${gameState.day}`;
    container.appendChild(dayP);

    const resHeader = document.createElement('h3');
    resHeader.textContent = 'Resources Gathered';
    container.appendChild(resHeader);
    const resList = document.createElement('ul');
    Object.entries(stats.resourcesGathered).forEach(([res, amt]) => {
        const li = document.createElement('li');
        li.textContent = `${res}: ${Math.floor(amt)}`;
        resList.appendChild(li);
    });
    container.appendChild(resList);

    const itemHeader = document.createElement('h3');
    itemHeader.textContent = 'Items Crafted';
    container.appendChild(itemHeader);
    const itemList = document.createElement('ul');
    const config = getConfig();
    Object.entries(stats.itemsCrafted).forEach(([id, count]) => {
        const item = config.items.find(i => i.id === id);
        const name = item ? item.name : id;
        const li = document.createElement('li');
        li.textContent = `${name}: ${count}`;
        itemList.appendChild(li);
    });
    container.appendChild(itemList);
}
