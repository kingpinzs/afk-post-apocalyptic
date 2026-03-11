# Game Improvement Ideas

This document tracks improvement ideas for the post-apocalyptic survival game.
Ideas are categorised by implementation status to keep the roadmap honest.

---

## Implemented

These features are built and working in the current game.

- **Resource Diversity** — 9 gathering resources (food, water, wood, stone, clay, fiber, ore, herbs, fruit) plus knowledge. Progressive unlock system gates resources behind crafted items (e.g. axe unlocks fiber, pickaxe unlocks ore/clay).
- **Technology Tree** — 5 tiers (Survival, Settlement, Village, Town, Civilization) with 56 craftable items. Items have dependency chains, tier-gating, and knowledge requirements.
- **Events System** — 5 random events with probability-based triggering and duration-based modifiers that affect gathering efficiency and resources.
- **Resource Storage & Management** — Tiered caps (100 → 200 → 500 → 1000 → 2000 → 5000) that scale with progression. Storehouse item provides a 2x multiplier.
- **Sound & Visual Feedback** — 7 procedural Web Audio effects (gather, study, craft, unlock, game over, click, victory). Crafting-complete animation, progress bars on gathering/crafting/studying, day/night cycle emoji indicator.
- **UI Improvements** — Tooltips on all craftable items showing name, description, effects, and craft time. Tier-grouped crafting list with collapsible sections. Cyberpunk-themed popups with glassmorphism styling.
- **Crafting Puzzles** — Every craft requires solving a riddle. Unlock puzzles gate major features (crafting, axe, pickaxe, etc.) behind knowledge thresholds.
- **Worker Assignment** — Workers can be assigned to buildings (farm, well) for automated food/water production.
- **Endgame Victory** — Space Program item serves as the win condition with a victory fanfare and popup.

---

## Partially Implemented

Foundation exists but significant work remains. Each entry lists what's done and what's missing.

- **Crafting Complexity**
  - Done: Riddle puzzles gate every craft, item dependency chains, crafting efficiency multiplier from tools.
  - Remaining: Quality levels for crafted items, recipe discovery system for advanced items.

- **Survival Elements**
  - Done: Game over on 0 food/water, meal-based consumption (3 meals/day), shelter reduces consumption.
  - Remaining: Individual population member needs, diseases/injuries requiring specific treatment.

- **Time Management**
  - Done: Worker assignment to production buildings with +/- controls.
  - Remaining: Time-duration task scheduling, priority queues, task interruption.

- **Weather & Environment**
  - Done: One weather event (Heavy Rain) exists as a random event.
  - Remaining: Full weather system with multiple weather types, seasons affecting resources, biomes with unique resources and challenges.

- **Endgame Content**
  - Done: Victory condition via Space Program.
  - Remaining: Infinite/sandbox mode after victory, prestige mechanics, post-victory challenges.

- **Technology Tree Visualisation**
  - Done: 5-tier system with dependencies and unlock gating.
  - Remaining: Visual tree diagram showing the full progression path and item relationships.

- **Events Depth**
  - Done: 5 random events with probability and duration mechanics.
  - Remaining: Story-driven milestone events that unlock at progression thresholds, event chains, player choice during events.

---

## Not Yet Implemented

Genuine future work — these features have no implementation in the current codebase.

### High Impact
- **Character Skills & Specialisation** — Population is currently a number. Add individual characters with skills (farming, mining, crafting) and allow specialist assignment for efficiency bonuses.
- **Quests & Objectives** — Add a quest system with short-term and long-term goals to guide progression beyond implicit puzzle unlocks. Reward completion with resources or unique items.
- **Achievements & Milestones** — Track player accomplishments (first craft, first storehouse, 10 population, etc.) and display them. Use achievements to introduce players to advanced mechanics.

### Medium Impact
- **Trading System & Economy** — Config already has `tradeEfficiencyMultiplier` labels on some items but no trading mechanic. Add AI traders or neighbouring settlements with fluctuating prices.
- **Exploration & Discovery** — Add an exploration mechanic to discover new areas, ruins, or resource deposits. Could unlock bonus resources or lore.
- **Difficulty Levels** — All constants are fixed in `knowledge_data.json`. Add difficulty presets (easy/normal/hard) that adjust resource scarcity, event frequency, and consumption rates.
- **Diplomacy & Factions** — Introduce AI-controlled settlements with alliance, trade agreement, and conflict mechanics.

### Lower Priority / Long-term
- **Modding Support** — The data-driven config (`knowledge_data.json`) is a good foundation. Add a plugin system for custom items, events, and resources without modifying core code.
- **Multiplayer** — Currently entirely single-player. Consider cooperative play or competitive resource trading as a stretch goal.
