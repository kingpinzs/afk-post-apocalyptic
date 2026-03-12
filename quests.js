import { gameState, getConfig, isItemBuilt, getTotalCraftedCount } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { addResource } from './resources.js';

/**
 * Initialize quests — call at game start and after study/unlock events.
 * Scans all quest definitions and activates any that meet prerequisites
 * and are not already active or completed.
 */
export function checkQuestAvailability() {
    const config = getConfig();
    const quests = config.quests || [];

    gameState.activeQuests = gameState.activeQuests || [];
    gameState.completedQuests = gameState.completedQuests || [];

    quests.forEach(quest => {
        // Skip completed or already active
        if (gameState.completedQuests.includes(quest.id)) return;
        if (gameState.activeQuests.some(q => q.id === quest.id)) return;

        // Check prerequisites
        if (quest.prerequisite) {
            if (quest.prerequisite.quest && !gameState.completedQuests.includes(quest.prerequisite.quest)) return;
            if (quest.prerequisite.item && !isItemBuilt(quest.prerequisite.item)) return;
            if (quest.prerequisite.knowledge && gameState.knowledge < quest.prerequisite.knowledge) return;
            if (quest.prerequisite.day && gameState.day < quest.prerequisite.day) return;
        }

        // Auto-activate quest
        gameState.activeQuests.push({
            id: quest.id,
            name: quest.name,
            description: quest.description,
            type: quest.type,
            target: quest.target,
            progress: 0,
            reward: quest.reward
        });
        logEvent(`New quest: ${quest.name}!`);
    });
}

/**
 * Check quest completion (called once per game loop tick — performs cheap comparisons).
 * Awards rewards immediately and removes completed quests from the active list.
 */
export function checkQuestCompletion() {
    if (!gameState.activeQuests || gameState.activeQuests.length === 0) return;

    const completed = [];

    gameState.activeQuests.forEach(quest => {
        let progress = 0;
        let target = quest.target.amount || 1;

        switch (quest.type) {
            case 'craft':
                progress = isItemBuilt(quest.target.item) ? 1 : 0;
                target = 1;
                break;
            case 'population':
                progress = gameState.population;
                target = quest.target.amount;
                break;
            case 'gather':
                progress = gameState.stats?.totalGathered || 0;
                target = quest.target.amount;
                break;
            case 'explore':
                progress = gameState.stats?.totalExplored || 0;
                target = quest.target.amount;
                break;
            case 'day':
                progress = gameState.day;
                target = quest.target.amount;
                break;
            case 'build':
                progress = getTotalCraftedCount();
                target = quest.target.amount;
                break;
            case 'knowledge':
                progress = gameState.knowledge;
                target = quest.target.amount;
                break;
            case 'trade':
                progress = gameState.stats?.totalTraded || 0;
                target = quest.target.amount;
                break;
            default:
                // Unknown quest type — skip without throwing
                break;
        }

        quest.progress = Math.min(progress, target);

        if (progress >= target) {
            completed.push(quest);
        }
    });

    completed.forEach(quest => {
        gameState.activeQuests = gameState.activeQuests.filter(q => q.id !== quest.id);
        gameState.completedQuests.push(quest.id);

        // Award rewards
        if (quest.reward) {
            Object.entries(quest.reward).forEach(([key, value]) => {
                if (key === 'knowledge') {
                    gameState.knowledge += value;
                    gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
                } else if (key in gameState.resources) {
                    addResource(key, value);
                }
            });
        }

        logEvent(`Quest complete: ${quest.name}! Rewards received.`);
    });

    // Re-check availability after completions to unlock prerequisite-chained quests
    if (completed.length > 0) {
        checkQuestAvailability();
        updateDisplay();
    }
}

/**
 * Get the first 5 active quests for UI rendering.
 * @returns {Array}
 */
export function getActiveQuests() {
    return (gameState.activeQuests || []).slice(0, 5);
}
