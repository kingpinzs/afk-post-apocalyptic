# Survival and Civilization Rebuilder - Game Design Document

## 1. Game Overview

"Survival and Civilization Rebuilder" is a resource management and survival game where players start with nothing in a post-apocalyptic wilderness and must rebuild civilization from scratch. The game combines elements of idle gameplay, active resource gathering, puzzle-solving, and strategic decision-making across five technological tiers — from basic survival through to launching a space program.

Players manage 10 distinct resources, study to gain knowledge, solve riddles to unlock new crafting tiers and items, assign workers to automate production, and navigate random events — all while keeping their population fed and hydrated. The game features 56 craftable items, a knowledge-gated progression system, procedural audio, a full save/load system, and an interactive tutorial.

## 2. Core Gameplay Loop

1. **Study** the book to gain knowledge points
2. **Solve puzzles** to unlock crafting and new technological tiers
3. **Gather** resources (new resource types unlock as items are crafted)
4. **Craft** tools, buildings, and structures (each requiring a riddle to initiate)
5. **Assign workers** to automate food and water production
6. **Advance** through five tiers: Survival, Settlement, Village, Town, Civilization
7. **Win** by crafting the Space Program

Between studies, players must gather a set amount of each unlocked resource (the "study gate") before they can study again, ensuring engagement with new resource types as they become available.

## 3. Key Features

- **10 gatherable resources** with progressive unlock system
- **56 craftable items** across 5 technological tiers
- **Knowledge & study system** with resource-gathering gates between studies
- **Puzzle-gated progression** — riddles unlock tiers and initiate crafting
- **Population growth and worker assignment** for automation
- **5 random events** with instant and duration-based effects
- **Day/night cycle** with visual indicators (10-minute real-time days)
- **Full save/load system** with auto-save and localStorage persistence
- **7 procedurally synthesised sound effects** via Web Audio API
- **6-step interactive tutorial** on first play
- **Victory condition** — craft the Space Program to win
- **Cyberpunk-themed UI** with glassmorphism, neon accents, and smooth transitions

## 4. Resources

### Always Available
| Resource | Starting Amount | Description |
|----------|----------------|-------------|
| Food     | 100            | Required for survival; consumed at 3 meals per day |
| Water    | 100            | Required for survival; consumed at 3 meals per day |

### Unlocked via Crafting Feature
| Resource | Unlock Condition | Base Gathering Time |
|----------|-----------------|---------------------|
| Wood     | Unlock "crafting" | 5,000 ms |
| Stone    | Unlock "crafting" | 7,000 ms |

### Unlocked via Crafted Items
| Resource | Required Item | Base Gathering Time |
|----------|--------------|---------------------|
| Fiber    | Axe          | 4,000 ms |
| Ore      | Pickaxe      | 8,000 ms |
| Clay     | Pickaxe      | 6,000 ms |
| Herbs    | Knife        | 5,000 ms |
| Fruit    | Farm         | 4,000 ms |

### Knowledge
Knowledge is a special resource earned by studying (1 point per study session). It is uncapped and used as both a crafting ingredient and a progression gate for unlock puzzles. Knowledge is not gathered — it is only acquired through the study mechanic.

### Resource Caps

Resource caps increase as players unlock higher tiers. The Storehouse item doubles the effective cap via its `storageCapacityMultiplier` (2x).

| Milestone         | Cap  |
|-------------------|------|
| Default (no unlocks) | 100 |
| Crafting unlocked | 200  |
| Settlement tier   | 500  |
| Village tier      | 1,000 |
| Town tier         | 2,000 |
| Civilization tier | 5,000 |

## 5. Knowledge & Study System

### Studying
- Requires an available worker (locked while studying)
- Base study duration: 5,000 ms (reduced by `knowledgeGenerationMultiplier` effects from crafted items like Library, School, Observatory)
- Awards 1 knowledge point per completed study
- Displays an animated progress bar in the "Working" section

### Study Gates
After each study session, the player must gather a threshold amount (5 units, configurable via `STUDY_GATE_AMOUNT`) of each currently unlocked resource (excluding food and water) before they can study again. This mechanic ensures players engage with newly unlocked resources rather than rushing knowledge.

