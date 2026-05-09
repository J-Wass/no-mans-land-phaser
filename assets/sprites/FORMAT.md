# Sprite Format

`32×32` per frame. Uniform grid. Origin top-left. Power-of-two sheets where possible.

## Layout — `infantry_neutral.png` (128×256)

| Row | Animation       | Frames | Notes                                  |
|-----|-----------------|--------|----------------------------------------|
| 0   | walk-down       | 4      | walk cycle, S-facing                   |
| 1   | walk-left       | 4      | mirrored E-profile                     |
| 2   | walk-right      | 4      | E-profile                              |
| 3   | walk-up         | 4      | back view                              |
| 4   | idle            | 4      | breathing, S-facing                    |
| 5   | attack-left     | 4      | wind-up, overhead, thrust, recover     |
| 6   | attack-right    | 4      | mirror of attack-left                  |
| 7   | rest            | 4      | kneeling, sword planted                |

Total frames: **32**. Walk and attack run at **6–8 fps**. Idle at **3–4 fps**. Rest can hold a single frame.

## Phaser loader

```ts
this.load.spritesheet('infantry_verdant',
  'assets/sprites/infantry_verdant.png',
  { frameWidth: 32, frameHeight: 32 });

const ANIMS = {
  'walk-down':    { row: 0, frames: 4, fps: 7,  loop: true  },
  'walk-left':    { row: 1, frames: 4, fps: 7,  loop: true  },
  'walk-right':   { row: 2, frames: 4, fps: 7,  loop: true  },
  'walk-up':      { row: 3, frames: 4, fps: 7,  loop: true  },
  'idle':         { row: 4, frames: 4, fps: 3,  loop: true  },
  'attack-left':  { row: 5, frames: 4, fps: 10, loop: false },
  'attack-right': { row: 6, frames: 4, fps: 10, loop: false },
  'rest':         { row: 7, frames: 4, fps: 2,  loop: true  },
};
for (const [key, a] of Object.entries(ANIMS)) {
  const start = a.row * 4;
  this.anims.create({
    key: `infantry_verdant_${key}`,
    frames: this.anims.generateFrameNumbers('infantry_verdant',
              { start, end: start + a.frames - 1 }),
    frameRate: a.fps,
    repeat: a.loop ? -1 : 0,
  });
}
```

## Recoloring for other nations

Re-run the generator with a different `PAL.tunic` / `PAL.tunicSh` / `PAL.tunicHi` and `PAL.shield*`.
Suggested per nation: Valdris `#e63946`, Mirefall `#457b9d`, Thornwall `#2a9d8f`, Dustmere `#e9c46a`, Ironcroft `#f4a261`.
