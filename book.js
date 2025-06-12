import { gameState, getConfig } from './gameState.js';
import { updateDisplay } from './ui.js';
import { updateCraftableItems } from './crafting.js';

export function initBook() {
    document.getElementById('book-submit').addEventListener('click', submitAnswer);
    document.getElementById('book-next').addEventListener('click', nextPage);
    document.getElementById('book-prev').addEventListener('click', prevPage);
    renderPage();
}

function getItems() {
    const config = getConfig();
    return config.items;
}

function getCurrentItem() {
    const items = getItems();
    return items[gameState.currentBookIndex] || null;
}

export function renderPage() {
    const items = getItems();
    const item = getCurrentItem();
    const questionDiv = document.getElementById('book-question');
    const infoDiv = document.getElementById('book-item-info');
    const prevBtn = document.getElementById('book-prev');
    const nextBtn = document.getElementById('book-next');

    prevBtn.disabled = gameState.currentBookIndex === 0;

    if (!item) {
        questionDiv.style.display = 'none';
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = '<p>All pages unlocked!</p>';
        nextBtn.disabled = true;
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
        nextBtn.disabled = gameState.currentBookIndex >= items.length - 1;
    } else {
        infoDiv.style.display = 'none';
        questionDiv.style.display = 'block';
        document.getElementById('book-puzzle-text').textContent = item.puzzle;
        document.getElementById('book-answer').value = '';
        nextBtn.disabled = true;
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
    const items = getItems();
    if (gameState.currentBookIndex < items.length - 1) {
        gameState.currentBookIndex++;
        renderPage();
    }
}

function prevPage() {
    if (gameState.currentBookIndex > 0) {
        gameState.currentBookIndex--;
        renderPage();
    }
}
