/**
 * Centralized user-facing strings for the main menu (MenuPage) and the
 * in-game scene (GameScene). Extracted for future translation.
 *
 * Static text → string constants.
 * Templated text → arrow functions (with params where values are interpolated).
 */
export const MENU_STRINGS = {
  menu: {
    version: 'v0.1',

    // First-time-player banner
    newPlayerBanner: '👋 New here? The Tutorial walks you through the basics against a passive opponent.',
    startTutorial: 'START TUTORIAL',
    dismissSymbol: '✕',
    dismissTitle: 'Dismiss',

    // Header
    title: "NO MAN'S LAND",
    subtitle: 'Pick a preset scenario, set up a standard match, or explore freely in sandbox mode.',

    // Scenario card
    scenarioPickerLabel: 'SCENARIO PICKER',
    noScenarioConfigured: 'No scenario configured',
    chooseScenarioHint: 'Choose a preset scenario.',
    tutorialScenarioButton: (name: string) => `★ ${name.toUpperCase()}`,
    scenarioButton: (name: string) => name.toUpperCase(),
    scenarioDescription: (description: string, playerName: string, aiNames: string) =>
      `${description}\nPlayer: ${playerName} vs ${aiNames}`,
    scenarioPlayerFallback: '?',
    addScenarioHint: 'Add a scenario preset in src/config/scenarios.json to enable scenario mode.',
    startScenario: 'START SCENARIO',
    scenarioUnavailable: 'SCENARIO UNAVAILABLE',

    // Standard match card
    standardMatchLabel: 'STANDARD MATCH',
    customSetupName: 'Custom Setup',
    standardMatchDescription: 'Tune the opponent count and difficulty, then launch a normal match.',
    opponentsTitle: 'Opponents',
    difficultyTitle: 'Difficulty',
    difficultyEasy: 'EASY',
    difficultyMedium: 'MEDIUM',
    difficultyHard: 'HARD',
    startStandardMatch: 'START STANDARD MATCH',
    matchSummary: (opponentCount: number, difficulty: string) =>
      `${opponentCount} Opponent${opponentCount === 1 ? '' : 's'}  |  ${difficulty}`,

    // Sandbox card
    sandboxLabel: 'SANDBOX',
    freePlayName: 'Free Play',
    sandboxDescription: 'No resource costs. No fog of war. Adjust AI level and paint terrain mid-game using the left toolbar.',
    startSandbox: 'START SANDBOX',

    // Load row
    loadHint: 'Or continue from your last local save.',
    loadSavedGame: 'LOAD SAVED GAME',
  },

  game: {
    // Floating text above a captured city
    captured: () => 'CAPTURED!',

    // Unidentified-contact markers (fog of war)
    heavilyArmoredContact: 'Heavily Armored Contact',
    lightlyArmoredContact: 'Lightly Armored Contact',
  },
} as const;
