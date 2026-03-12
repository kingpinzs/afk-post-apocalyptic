/**
 * save.js
 * Save/load module for the post-apocalyptic survival game.
 *
 * Persistence strategy
 * --------------------
 * All primitive/plain-object state is serialised to JSON and written to
 * localStorage under the key SAVE_KEY.
 *
 * Special cases that require re-linking on load:
 *   craftedItems    - values are full item objects; only the item IDs are stored.
 *   craftingQueue   - entries hold a live item object; stored as { itemId, progress, duration }.
 *   currentWork     - may hold a live item object; stored as { type, itemId } or null.
 *
 * On load all three are reconstructed by looking up their item IDs inside the
 * config returned by getConfig().items.
 */

import { gameState, getConfig } from './gameState.js';
import { getActiveEvents, setActiveEvents } from './events.js';

/** The localStorage key used by every save/load operation. */
const SAVE_KEY = 'postapoc_save';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialises the current gameState to localStorage.
 *
 * Returns true when the write succeeded, false on any error (e.g. storage
 * quota exceeded or localStorage unavailable in a sandboxed context).
 *
 * @returns {boolean}
 */
export function saveGame() {
    try {
        const payload = _buildPayload();
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        console.info('[save] Game saved successfully (day %d).', gameState.day);
        return true;
    } catch (err) {
        console.error('[save] Failed to save game:', err);
        return false;
    }
}

/**
 * Deserialises a previously saved game from localStorage and writes every
 * field back into the shared gameState object.
 *
 * Item objects for craftedItems, craftingQueue, and currentWork are
 * re-linked from the loaded game configuration so that all downstream code
 * that expects full item objects (effects, requirements, etc.) continues to
 * work without modification.
 *
 * Returns true when a save was found and applied, false when no save exists.
 * Throws (after logging) if the save data is structurally corrupt — callers
 * should treat a thrown error the same way they treat a missing save.
 *
 * @returns {boolean}
 */
export function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw === null) {
            return false;
        }

        const payload = JSON.parse(raw);
        _applyPayload(payload);

        console.info('[save] Game loaded successfully (day %d).', gameState.day);
        return true;
    } catch (err) {
        console.error('[save] Failed to load game:', err);
        return false;
    }
}

/**
 * Returns true when a save slot exists in localStorage, false otherwise.
 *
 * This is a lightweight check — it does not parse or validate the stored
 * JSON.  Use it to decide whether to show a "Continue" button before
 * attempting a full loadGame() call.
 *
 * @returns {boolean}
 */
export function hasSave() {
    try {
        return localStorage.getItem(SAVE_KEY) !== null;
    } catch (err) {
        console.error('[save] Could not check for save:', err);
        return false;
    }
}

/**
 * Removes the save slot from localStorage.
 *
 * Safe to call even when no save exists.
 */
