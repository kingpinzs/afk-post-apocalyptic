import { gameState, getConfig } from './gameState.js';
import { logEvent } from './ui.js';

/**
 * Check achievements (called once per day to minimize overhead).
 * Awards any newly earned achievements and applies their rewards.
 */
export function checkAchievements() {
    const config = getConfig();
    const achievementDefs = config.achievements || [];

    gameState.achievements = gameState.achievements || [];

    achievementDefs.forEach(achievement => {
        // Skip already earned
        if (gameState.achievements.includes(achievement.id)) return;

        let earned = false;

        switch (achievement.type) {
            case 'craft':
                earned = !!gameState.craftedItems[achievement.target];
                break;
            case 'craftCount':
                earned = Object.keys(gameState.craftedItems).length >= achievement.target;
                break;
            case 'population':
                earned = gameState.population >= achievement.target;
                break;
            case 'day':
                earned = gameState.day >= achievement.target;
                break;
            case 'knowledge':
                earned = gameState.knowledge >= achievement.target;
                break;
            case 'gather':
                earned = (gameState.stats?.totalGathered || 0) >= achievement.target;
                break;
            case 'explore':
                earned = (gameState.stats?.totalExplored || 0) >= achievement.target;
                break;
            case 'trade':
                earned = (gameState.stats?.totalTraded || 0) >= achievement.target;
                break;
            case 'quest':
                earned = (gameState.completedQuests || []).length >= achievement.target;
                break;
            default:
                // Unknown achievement type — ignore silently
                break;
        }

        if (earned) {
            gameState.achievements.push(achievement.id);
            logEvent(`Achievement unlocked: ${achievement.name}!`);

            // Apply reward if any
            if (achievement.reward) {
                Object.entries(achievement.reward).forEach(([key, value]) => {
                    if (key === 'knowledge') {
                        gameState.knowledge += value;
                        gameState.maxKnowledge = Math.max(gameState.maxKnowledge, gameState.knowledge);
                    } else if (key in gameState && typeof gameState[key] === 'number') {
                        gameState[key] += value;
                    }
                });
            }
        }
    });
}

/**
 * Get all achievement definitions decorated with their earned status.
 * @returns {Array} Achievement objects with an added `earned` boolean.
 */
export function getAchievementStatus() {
    const config = getConfig();
    const achievementDefs = config.achievements || [];

    return achievementDefs.map(a => ({
        ...a,
        earned: (gameState.achievements || []).includes(a.id)
    }));
}
