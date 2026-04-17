# Sprite Sheet Format

All sprite sheets should be placed in this folder. Phaser loads them from `assets/sprites/` via the asset loader.

## Spritesheet spec

- **File format:** PNG with transparency (RGBA)
- **Recommended atlas tool:** [TexturePacker](https://www.codeandweb.com/texturepacker) or [Free Texture Packer](https://free-tex-packer.com/)

## Unit sprites

Each unit type needs its own sprite sheet with the following frames:

| Frame index | State           |
|-------------|-----------------|
| 0           | Idle facing down (south) |
| 1           | Idle facing up (north) |
| 2           | Idle facing right (east) |
| 3           | Idle facing left (west) |
| 4–7         | Walk south (4 frames) |
| 8–11        | Walk north |
| 12–15       | Walk east |
| 16–19       | Walk west |
| 20–23       | Attack (4 frames, direction-agnostic) |
| 24          | Death frame |

**Recommended frame size:** 32×32 px or 48×48 px (consistent across all sheets)
**Sheet layout:** horizontal strip (all frames in a single row) or grid

Naming convention: `unit_<type>.png` — e.g. `unit_infantry.png`, `unit_cavalry.png`

Expected unit types:
```
unit_infantry.png
unit_scout.png
unit_heavy_infantry.png
unit_cavalry.png
unit_longbowman.png
unit_crossbowman.png
unit_catapult.png
unit_trebuchet.png
```

## Terrain tiles

Terrain tiles are used for the map grid. Each tile is a standalone PNG or part of a tileset.

**Recommended tile size:** 32×32 px or 64×64 px (match whatever the game renders the grid cell at)

Naming convention: `terrain_<type>.png` or a single `terrain_tileset.png` with a JSON atlas.

Expected terrain types:
```
terrain_plains.png
terrain_forest.png
terrain_hills.png
terrain_desert.png
terrain_mountain.png
terrain_water.png
```

## Building / city icons

Small 16×16 or 24×24 icons overlaid on the map or shown in menus.

Naming convention: `icon_<building>.png`

## How to load in Phaser

In `BootScene.ts` (or a dedicated `PreloadScene`), add:

```typescript
// Spritesheet with 32×32 frames
this.load.spritesheet('unit_infantry', 'assets/sprites/unit_infantry.png', {
  frameWidth: 32, frameHeight: 32,
});

// Single image
this.load.image('terrain_forest', 'assets/sprites/terrain_forest.png');
```
