/**
 * Centralized user-facing strings for the in-game HUD (UIScene).
 *
 * Static visible text is stored as string constants. Text that interpolates
 * runtime values is stored as arrow functions returning the formatted string.
 *
 * Only visible HUD text lives here — event names, color hex codes, font specs,
 * enum values, command type strings, and standalone icon emoji stay inline in
 * the consumer.
 */
export const HUD_STRINGS = {
  topBar: {
    gameTime: (day: number, hour: string) => `Day ${day} ${hour}:00`,
    speedPause: 'PAUSE',
    speedMultiplier: (speed: number) => `${speed}x`,
    alertsSkinny: (count: number) => `A ${count}`,
    alerts: (count: number) => `ALERTS ${count}`,
    techSkinny: 'TECH',
    research: 'RESEARCH',
    save: 'SAVE',
    menuSkinny: 'MENU',
    menu: 'MENU [ESC]',
  },

  stance: {
    heading: 'STANCE',
    orders: {
      withdraw: {
        label: 'WITHDRAW',
        tooltip: 'Disengage from combat — moves away from enemies when threatened. Use to save a wounded unit.',
      },
      hold: {
        label: 'HOLD',
        tooltip: 'Stand ground — best mitigation, no advance. Great for defenders, terrain, and walls.',
      },
      advance: {
        label: 'ADVANCE',
        tooltip: 'Press the enemy — higher offense, weaker mitigation, costs morale per round. Use to push.',
      },
    },
    brokenHint: 'BROKEN: only WITHDRAW honored — unit will HOLD otherwise.',
    advanceDowngraded: (band: string) => `Morale ${band}: ADVANCE downgraded to HOLD until morale recovers.`,
    advanceLocked: (band: string) => `Morale ${band}: ADVANCE locked.`,
    cavalryAdvanceHint: 'Advance acts as Charge: +50% damage.',
    advanceHint: 'Advance quickens the clash: +25% damage on both sides.',
  },

  spy: {
    drop: 'DROP',
    spy: 'SPY',
    dropTooltip: 'Drop cover — revert to a normal Scout (own or neutral territory only).',
    blockedInBattleTooltip: 'Cannot go undercover while in battle.',
    blockedTerritoryTooltip: 'Go undercover only on your own or neutral territory.',
    enableTooltip: 'Go undercover: invisible to enemies, infiltrates enemy land for recon. Caught and killed if an enemy gets close.',
  },

  unitPanel: {
    undercoverSuffix: '  · UNDERCOVER',
    hpLabel: 'HP',
    moraleLabel: 'Morale',
    hp: (cur: number, max: number) => `${cur}/${max}`,
    morale: (morale: number) => `${morale}`,
    primaryStats: (melee: number, ranged: number, speed: number) =>
      `Melee:${melee}  Ranged:${ranged}  Speed:${speed}`,
    secondaryStats: (armor: string, range: number, vision: number) =>
      `Armor:${armor}  Range:${range}  Vision:${vision}`,
    infoLine: (battles: number, home: string, rank: string, xp: string, status: string) =>
      `Battles:${battles}  Home:${home}  ${rank} XP:${xp}  ${status}`,
    xpMax: 'MAX',
    xpProgress: (xp: number, total: number) => `${xp}/${total}`,
    statusInBattle: 'IN BATTLE',
    statusReady: 'READY',
    manaLine: (parts: string) => `Mana: ${parts}`,
    manaFire: (pct: number) => `Fire+${pct}%DMG`,
    manaEarth: (pct: number) => `Earth+${pct}%HP`,
    manaWater: (pct: number) => `Water+${pct}%REGEN`,
    manaLightning: (spd: number) => `Lightning+${spd}SPD`,
    manaAir: (vis: number) => `Air+${vis}VIS`,
    manaShadow: (wdSuffix: string) => `Shadow:HIDDEN${wdSuffix}`,
    manaShadowWithdraw: (pct: number) => `+${pct}%WD`,
    armorFireGlass: 'Fire Glass',
    armorSteel: 'Steel',
    armorIron: 'Iron',
    armorBronze: 'Bronze',
    armorLeather: 'Leather',
    homeFallback: '-',
  },

  cityPanel: {
    health: (cur: number, max: number) => `Health: ${cur}/${max}`,
    buildings: (list: string) => `Buildings: ${list}`,
    buildingsNone: 'None',
    production: (label: string, secsLeft: string) => `Production: ${label}  (${secsLeft}s left)`,
    productionIdle: 'Production: Idle',
  },

  territoryPanel: {
    ownerUnclaimed: 'Unclaimed',
    ownerUnknown: 'Unknown',
    terrainUnknown: 'Unknown',
    titleInRegion: (row: number, col: number, terrain: string, region: string) =>
      `(${row},${col}) ${terrain} in ${region}`,
    titleNearRegion: (row: number, col: number, terrain: string, region: string) =>
      `(${row},${col}) ${terrain} near ${region}`,
    titlePlain: (row: number, col: number, terrain: string) => `(${row},${col}) ${terrain}`,
    deposit: (name: string) => `Deposit: ${name}`,
    depositNone: 'None',
    buildingEntry: (icon: string, name: string) => `${icon} ${name}`,
    noBuildings: 'No buildings',
    construction: (label: string, pct: number) => `Building: ${label} ${pct}%`,
    region: (name: string, pctStr: string) => `⬡ ${name} (${pctStr} controlled)`,
  },

  terrain: {
    plains: 'Plains',
    snowyForest: 'Snowy Forest',
    forest: 'Forest',
    mountain: 'Mountain',
    desert: 'Desert',
    water: 'Water',
  },

  diplomacy: {
    title: 'Diplomacy',
    knownNations: 'Known nations',
    openFull: 'OPEN FULL',
    peace: 'PEACE',
    war: 'WAR',
    rip: 'RIP',
    defeated: 'DEFEATED',
    relationAllied: 'Allied',
    relationAtWar: 'At War',
    relationAtPeace: 'At Peace',
  },

  alertHistory: {
    title: 'Alert History',
    close: 'CLOSE',
    entry: (time: string, text: string) => `${time}  ${text}`,
  },

  toasts: {
    entry: (time: string, text: string) => `${time}  ${text}`,
  },

  resourceBreakdown: {
    panelTitle: (emoji: string, title: string) => `${emoji} ${title}`,
    storedNow: (current: number) => `Stored now: ${current}`,
    sourcesHeading: 'Sources',
    outgoingHeading: 'Outgoing',
    none: 'None',
    indent: (line: string) => `  ${line}`,
    tip: (tip: string) => `Tip: ${tip}`,
    food: {
      title: 'Food Flow',
      baseCityIncome: (rate: string) => `Base city income ${rate}`,
      cityFarms: (rate: string) => `City farms ${rate}`,
      territoryFarms: (rate: string) => `Territory farms ${rate}`,
      plainsHarvest: (rate: string) => `Plains harvest ${rate}`,
      regionDomination: (rate: string) => `Region domination ${rate}`,
      unitUpkeep: (rate: string) => `Unit upkeep ${rate}`,
      tip: 'Claim Plains tiles, build Farms in cities or on territory outposts.',
    },
    material: {
      title: 'Material Flow',
      baseCityIncome: (rate: string) => `Base city income ${rate}`,
      cityWorkshops: (rate: string) => `City workshops ${rate}`,
      territoryWorkshops: (rate: string) => `Territory workshops ${rate}`,
      forestsAndHills: (rate: string) => `Forests and hills ${rate}`,
      regionDomination: (rate: string) => `Region domination ${rate}`,
      unitUpkeep: (rate: string) => `Unit upkeep ${rate}`,
      tip: 'Claim Forest/Hills tiles, build Workshops in cities or on outposts.',
    },
    gold: {
      title: 'Gold Flow',
      baseCityIncome: (rate: string) => `Base city income ${rate}`,
      markets: (rate: string) => `Markets ${rate}`,
      desertRevenue: (rate: string) => `Desert revenue ${rate}`,
      silverAndGold: (rate: string) => `Silver and gold deposits ${rate}`,
      regionDomination: (rate: string) => `Region domination ${rate}`,
      unitUpkeep: (rate: string) => `Unit upkeep ${rate}`,
      tip: 'Build Markets in cities, claim Desert tiles, mine silver/gold deposits.',
    },
    research: {
      title: 'Research Flow',
      baseCityIncome: (rate: string) => `Base city income ${rate}`,
      schools: (rate: string) => `Schools ${rate}`,
      tip: 'Schools add research income and speed up research +10%/level, cap +50% (requires Education tech).',
    },
  },

  resourceValue: (emoji: string, amount: number) => `${emoji} ${amount}`,

  notifications: {
    spyCaught: (r: number, c: number) => `Your spy was discovered and killed at (${r}, ${c}).`,
    tileCaptured: (nation: string, r: number, c: number, source: string) =>
      `${nation} captured tile (${r}, ${c}) from ${source}.`,
    tileClaimed: (nation: string, r: number, c: number) => `${nation} claimed tile (${r}, ${c}).`,
    tileLost: (source: string, r: number, c: number) => `${source} captured tile (${r}, ${c}) from you.`,
    unknownNation: 'Unknown nation',
    anotherNation: 'another nation',
    anEnemy: 'An enemy',
    buildingStarted: (label: string, r: number, c: number) => `${label} started at (${r}, ${c}).`,
    buildingFinished: (label: string, r: number, c: number) => `${label} finished at (${r}, ${c}).`,
    cityTrained: (city: string, unit: string) => `${city} trained ${unit}.`,
    cityCompleted: (city: string, order: string) => `${city} completed ${order}.`,
    cityBuilt: (city: string, building: string) => `${city} built ${building}.`,
    cityFallback: 'A city',
    unitWithdrew: (unit: string, r: number, c: number) => `${unit} withdrew to (${r}, ${c}).`,
    unitFallback: 'A unit',
    researchComplete: (nation: string, tech: string) => `${nation} completed ${tech}.`,
    nationFallback: 'A nation',
    warDeclared: (a: string, b: string) => `${a} and ${b} are now at war.`,
    peaceSigned: (a: string, b: string) => `${a} and ${b} signed peace.`,
    nationUnknown: 'Unknown',
    regionDominated: (region: string) => `You now dominate the ${region}! Bonus resources granted.`,
    moraleBand: (unit: string, band: string) => `${unit}: ${band}.`,
    gameSaved: 'Game saved to Slot 1',
    gameSaveFailed: 'Failed to save game — your browser storage may be full or blocked.',
  },
} as const;