When new resources are unlocked mid-gate, they are merged into the existing gate requirements.

### Unlock Puzzles
When the player's knowledge reaches certain thresholds, a riddle popup appears. Solving the riddle unlocks a feature or tier:

| Knowledge Required | Puzzle | Unlocks |
|-------------------|--------|---------|
| 1  | "I am the art of making..." | Crafting system |
| 3  | "I have a head and a handle..." | Axe |
| 5  | "I protect you from the elements..." | Shelter |
| 10 | "People gather, buildings rise..." | Settlement tier |
| 25 | "Larger than a hamlet..." | Village tier |
| 60 | "Markets bustle, laws are made..." | Town tier |
| 120 | "Science, art, and industry combine..." | Civilization tier |

## 6. Crafting & Tech Tree

### Overview
The crafting system contains 56 items organised across 5 tiers. Each item has resource requirements, a crafting time, a riddle puzzle, item dependencies, and gameplay effects. Items are built one at a time in a queue; each queued craft occupies a worker for its duration.

### Tiers

| Tier | Items | Knowledge Range | Description |
|------|-------|----------------|-------------|
| **Survival** (15 items) | Knife, Axe, Shelter, Fishing Rod, Pickaxe, Farm, Well, Kiln, Loom, Herbalist's Hut, Watchtower, Storehouse, Tannery, Forge, Orchard | 1–10 | Basic tools, resource processing, first structures |
| **Settlement** (10 items) | Library, Pottery Workshop, Hunting Lodge, Quarry, Weaving Mill, Sawmill, Marketplace, Windmill, Apothecary, School | 10–20 | Knowledge infrastructure, advanced resource processing, trade |
| **Village** (12 items) | Brewery, Glassworks, Blacksmith, Granary, Irrigation System, Textile Mill, Paper Mill, Music Hall, Observatory, Shipyard, Scriptorium, Alchemist's Laboratory | 25–45 | Specialised production, culture, advanced research |
| **Town** (10 items) | Monument, Theater, Lighthouse, University, Mint, Aqueduct, Telescope, Printing Press, Bank, Courthouse | 60–95 | Governance, economics, advanced science |
| **Civilization** (9 items) | Factory, Hospital, Railway, Power Plant, Stock Exchange, Assembly Line, Research Laboratory, Metropolis, Space Program | 120–250 | Industrial revolution through space age |

### Crafting Mechanics
- **Puzzle requirement**: Each craft attempt shows a riddle. The player must answer correctly to begin crafting.
- **Resource deduction**: Resources are consumed when crafting starts (after puzzle is solved).
- **Dependencies**: Items may require other items to be crafted first (e.g., Forge requires Kiln + Pickaxe).
- **Tier gating**: Settlement+ items require the corresponding tier unlock puzzle to be solved.
- **Crafting queue**: Multiple items can be queued; they are processed sequentially. Each active craft shows a progress bar.
- **Crafting efficiency**: The Knife's `craftingEfficiencyMultiplier` (1.2x) reduces crafting times for subsequent items.
- **Completion animation**: A brief "complete!" notification appears for 1 second after each craft finishes.

### Key Item Effects (Selected)
| Item | Effect |
|------|--------|
| Axe | Wood gathering speed x2 |
| Shelter | Resource consumption x0.5 |
| Farm | Food production +0.1/day per worker |
| Well | Water production +0.2/day per worker |
| Storehouse | Storage capacity x2 |
| Library | Knowledge generation x2 |
| School | Knowledge generation x2.5 |
| Observatory | Knowledge generation x3 |
| Knife | Crafting speed x1.2 |
| Fishing Rod | Food gathering speed x1.5 |
| Pickaxe | Stone gathering x2, Ore gathering x1.5 |

## 7. Population & Workers

### Population Growth
- Population increases by 1 when both food and water exceed the `POPULATION_THRESHOLD` (50 units).
- The threshold amount is consumed from both food and water when a new member joins.
- Each new population unit adds 1 available worker.
- Population checks occur once per day (at the start of each day).

### Workers
- Workers are a shared pool used for gathering, studying, crafting, and automation.
- Each activity (gather, study, craft) occupies 1 worker for its duration.
- Workers assigned to automation buildings are permanently committed until manually unassigned.

