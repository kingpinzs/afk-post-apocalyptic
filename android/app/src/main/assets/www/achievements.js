import { gameState } from './gameState.js';
import { logEvent } from './ui.js';

export const achievementsList = [
    { id: 'gather_10', name: 'First Forager', type: 'gatherCount', target: 10, reward: '🏅', description: 'Gather resources 10 times.' },
    { id: 'craft_5', name: 'Apprentice Crafter', type: 'craftCount', target: 5, reward: '🔨', description: 'Craft 5 items.' },
    { id: 'study_5', name: 'Scholar', type: 'studyCount', target: 5, reward: '📖', description: 'Study 5 times.' },
    { id: 'pop_5', name: 'Growing Settlement', type: 'population', target: 5, reward: '👥', description: 'Reach population of 5.' }
];

export function initAchievements() {
    updateAchievementList();
}

export function checkAchievements() {
    let unlocked = false;
    achievementsList.forEach(a => {
        if (gameState.achievements[a.id]) return;
        const progress = a.type === 'population' ? gameState.population : gameState[a.type] || 0;
        if (progress >= a.target) {
            gameState.achievements[a.id] = true;
            logEvent(`Achievement unlocked: ${a.name}!`);
            showAchievementPopup(a);
            unlocked = true;
        }
    });
    if (unlocked) updateAchievementList();
}

export function updateAchievementList() {
    const list = document.getElementById('achievement-list');
    if (!list) return;
    list.innerHTML = '';
    achievementsList.forEach(a => {
        const li = document.createElement('li');
        li.className = gameState.achievements[a.id] ? 'achievement-unlocked' : '';
        const progress = a.type === 'population' ? gameState.population : gameState[a.type] || 0;
        li.innerHTML = `<span class="achievement-name">${a.reward} ${a.name}</span> <span class="achievement-progress">${Math.min(progress, a.target)}/${a.target}</span>`;
        list.appendChild(li);
    });
}

function showAchievementPopup(a) {
    const popup = document.getElementById('achievement-popup');
    if (!popup) return;
    popup.textContent = `${a.reward} Achievement unlocked: ${a.name}!`;
    popup.style.display = 'block';
    if (popup._timeout) clearTimeout(popup._timeout);
    popup._timeout = setTimeout(() => { popup.style.display = 'none'; }, 3000);
}