export function deleteSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
        console.info('[save] Save deleted.');
    } catch (err) {
        console.error('[save] Failed to delete save:', err);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a plain, JSON-safe snapshot of the current gameState.
 *
 * Live item object references are replaced with their string IDs so that the
 * stored JSON contains no circular structures and no implementation-specific
 * references that would become stale between sessions.
 *
 * @returns {Object} The serialisable payload.
 */
function _buildPayload() {
    // Primitive / plain-object fields — safe to copy by value.
    const payload = {
        // Resources
        food:               gameState.food,
        water:              gameState.water,
        wood:               gameState.wood,
        stone:              gameState.stone,
        clay:               gameState.clay,
        fiber:              gameState.fiber,
        ore:                gameState.ore,
        herbs:              gameState.herbs,
        fruit:              gameState.fruit,

        // Meta
        knowledge:          gameState.knowledge,
        maxKnowledge:       gameState.maxKnowledge,
        population:         gameState.population,
        availableWorkers:   gameState.availableWorkers,
        day:                gameState.day,
        time:               gameState.time,

        // Flags
        isGameOver:         gameState.isGameOver,
        gameStarted:        gameState.gameStarted,

        // Plain arrays / objects
        unlockedFeatures:   [...gameState.unlockedFeatures],
        automationAssignments: { ...gameState.automationAssignments },
        gatheringEfficiency: gameState.gatheringEfficiency,
        gatheringModifiers:  gameState.gatheringModifiers.map(m => ({ ...m })),

        // --- Fields requiring ID-only serialisation ---

        // craftedItems: store IDs (keys) and quality metadata (Phase 6C).
        // The full item object is re-linked on load from config; quality is
        // re-applied from this separate map so crafted quality persists.
        craftedItemIds: Object.keys(gameState.craftedItems),
        craftedItemQualities: Object.fromEntries(
            Object.entries(gameState.craftedItems)
                .filter(([, item]) => item && item.quality)
                .map(([id, item]) => [id, { quality: item.quality, qualityMultiplier: item.qualityMultiplier }])
        ),

        // craftingQueue: store itemId + progress + duration; item ref re-linked on load.
        craftingQueue: gameState.craftingQueue.map(entry => ({
            itemId:   entry.item.id,
            progress: entry.progress,
            duration: entry.duration
        })),

        // activeWork: store each worker's task; item refs replaced with IDs.
        activeWork: _serializeActiveWork(),

        // activeEvents: store event snapshots with remaining duration.
        activeEvents: _getActiveEvents(),

        // Study gate & pending puzzle
        studyGate: gameState.studyGate ? { ...gameState.studyGate } : null,
        pendingPuzzle: gameState.pendingPuzzle ? { ...gameState.pendingPuzzle } : null,

        // Phase 2: Weather & Seasons
        currentSeason:   gameState.currentSeason,
        currentWeather:  gameState.currentWeather,
        seenMilestones:  [...(gameState.seenMilestones || [])],

        // Phase 3: Trading & Economy
        currency:        gameState.currency ?? 0,
        traderVisits:    gameState.traderVisits ? gameState.traderVisits.map(v => ({ ...v })) : [],
        activeTrades:    gameState.activeTrades ? gameState.activeTrades.map(t => ({ ...t })) : [],

        // Phase 4: Exploration, Quests, Achievements
        explorations:    gameState.explorations ? gameState.explorations.map(e => ({ ...e })) : [],
        activeQuests:    [...(gameState.activeQuests || [])],
        completedQuests: [...(gameState.completedQuests || [])],
        achievements:    [...(gameState.achievements || [])],
        stats:           { ...(gameState.stats || {}) },

        // Phase 5: Difficulty & Population
        difficulty:          gameState.difficulty || 'normal',
        populationMembers:   gameState.populationMembers ? gameState.populationMembers.map(m => ({ ...m, skills: { ...m.skills } })) : [],

        // Phase 6: Prestige & Sandbox
        prestigePoints:  gameState.prestigePoints ?? 0,
        prestigeBonuses: { ...(gameState.prestigeBonuses || {}) },
        sandboxMode:     gameState.sandboxMode ?? false,

        // Phase 7: Factions / Diplomacy
        factions: (gameState.factions || []).map(f => ({ ...f })),

        // Save versioning & metadata
        saveVersion: gameState.saveVersion ?? 1,
        savedAt: Date.now()
    };

    return payload;
}

/**
 * Applies a deserialised payload onto the shared gameState object.
 *
 * Performs item re-linking for craftedItems, craftingQueue, and currentWork
 * using the loaded config.  Skips item IDs that are no longer present in the
 * current config (forwards compatibility — a config update could remove an
 * item while an old save still references it).
 *
 * @param {Object} payload - The parsed JSON payload from localStorage.
 */
function _applyPayload(payload) {
    const config = getConfig();

    // Helper: look up an item by ID, returns undefined for unknown IDs.
    const findItem = (id) => config.items.find(i => i.id === id);

    // --- Primitive / plain-object fields ---
    gameState.food               = payload.food               ?? gameState.food;
    gameState.water              = payload.water              ?? gameState.water;
    gameState.wood               = payload.wood               ?? gameState.wood;
    gameState.stone              = payload.stone              ?? gameState.stone;
    gameState.clay               = payload.clay               ?? gameState.clay;
    gameState.fiber              = payload.fiber              ?? gameState.fiber;
    gameState.ore                = payload.ore                ?? gameState.ore;
    gameState.herbs              = payload.herbs              ?? gameState.herbs;
    gameState.fruit              = payload.fruit              ?? gameState.fruit;

    gameState.knowledge          = payload.knowledge          ?? gameState.knowledge;
    gameState.maxKnowledge       = payload.maxKnowledge       ?? gameState.maxKnowledge;
    gameState.population         = payload.population         ?? gameState.population;
    gameState.availableWorkers   = payload.availableWorkers   ?? gameState.availableWorkers;
    gameState.day                = payload.day                ?? gameState.day;
    gameState.time               = payload.time               ?? gameState.time;

    gameState.isGameOver         = payload.isGameOver         ?? gameState.isGameOver;
    gameState.gameStarted        = payload.gameStarted        ?? gameState.gameStarted;

    gameState.unlockedFeatures   = Array.isArray(payload.unlockedFeatures)
        ? [...payload.unlockedFeatures]
        : gameState.unlockedFeatures;

    gameState.automationAssignments = (payload.automationAssignments && typeof payload.automationAssignments === 'object')
        ? { ...payload.automationAssignments }
        : gameState.automationAssignments;

    gameState.gatheringEfficiency = payload.gatheringEfficiency ?? gameState.gatheringEfficiency;

    gameState.gatheringModifiers  = Array.isArray(payload.gatheringModifiers)
        ? payload.gatheringModifiers.map(m => ({ ...m }))
        : gameState.gatheringModifiers;

    // --- Study gate & pending puzzle ---
    gameState.studyGate = payload.studyGate ?? null;
    gameState.pendingPuzzle = payload.pendingPuzzle ?? null;

    // --- Phase 2: Weather & Seasons ---
    gameState.currentSeason   = payload.currentSeason   ?? 'spring';
    gameState.currentWeather  = payload.currentWeather  ?? 'clear';
    gameState.seenMilestones  = Array.isArray(payload.seenMilestones)
        ? [...payload.seenMilestones]
        : [];

    // --- Phase 3: Trading & Economy ---
    gameState.currency     = payload.currency     ?? 0;
    gameState.traderVisits = Array.isArray(payload.traderVisits)
        ? payload.traderVisits.map(v => ({ ...v }))
        : [];
    gameState.activeTrades = Array.isArray(payload.activeTrades)
        ? payload.activeTrades.map(t => ({ ...t }))
        : [];

    // --- Phase 4: Exploration, Quests, Achievements ---
    gameState.explorations    = Array.isArray(payload.explorations)
        ? payload.explorations.map(e => ({ ...e }))
        : [];
    gameState.activeQuests    = Array.isArray(payload.activeQuests)    ? [...payload.activeQuests]    : [];
    gameState.completedQuests = Array.isArray(payload.completedQuests) ? [...payload.completedQuests] : [];
    gameState.achievements    = Array.isArray(payload.achievements)    ? [...payload.achievements]    : [];
    gameState.stats           = (payload.stats && typeof payload.stats === 'object')
        ? { ...payload.stats }
        : { totalCrafted: 0, totalGathered: 0, totalStudied: 0, totalTraded: 0, totalExplored: 0 };

    // --- Phase 5: Difficulty & Population ---
    gameState.difficulty        = payload.difficulty ?? 'normal';
    gameState.populationMembers = Array.isArray(payload.populationMembers)
        ? payload.populationMembers.map(m => ({ ...m, skills: { ...(m.skills || {}) } }))
        : [];

    // --- Phase 6: Prestige & Sandbox ---
    gameState.prestigePoints  = payload.prestigePoints  ?? 0;
    gameState.prestigeBonuses = (payload.prestigeBonuses && typeof payload.prestigeBonuses === 'object')
        ? { ...payload.prestigeBonuses }
        : {};
    gameState.sandboxMode     = payload.sandboxMode     ?? false;

    // --- Phase 7: Factions / Diplomacy ---
    gameState.factions = Array.isArray(payload.factions)
        ? payload.factions.map(f => ({ ...f }))
        : [];

    // --- Save version ---
    gameState.saveVersion = payload.saveVersion ?? 1;

    // --- Re-link craftedItems ---
    // Rebuild the object so each key maps to the current full item object from
    // config, not the stale copy that was in the save.
    // Phase 6C: Re-apply quality metadata so crafted quality survives save/load.
    gameState.craftedItems = {};
    const savedQualities = (payload.craftedItemQualities && typeof payload.craftedItemQualities === 'object')
        ? payload.craftedItemQualities
        : {};

    if (Array.isArray(payload.craftedItemIds)) {
        payload.craftedItemIds.forEach(id => {
            const item = findItem(id);
            if (item) {
                const qualityData = savedQualities[id];
                if (qualityData && qualityData.quality) {
                    // Reconstruct the quality-scaled effect object
                    const qMult = qualityData.qualityMultiplier || 1;
                    const scaledEffect = item.effect
                        ? Object.fromEntries(
                            Object.entries(item.effect).map(([k, v]) => {
                                if (typeof v === 'number' && v > 0) {
                                    const scaled = k.endsWith('Multiplier')
                                        ? 1 + (v - 1) * qMult
                                        : v * qMult;
                                    return [k, scaled];
                                }
                                return [k, v];
                            })
                        )
                        : undefined;
                    gameState.craftedItems[id] = {
                        ...item,
                        quality:           qualityData.quality,
                        qualityMultiplier: qMult,
                        effect:            scaledEffect
                    };
                } else {
                    gameState.craftedItems[id] = item;
                }
            } else {
                console.warn('[save] loadGame: craftedItem id "%s" not found in config — skipped.', id);
            }
        });
    }

    // --- Re-link craftingQueue ---
    gameState.craftingQueue = [];
    if (Array.isArray(payload.craftingQueue)) {
        payload.craftingQueue.forEach(entry => {
            const item = findItem(entry.itemId);
            if (item) {
                gameState.craftingQueue.push({
                    item:     item,
                    progress: typeof entry.progress === 'number' ? entry.progress : 0,
                    duration: typeof entry.duration === 'number' ? entry.duration : item.craftingTime
                });
            } else {
                console.warn('[save] loadGame: craftingQueue item id "%s" not found in config — skipped.', entry.itemId);
            }
        });
    }

    // --- Re-link activeWork ---
    gameState.activeWork = _deserializeActiveWork(payload.activeWork ?? payload.currentWork, findItem);

    // --- Re-link activeEvents ---
    if (Array.isArray(payload.activeEvents)) {
        setActiveEvents(payload.activeEvents.map(e => ({ ...e })));
    }

    // --- Recalculate availableWorkers from actual state ---
    // Accounts for sick members, exploring workers, automation, and active work.
    const sickCount = (gameState.populationMembers || []).filter(m => m.sick).length;
    const exploringWorkers = (gameState.explorations || [])
        .filter(e => e.inProgress)
        .reduce((sum, e) => sum + (e.workersOut || 1), 0);
    const automationWorkers = Object.values(gameState.automationAssignments || {})
        .reduce((sum, v) => sum + v, 0);
    const activeWorkCount = gameState.activeWork.length;
    gameState.availableWorkers = Math.max(0,
        gameState.population - sickCount - exploringWorkers - automationWorkers - activeWorkCount
    );
}

/**
 * Serialises the activeWork array. Item refs are replaced with IDs.
 */
function _serializeActiveWork() {
    return gameState.activeWork.map(w => {
        switch (w.type) {
            case 'crafting':
                return { type: 'crafting', itemId: w.item ? w.item.id : null };
            case 'gathering':
                return { type: 'gathering', resource: w.resource };
            case 'studying':
                return { type: 'studying' };
            default:
                return { type: w.type };
        }
    });
}

/**
 * Deserialises activeWork, re-linking item objects where needed.
 * On load, gathering/studying intervals can't be restored so those workers
 * are returned to the available pool. Crafting work is kept for the queue.
 *
 * Also handles legacy saves that stored a single currentWork object.
 */
function _deserializeActiveWork(saved, findItem) {
    // Legacy single-object save: wrap into array
    if (saved && !Array.isArray(saved)) {
        saved = saved.type ? [saved] : [];
    }
    if (!Array.isArray(saved)) return [];

    const result = [];
    for (const entry of saved) {
        if (!entry || !entry.type) continue;
        switch (entry.type) {
            case 'crafting': {
                if (!entry.itemId) break;
                const item = findItem(entry.itemId);
                if (!item) {
                    console.warn('[save] loadGame: activeWork item id "%s" not found — skipped.', entry.itemId);
                    break;
                }
                result.push({ type: 'crafting', item: item });
                break;
            }
            case 'gathering':
            case 'studying':
                // Intervals can't be restored; return worker to pool
                gameState.availableWorkers++;
                break;
        }
    }
    return result;
}

/**
 * Returns a copy of active events for serialisation.
 */
function _getActiveEvents() {
    return getActiveEvents().map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        effect: { ...e.effect },
        remainingDuration: e.remainingDuration
    }));
}
