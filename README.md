# Phaser Game

A TypeScript-based Phaser 3 game with strict type safety and testing.

## Setup

Install dependencies:
```bash
npm install
```

## Development

Start the dev server:
```bash
npm run dev
```

The game will open at `http://localhost:3000`

## Building

Build for production:
```bash
npm run build
```

Type-check without building:
```bash
npm run type-check
```

## Testing

Run tests:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Project Structure

```
phaser-test/
├── src/
│   ├── types/              # Core type definitions
│   │   ├── common.ts       # Position, GridCoordinates, EntityId
│   │   └── diplomacy.ts    # Diplomatic relations types
│   ├── entities/           # Game entities (modular)
│   │   ├── units/          # Unit classes
│   │   │   ├── Unit.ts     # Base Unit class
│   │   │   ├── Infantry.ts # Infantry unit
│   │   │   ├── Archer.ts   # Archer unit
│   │   │   └── index.ts    # Barrel exports
│   │   ├── cities/         # City management
│   │   │   ├── City.ts     # City class
│   │   │   └── index.ts    # Barrel exports
│   │   └── nations/        # Nation/player entities
│   │       ├── Nation.ts   # Nation class with diplomacy
│   │       └── index.ts    # Barrel exports
│   ├── systems/            # Game systems
│   │   ├── grid/           # Grid & territory system
│   │   │   ├── Grid.ts     # Game board grid
│   │   │   ├── Territory.ts # Individual tile/square
│   │   │   └── index.ts    # Barrel exports
│   │   └── resources/      # Resource management
│   │       ├── ResourceType.ts # Resources (Fire Mana, Iron, etc.)
│   │       └── index.ts    # Barrel exports
│   ├── managers/           # State managers
│   │   ├── GameState.ts    # Central game state
│   │   └── index.ts        # Barrel exports
│   ├── config/             # Game configuration
│   │   └── gameConfig.ts   # Phaser config
│   ├── scenes/             # Phaser scenes (add game scenes here)
│   └── main.ts             # Entry point
├── assets/                 # Game assets (images, sounds, etc.)
├── public/                 # Static files
├── index.html              # HTML template
├── tsconfig.json           # TypeScript config (strict mode enabled)
├── vite.config.ts          # Vite bundler config
└── vitest.config.ts        # Test framework config
```

## Game Architecture

**Modular RTS Grid-Based Game**

### Core Systems

**Grid System** ([src/systems/grid/](src/systems/grid/))
- Grid manages the game board with configurable rows/columns
- Territory represents each square tile with terrain types
- Territories can be controlled by nations and contain cities

**Resource System** ([src/systems/resources/](src/systems/resources/))
- ResourceType: Fire Mana, Water Mana, Iron, Gold, Food, Wood
- ResourceStorage: Manages resource amounts with add/remove/consume methods
- ResourceCost: Defines costs for units, buildings, etc.

### Game Entities

**Units** ([src/entities/units/](src/entities/units/))
- Base Unit class with health, attack, defense, movement, range
- Infantry: Melee unit (close range, balanced stats)
- Archer: Ranged unit (long range, lower defense)
- Units can move, attack, and reset each turn

**Cities** ([src/entities/cities/](src/entities/cities/))
- Occupy one territory square
- Produce units with production queue system
- Store resources locally
- Have population growth

**Nations** ([src/entities/nations/](src/entities/nations/))
- Control territories, cities, and units
- Manage treasury (ResourceStorage)
- Diplomatic relations: Ally, Neutral, War, Trade Agreement
- Can be player-controlled or AI

### Game State

**GameState Manager** ([src/managers/GameState.ts](src/managers/GameState.ts))
- Central state management
- Manages all nations, cities, units, and the grid
- Turn-based system with active nation tracking
- Provides access methods for all game entities

## TypeScript Features

This project uses strict TypeScript configuration including:
- `strict: true` - All strict type checks
- `noUnusedLocals` & `noUnusedParameters` - No unused variables
- `noImplicitReturns` - All code paths must return
- `noUncheckedIndexedAccess` - Array access returns potentially undefined
- `exactOptionalPropertyTypes` - Strict optional properties

## Testing

All major modules have comprehensive test coverage:
- [ResourceStorage.test.ts](src/systems/resources/ResourceType.test.ts) - Resource management
- [Unit.test.ts](src/entities/units/Unit.test.ts) - Unit behavior (Infantry, Archer)
- [Grid.test.ts](src/systems/grid/Grid.test.ts) - Grid and territory logic
- [Nation.test.ts](src/entities/nations/Nation.test.ts) - Nation diplomacy

Run `npm test` to verify all systems work correctly.

## Usage Example

```typescript
import { GameState } from '@/managers';
import { Nation } from '@/entities/nations';
import { Infantry, Archer } from '@/entities/units';
import { City } from '@/entities/cities';
import { ResourceType } from '@/systems/resources';

// Initialize game with 20x20 grid
const gameState = new GameState({ rows: 20, cols: 20 });

// Create nations
const rome = new Nation('nation-1', 'Rome', '#FF0000');
const persia = new Nation('nation-2', 'Persia', '#0000FF');
gameState.addNation(rome);
gameState.addNation(persia);

// Set diplomatic relations
rome.declareWar(persia.getId());

// Create a city
const city = new City('city-1', 'Roma', rome.getId(), { row: 5, col: 5 });
gameState.addCity(city);

// Add resources to nation treasury
rome.getTreasury().addResource(ResourceType.GOLD, 1000);
rome.getTreasury().addResource(ResourceType.IRON, 500);

// Create units
const infantry = new Infantry('unit-1', rome.getId(), { row: 6, col: 5 });
const archer = new Archer('unit-2', rome.getId(), { row: 7, col: 5 });
gameState.addUnit(infantry);
gameState.addUnit(archer);

// Start turn-based gameplay
gameState.setActiveNation(rome.getId());
```

## Next Steps

1. Create Phaser scenes in `src/scenes/` to visualize the grid and entities
2. Implement combat system and pathfinding
3. Add AI logic for computer-controlled nations
4. Create UI for unit/city management
5. Add more unit types, buildings, and game mechanics
6. Import game assets into `assets/` folder