### Resource Consumption
The population consumes food and water at 3 meals per day (at ticks 0, 150, and 300 of each 600-tick day). Consumption uses a diminishing per-capita formula:

```
foodPerMeal = (3 * sqrt(population) * shelterMultiplier) / 3
waterPerMeal = (2 * sqrt(population) * shelterMultiplier) / 3
```

The Shelter's `resourceConsumptionMultiplier` (0.5) halves all consumption. With 1 person: ~3 food and ~2 water per day. With 9 people: ~9 food and ~6 water per day.

### Game Over
If food or water drops to 0, the game ends. A game-over popup is displayed with a restart option. The save file is deleted on game over.

### Health & Disease

Each population member has an individual **health** (0–100) and may become **sick**.

#### How Members Get Sick
- **Base infection chance**: 2% per day, increased by:
  - **Winter season**: +2% extra chance
  - **Overcrowding**: >1.5× housing capacity adds a +3% spread bonus
  - **Difficulty**: higher difficulty scales the chance up
- **Food poisoning**: 3% daily chance if food spoils (reduced by a Granary); sets `sickDaysRemaining = 2`
- Sick members show a 🤒 badge with the days remaining on the Population tab

#### How to Heal Sick Members

| Condition | Recovery |
|-----------|----------|
| **No medical building** | Very slow natural recovery (`healRate = 0.3 days/day`); untreated members lose 5 health/day and risk death when health ≤ 20 |
| **Medical building built** (Healer's Tent → … → Medical Center) | Faster recovery (`0.5 + medicalLevel × 0.2 days/day`); each building level can treat 3 patients per day |
| **Medical building + Medicine resource** | Fastest recovery (`1 + medicalLevel × 0.5 days/day`); consumes 1 Medicine per sick member per day |

**Step-by-step guide:**
1. **Craft a Healer's Tent** (Crafting tab, Survival tier) — this is your first medical building and immediately begins treating sick members.
2. **Produce Medicine** — craft an Herbalist's Hut (Survival tier) and upgrade it to an **Apothecary** (Settlement tier). Assign workers to the Apothecary to convert Herbs into Medicine.
3. **Upgrade the medical chain** — Sick Bay → Clinic → Hospital → Medical Center — for higher treatment capacity and faster recovery.

#### Medical Building Chain

| Building | Tier | Patients/day | Recovery speed | Notes |
|----------|------|--------------|----------------|-------|
| Healer's Tent | Survival | 3 | 0.7×/day | First medical building |
| Sick Bay | Settlement | 6 | 0.9×/day | Requires Healer's Tent |
| Clinic | Village | 15 | 1.1×/day | Requires Sick Bay |
| Hospital | Town | 45 | 1.5×/day | Requires Clinic |
| Medical Center | Civilization | 90 | 2.0×/day | Requires Hospital |

#### Medicine Production

| Building | Input | Output | Notes |
|----------|-------|--------|-------|
| Herbalist's Hut | — | 1 Medicine/day (passive) | Survival tier |
| Apothecary | 6 Herbs | 6 Medicine/day | Settlement tier; requires workers |

#### Sick Member Status in the UI

When a member is sick, their card on the Population tab shows:
- A **🩺 Sick (Xd)** badge (hover for a tooltip explaining what to do)
- A **💡 hint** describing the current treatment status and the next step to improve care

## 8. Automation

Workers can be assigned to buildings that have `foodProductionRate` or `waterProductionRate` effects. Currently, two buildings support automation:

| Building | Effect | Production |
|----------|--------|------------|
| Farm     | foodProductionRate: 0.1 | +0.1 food per assigned worker per day |
| Well     | waterProductionRate: 0.2 | +0.2 water per assigned worker per day |

- Workers are assigned/unassigned via +/- buttons in the Automation panel.
- Automation runs once per day (at day start).
- The panel displays current worker counts and projected daily output.
- Assigned workers are unavailable for gathering, studying, or crafting.

## 9. Events

Events are checked once per day at the start of each new day. Each event has an independent probability of triggering. Events with `duration` apply persistent modifiers that last the specified number of days.

| Event | Probability | Effect | Duration |
|-------|------------|--------|----------|
| Bountiful Harvest | 10% | +50 food | Instant |
| Stone Discovery | 8% | +30 stone | Instant |
| Wandering Herbalist | 5% | +5 knowledge | Instant |
| Heavy Rain | 7% | +40 water, gathering efficiency x0.8 | 2 days |
| Tool Breakthrough | 6% | Gathering efficiency x1.2 | 3 days |

### Gathering Efficiency
Duration-based events modify a `gatheringEfficiency` multiplier tracked via a `gatheringModifiers[]` array. When multiple events overlap, their modifiers are multiplied together. When an event expires, its modifier is removed and efficiency is recalculated from scratch.

## 10. Day/Night Cycle

- A full day lasts **600 ticks** (10 minutes real-time at 1 tick/second)
- **Day phase**: Ticks 0–299 (5 minutes)
- **Night phase**: Ticks 300–599 (5 minutes)
- A sun/moon emoji in the HUD indicates the current phase
- A 24-hour clock display maps the tick counter to a time starting at 06:00

> **Note**: Time-of-day has no gameplay effect on gathering efficiency or other mechanics. This is a visual-only feature. Time-of-day efficiency bonuses are a potential future enhancement.

## 11. Save/Load System

The game uses localStorage for persistence under the key `postapoc_save`.

### Auto-Save
- Saves automatically every 30 seconds while the game is running and not in a game-over state.
- A brief "Saved" indicator flashes in the UI on each auto-save.

### Continue Button
- The title screen shows a "Continue" button when a save exists (`hasSave()` check).
- Loading restores all state including resources, population, unlocked features, crafted items, crafting queue, active events, and study gate.

### Object Re-linking
Live item objects (in `craftedItems`, `craftingQueue`, `currentWork`) are serialised as IDs only. On load, they are re-linked to the current config objects so that `.effect` and other properties remain accessible. Unknown item IDs (from outdated saves) are gracefully skipped.

### Gathering/Study Recovery
Gathering and studying intervals cannot be restored across sessions. If a player was mid-gather or mid-study when the save occurred, the worker is returned to the available pool on load.

### Save Deletion
The save is deleted on game over or when the player resets the game.

## 12. Audio

All sound effects are procedurally synthesised at runtime using the Web Audio API. No external audio files are required.

| Sound | Function | Character | Duration |
|-------|----------|-----------|----------|
| `playGather()` | Resource gathered | Rising sine wave (minor third interval) | ~0.25s |
| `playStudy()` | Study complete | Ascending triangle-wave pentatonic chime (C5-E5-G5) | ~0.55s |
| `playCraft()` | Crafting complete | Square-wave hammer strikes with noise burst | ~0.45s |
| `playUnlock()` | Feature/tier unlocked | Major arpeggio (C4-E4-G4-C5) | ~0.65s |
| `playGameOver()` | Game over | Descending minor tetrachord (sawtooth, detuned layers) | ~0.80s |
| `playClick()` | UI button press | Short noise burst with low sine body | ~0.07s |
| `playVictory()` | Game won | Four-chord major progression (I-IV-V-I) in triads | ~1.60s |

### Mute
- A sound toggle button (speaker emoji) in the HUD toggles mute on/off.
- Mute state is persisted in localStorage (`postapoc_muted`).
- Audio context is initialised from user interaction (click/keydown) to satisfy browser autoplay policies.

## 13. User Interface

### Title Screen
- Game title, subtitle, and "New Game" / "Continue" buttons
- Smooth fade-out transition (1s opacity) when starting a game
- "Continue" button only visible when a save exists

### HUD (Fixed Top Bar)
- **Food bar**: Progress bar showing current food / cap
- **Water bar**: Progress bar showing current water / cap
- **Day counter**: Current in-game day
- **Time display**: 24-hour clock (06:00–05:59) with sun/moon emoji
- **Population**: Current population count
- **Available workers**: Workers not assigned to any task
- **Sound toggle**: Mute/unmute button
- **Save indicator**: Brief flash on auto-save

### Inventory Panel
- Displays all unlocked resources with current amount / cap
- Resources are hidden until unlocked; a placeholder message shows before any are available
- Knowledge is displayed without a cap

### Actions Section
- Gather buttons for each unlocked resource, each with a progress bar
- Buttons are disabled while gathering, at resource cap, or with no available workers
- "Study the Book" button (shows remaining gate requirements when gated)

### Crafting Section
- Only visible after "crafting" is unlocked
- Items grouped by tier with collapsible headers showing available item count
- Each item shows resource requirements; disabled if requirements not met or no workers
- Tooltips display item name, description, effects, and craft time
- Crafting queue section shows progress bars for queued items

### Built Items Panel
- Lists all crafted items with their active effects
- Effects are formatted with human-readable labels (e.g., "Wood gathering: x2")

### Working Section
- Shows current activity (Gathering [resource], Crafting [item], Studying)
- Progress bar for the current task

### Automation Panel
- Worker assignment controls (+/- buttons) for buildings with production rates
- Shows assigned count and projected daily output per building

### Event Log
- Scrolling list of the 5 most recent events/messages
- Prepends new entries; trims oldest when exceeding 5

### Popups
- **Puzzle popup**: Riddle text, answer input, submit/skip buttons (shared by unlock and crafting puzzles)
- **Game Over popup**: Restart button
- **Victory popup**: Stats (day, population, buildings crafted, knowledge), continue/restart buttons
- All popups styled with cyberpunk theme (glassmorphism, neon cyan border, styled input)

### Tutorial Overlay
A 6-step interactive overlay shown on first play:
1. Study the book to gain knowledge
2. Solve puzzles to unlock new abilities
3. Gather unlocked resources from the wasteland
4. Craft tools & buildings to unlock more
5. Assign workers to automate production
6. Rebuild civilization — reach the stars!

Dismissed via "Begin Survival" button. Not shown again (tracked via `postapoc_tutorial_seen` in localStorage).

## 14. Victory Condition

The game is won by crafting the **Space Program**, the final item in the Civilization tier. Requirements:

- **Resources**: 600 ore, 400 wood, 500 knowledge
- **Dependencies**: Research Laboratory, Factory, Power Plant, University
- **Knowledge required**: 250 (the highest of any item)
- **Craft time**: 5,400,000 ms (~90 minutes)

Upon completion, a victory popup displays final stats (day reached, population, buildings crafted, knowledge accumulated) and offers options to continue playing or restart.

## 15. Progression Summary

| Phase | Focus | Key Milestones |
|-------|-------|---------------|
| **Early Game** | Survival, manual gathering | Study → unlock crafting → gather wood/stone → craft Knife, Axe, Shelter |
| **Mid Game** | Resource diversification, first automation | Unlock Settlement tier → build Farm/Well → assign workers → build Library/School |
| **Late Game** | Scaling production, advanced tech | Unlock Village/Town tiers → build Forge, Quarry, University → mass production |
| **End Game** | Industrial revolution, victory push | Unlock Civilization tier → Factory, Power Plant, Research Lab → Space Program |

## 16. Technical Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5 with inline CSS
- **State management**: Single shared `gameState` object (`gameState.js`)
- **Configuration**: All game data loaded from `knowledge_data.json`
- **Persistence**: localStorage (save/load, mute state, tutorial flag)
- **Audio**: Web Audio API (procedural synthesis, no external files)
- **Server**: Static file serving via `http-server`
- **No frameworks, no database, no build step**

## 17. Future Expansions

The following features are **not yet implemented** and represent potential future work:

- **Time-of-day efficiency**: Gathering bonuses/penalties based on day vs. night phase
- **Trading system**: Interaction with AI-controlled civilizations
- **Multiple biomes**: Unique resources and challenges per biome
- **Achievements and milestone rewards**: Tracked accomplishments with bonuses
- **Weather system**: Weather effects beyond the existing event system
- **Progressive Web App (PWA)**: Offline play and mobile home-screen installation
- **Monetization**: Premium cosmetics, optional ads, or paid content unlocks

## 18. Target Platform

Web-based game running in modern browsers (Chrome, Firefox, Safari, Edge). Potential for mobile adaptation as a Progressive Web App.
