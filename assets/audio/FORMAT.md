# Audio Format

All audio files should be placed in this folder. Phaser supports both Web Audio API and HTML5 Audio.

## File formats

Provide **two formats** per sound for maximum browser compatibility:
- `.ogg` — preferred (smaller, open format)
- `.mp3` — fallback for Safari / iOS

Phaser will automatically pick the supported format when you pass an array:
```typescript
this.load.audio('sound_sword', ['assets/audio/sound_sword.ogg', 'assets/audio/sound_sword.mp3']);
```

## Recommended specs

| Type         | Sample rate | Channels | Bitrate  |
|--------------|-------------|----------|----------|
| SFX (short)  | 44100 Hz    | Mono     | 128 kbps |
| Music (loop) | 44100 Hz    | Stereo   | 192 kbps |

Keep SFX files under 1 MB. Music tracks should loop seamlessly (loop-point metadata can be embedded with [ogg-opus](https://www.audacityteam.org/)).

## Expected sound effects

```
sfx_sword_hit.ogg / .mp3         — melee attack landing
sfx_arrow_fire.ogg / .mp3        — ranged unit firing
sfx_arrow_hit.ogg / .mp3         — arrow impact
sfx_unit_death.ogg / .mp3        — unit destroyed
sfx_build.ogg / .mp3             — building constructed
sfx_city_capture.ogg / .mp3      — city taken
sfx_research_complete.ogg / .mp3 — tech research finished
sfx_move_order.ogg / .mp3        — unit given a move order
sfx_ui_click.ogg / .mp3          — button click
sfx_ui_open.ogg / .mp3           — menu open
```

## Expected music

```
music_menu.ogg / .mp3            — main menu / lobby loop
music_game_calm.ogg / .mp3       — in-game ambient loop (no nearby combat)
music_game_battle.ogg / .mp3     — in-game tense loop (combat occurring)
music_victory.ogg / .mp3         — victory stinger
music_defeat.ogg / .mp3          — defeat stinger
```

## How to load in Phaser

In a `PreloadScene` (or `BootScene`):

```typescript
// SFX
this.load.audio('sfx_sword_hit', [
  'assets/audio/sfx_sword_hit.ogg',
  'assets/audio/sfx_sword_hit.mp3',
]);

// Music loop
this.load.audio('music_game_calm', [
  'assets/audio/music_game_calm.ogg',
  'assets/audio/music_game_calm.mp3',
]);
```

To play:
```typescript
// SFX (one-shot)
this.sound.play('sfx_sword_hit', { volume: 0.8 });

// Music (looping)
const music = this.sound.add('music_game_calm', { loop: true, volume: 0.4 });
music.play();
```
