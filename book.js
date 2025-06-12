import { gameState, getConfig } from './gameState.js';
import { updateDisplay } from './ui.js';
import { updateCraftableItems } from './crafting.js';

export function initBook() {
    document.getElementById('book-submit').addEventListener('click', submitAnswer);
    document.getElementById('book-next').addEventListener('click', nextPage);
    renderPage();
}

function getLockedItems() {
    const config = getConfig();
    return config.items.filter(item => !gameState.unlockedFeatures.includes(item.id));
}

function getCurrentItem() {
    const items = getLockedItems();
    return items[gameState.currentBookIndex] || null;
}

export function renderPage() {
    const item = getCurrentItem();
    const questionDiv = document.getElementById('book-question');
    const infoDiv = document.getElementById('book-item-info');
    if (!item) {
        questionDiv.style.display = 'none';
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = '<p>All pages unlocked!</p>';
        return;
    }
    if (gameState.unlockedFeatures.includes(item.id)) {
        questionDiv.style.display = 'none';
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `<h3>${item.name}</h3><p>${item.description}</p>`;
        if (item.effect) {
            const list = Object.entries(item.effect)
                .map(([k,v]) => `<div>${k}: ${v}</div>`)
                .join('');
            if (list) infoDiv.innerHTML += list;
        }
    } else {
        infoDiv.style.display = 'none';
        questionDiv.style.display = 'block';
        document.getElementById('book-puzzle-text').textContent = item.puzzle;
        document.getElementById('book-answer').value = '';
    }
}

function submitAnswer() {
    const item = getCurrentItem();
    if (!item) return;
    const answer = document.getElementById('book-answer').value.toLowerCase().trim();
    if (answer === item.puzzleAnswer.toLowerCase()) {
        gameState.unlockedFeatures.push(item.id);
        gameState.knowledge += 1;
        updateDisplay();
        updateCraftableItems();
        renderPage();
    } else {
        alert('Incorrect answer. Try again!');
    }
}

function nextPage() {
    const items = getLockedItems();
    if (gameState.currentBookIndex < items.length - 1) {
        gameState.currentBookIndex++;
        renderPage();
    }
}
