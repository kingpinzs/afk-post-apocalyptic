import { gameState } from './gameState.js';

let currentStep = 0;

const steps = [
    { text: 'Welcome to the wasteland! This short tutorial will guide you through the basics.' },
    {
        text: 'First, gather some wood by pressing the "Gather Wood" button.',
        check: () => gameState.wood > 0,
        highlight: '#gather-wood'
    },
    {
        text: 'Great! Now open the Book tab to study knowledge.',
        check: () => document.getElementById('book').classList.contains('game-section-active'),
        highlight: '#bottom-nav button[data-target="book"]'
    },
    {
        text: 'Next, open the Crafting tab to craft useful items.',
        check: () => document.getElementById('crafting').classList.contains('game-section-active'),
        highlight: '#bottom-nav button[data-target="crafting"]'
    },
    { text: 'You\'re all set! Survive and rebuild civilization.', end: true }
];

export function startTutorial() {
    const saved = Number(localStorage.getItem('tutorialStep') || '0');
    currentStep = saved;
    if (currentStep >= steps.length) return;
    showStep();
}

export function nextStep() {
    removeHighlights();
    currentStep += 1;
    localStorage.setItem('tutorialStep', currentStep);
    if (currentStep >= steps.length) {
        endTutorial();
    } else {
        showStep();
    }
}

export function checkTutorialProgress() {
    const step = steps[currentStep];
    if (step && step.check && step.check()) {
        nextStep();
    }
}

function showStep() {
    const overlay = document.getElementById('tutorial-overlay');
    const textEl = document.getElementById('tutorial-text');
    const step = steps[currentStep];
    if (!step) return;
    overlay.style.display = 'block';
    textEl.textContent = step.text;
    if (step.highlight) {
        const el = document.querySelector(step.highlight);
        if (el) el.classList.add('highlight');
    }
}

function removeHighlights() {
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
}

function endTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    overlay.style.display = 'none';
    removeHighlights();
}

export function skipTutorial() {
    currentStep = steps.length;
    localStorage.setItem('tutorialStep', currentStep);
    endTutorial();
}
