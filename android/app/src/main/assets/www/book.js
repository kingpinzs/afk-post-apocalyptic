import { gameState, getConfig } from './gameState.js';
import { updateDisplay } from './ui.js';
import { updateCraftableItems } from './crafting.js';

export function initBook() {
    gameState.currentBookIndex = 0;
    document.getElementById('book-submit').addEventListener('click', submitAnswer);
    document.getElementById('book-next').addEventListener('click', nextPage);
    document.getElementById('book-prev').addEventListener('click', prevPage);
    renderPage();
}

function getPuzzles() {
    const config = getConfig();
    return config.unlockPuzzles;
}

function getCurrentPuzzle() {
    const puzzles = getPuzzles();
    return puzzles[gameState.currentBookIndex] || null;
}

export function renderPage() {
    const puzzles = getPuzzles();
    const puzzle = getCurrentPuzzle();
    const questionDiv = document.getElementById('book-question');
    const infoDiv = document.getElementById('book-item-info');
    const prevBtn = document.getElementById('book-prev');
    const nextBtn = document.getElementById('book-next');

    prevBtn.disabled = gameState.currentBookIndex === 0;

    if (!puzzle) {
        questionDiv.style.display = 'none';
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = '<p>All pages unlocked!</p>';
        nextBtn.disabled = true;
        return;
    }
    if (gameState.unlockedFeatures.includes(puzzle.unlocks)) {
        questionDiv.style.display = 'none';
        infoDiv.style.display = 'block';
        const item = getConfig().items.find(i => i.id === puzzle.unlocks);
        if (item) {
            infoDiv.innerHTML = `<h3>${item.name}</h3><p>${item.description}</p>`;
            if (item.history) {
                infoDiv.innerHTML += `<p><strong>History:</strong> ${item.history}</p>`;
            }
            if (item.craftingInfo) {
                infoDiv.innerHTML += `<p><strong>Real World Crafting:</strong> ${item.craftingInfo}</p>`;
            }
            if (item.effect) {
                const list = Object.entries(item.effect)
                    .map(([k,v]) => `<div>${k}: ${v}</div>`)
                    .join('');
                if (list) infoDiv.innerHTML += list;
            }
        } else {
            infoDiv.innerHTML = `<p>Unlocked feature: ${puzzle.unlocks}</p>`;
        }
        nextBtn.disabled = gameState.currentBookIndex >= puzzles.length - 1;
    } else {
        infoDiv.style.display = 'none';
        questionDiv.style.display = 'block';
        document.getElementById('book-puzzle-text').textContent = puzzle.puzzle;
        document.getElementById('book-answer').value = '';
        nextBtn.disabled = true;
    }
}

function submitAnswer() {
    const puzzle = getCurrentPuzzle();
    if (!puzzle) return;
    const answer = document.getElementById('book-answer').value.toLowerCase().trim();
    if (answer === puzzle.answer.toLowerCase()) {
        if (!gameState.unlockedFeatures.includes(puzzle.unlocks)) {
            gameState.unlockedFeatures.push(puzzle.unlocks);
        }
        gameState.knowledge += 1;
        updateDisplay();
        updateCraftableItems();
        renderPage();
    } else {
        alert('Incorrect answer. Try again!');
    }
}

function nextPage() {
    const puzzles = getPuzzles();
    if (gameState.currentBookIndex < puzzles.length - 1) {
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
