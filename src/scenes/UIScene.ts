import Phaser from 'phaser';
import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import type { Unit, BattleOrder } from '@/entities/units/Unit';
import { effectiveBattleOrder, getMoraleBand } from '@/systems/morale/moraleRules';
import { MoraleBand, MORALE_ADVANCE_BLOCK_AT_OR_BELOW } from '@/config/moraleBalance';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { GameSetup } from '@/types/gameSetup';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { EventSubscriptions } from '@/systems/events/EventSubscriptions';
import { Minimap } from '@/scenes/Minimap';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { TickEngine } from '@/systems/tick/TickEngine';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType, BUILDING_MAP_ICON, TERRITORY_BUILDING_MAP } from '@/systems/territory/TerritoryBuilding';
import { CITY_BUILDING_MAP, CityBuildingType } from '@/systems/territory/CityBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { RESOURCE_EMOJI } from '@/utils/resourceIcons';
import type { GridCoordinates } from '@/types/common';
import { weaponTierDamageBonus, mineralGoldBonus, fireManaDamageFactor, earthManaHPFactor, waterManaRegenBonus, lightningManaSpeedBonus, airManaVisionBonus, shadowManaVisionReduction, shadowManaWithdrawBonus } from '@/systems/resources/ResourceBonuses';
import { REGION_BONUS_INTERVAL, regionBonusResource, regionBonusAmount } from '@/systems/regions/RegionSystem';
import { DiplomaticStatus } from '@/types/diplomacy';
import { TICK_RATE } from '@/config/constants';
import type { TechId } from '@/systems/research/TechTree';
import { getFont, getFontSizeScale } from '@/config/accessibility';
import { moraleBandFill } from './gameSceneHelpers';
import { HUD_STRINGS } from '@/i18n/hud';

interface UISceneData {
  setup: GameSetup;
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  eventBus: GameEventBus;
  diplomacySystem: DiplomacySystem;
  tickEngine: TickEngine;
  bridge: PhaserUIBridge;
}

interface AlertEntry {
  id: number;
  text: string;
  createdAt: number;
  createdTick: number;
}

let MONO: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace' };

const TERRAIN_DISPLAY_NAME: Record<string, string> = {
  [TerrainType.PLAINS]:      HUD_STRINGS.terrain.plains,
  [TerrainType.SNOW_FOREST]: HUD_STRINGS.terrain.snowyForest,
  [TerrainType.FOREST]:      HUD_STRINGS.terrain.forest,
  [TerrainType.MOUNTAIN]:    HUD_STRINGS.terrain.mountain,
  [TerrainType.DESERT]:      HUD_STRINGS.terrain.desert,
  [TerrainType.WATER]:       HUD_STRINGS.terrain.water,
};
const STANCE_ORDERS: Array<{ order: BattleOrder; label: string; tooltip: string }> = [
  { order: 'WITHDRAW', label: HUD_STRINGS.stance.orders.withdraw.label, tooltip: HUD_STRINGS.stance.orders.withdraw.tooltip },
  { order: 'HOLD',     label: HUD_STRINGS.stance.orders.hold.label,     tooltip: HUD_STRINGS.stance.orders.hold.tooltip },
  { order: 'ADVANCE',  label: HUD_STRINGS.stance.orders.advance.label,  tooltip: HUD_STRINGS.stance.orders.advance.tooltip },
];

/** Ordinal rank of each morale band — lower index = worse — used to detect worsening transitions. */
const MORALE_BAND_ORDER: Record<MoraleBand, number> = {
  [MoraleBand.BROKEN]:   0,
  [MoraleBand.SHAKEN]:   1,
  [MoraleBand.WAVERING]: 2,
  [MoraleBand.STEADY]:   3,
  [MoraleBand.INSPIRED]: 4,
};

const RESOURCE_BUTTONS: ResourceType[] = [
  ResourceType.FOOD,
  ResourceType.RAW_MATERIAL,
  ResourceType.GOLD,
  ResourceType.RESEARCH,
];
const TICKS_PER_DAY = 100;
const SPEED_CYCLE = [0, 0.5, 1, 2, 4] as const;
const FOOD_INTERVAL = 5;
const MATERIAL_INTERVAL = 10;
const GOLD_INTERVAL = 10;
const RESEARCH_INTERVAL = 10;
const TERRAIN_FOOD_INTERVAL = 50;
const TERRAIN_MATERIAL_INTERVAL = 50;
const TERRAIN_GOLD_INTERVAL = 80;
const UPKEEP_INTERVAL = 30;

// The always-on canvas HUD intentionally uses a wider scale range than the
// shared modal formula in @/config/uiScale (full-screen layout, height-based).
function uiScale(h: number): number {
  return Math.min(1.8, Math.max(0.75, h / 900));
}

function fs(base: number, scale: number): string {
  return `${Math.round(base * scale * getFontSizeScale())}px`;
}

function perSecond(amount: number, intervalTicks: number): number {
  return amount * (TICK_RATE / intervalTicks);
}

function formatRate(amount: number): string {
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(amount % 1 === 0 ? 0 : 1)}/s`;
}

function unitDisplayName(unit: Unit): string {
  return unit.getFullName();
}

/** Display name of the nation's weapon tier (best active metal mine; flavor only beyond the +2/+4/+6 bonus). */
function resolveWeaponTier(
  deposits: ReadonlySet<TerritoryResourceType>,
  nation: ReturnType<GameState['getNation']>,
): string {
  if (deposits.has(TerritoryResourceType.FIRE_GLASS)) return HUD_STRINGS.unitPanel.weaponFireGlass;
  if (deposits.has(TerritoryResourceType.IRON)) {
    const hasSteelWorking = nation?.hasResearched('steel_working' as TechId) ?? false;
    return hasSteelWorking ? HUD_STRINGS.unitPanel.weaponSteel : HUD_STRINGS.unitPanel.weaponIron;
  }
  if (deposits.has(TerritoryResourceType.COPPER)) return HUD_STRINGS.unitPanel.weaponBronze;
  return HUD_STRINGS.unitPanel.weaponBasic;
}

export class UIScene extends Phaser.Scene {
  private setup!: GameSetup;
  private gameState!: GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!: GameEventBus;
  private subs!: EventSubscriptions;
  private minimap: Minimap | undefined;
  private tickEngine!: TickEngine;
  private playerId = '';

  private selectedUnit: Unit | null = null;
  private selectedCity: City | null = null;
  private selectedTerritoryPos: GridCoordinates | null = null;

  private gameSpeed: typeof SPEED_CYCLE[number] = 1;
  private researchBtnText: Phaser.GameObjects.Text | null = null;
  private researchProgressRect: Phaser.GameObjects.Rectangle | null = null;
  private researchBtnFullW = 0;
  private hudObjects: Phaser.GameObjects.GameObject[] = [];
  private tickText: Phaser.GameObjects.Text | null = null;
  private speedBtnText: Phaser.GameObjects.Text | null = null;
  private resourceValueTexts = new Map<ResourceType, Phaser.GameObjects.Text>();
  private hpFillRect: Phaser.GameObjects.Rectangle | null = null;
  private hpText: Phaser.GameObjects.Text | null = null;
  private moraleFillRect: Phaser.GameObjects.Rectangle | null = null;
  private moraleText: Phaser.GameObjects.Text | null = null;
  private moraleWarnText: Phaser.GameObjects.Text | null = null;
  private infoLineText: Phaser.GameObjects.Text | null = null;
  private stanceHintText: Phaser.GameObjects.Text | null = null;
  private stanceTooltip: Phaser.GameObjects.Container | null = null;
  private hpBarWidth = 0;

  private activeResourceBreakdown: ResourceType | null = null;
  private showAlertHistory = false;
  private notifications: AlertEntry[] = [];
  private toastIds: number[] = [];
  private nextAlertId = 1;
  private bridge!: PhaserUIBridge;
  private accessibilityHandler = () => this.rebuildHUD();
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: UISceneData): void {
    this.setup = data.setup;
    this.gameState = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.eventBus = data.eventBus;
    this.tickEngine = data.tickEngine;
    this.bridge = data.bridge;
    this.playerId = this.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    // Phaser reuses scene instances: reset per-game HUD state so nothing (speed,
    // alerts, open panels, a stale selection) leaks in from the previous game.
    this.gameSpeed = 1;
    this.selectedUnit = null;
    this.selectedCity = null;
    this.selectedTerritoryPos = null;
    this.activeResourceBreakdown = null;
    this.showAlertHistory = false;
    this.notifications = [];
    this.toastIds = [];
    this.nextAlertId = 1;
    this.hudObjects = [];
    this.stanceTooltip = null;

    this.subs = new EventSubscriptions(this.eventBus);
    this.setupEventListeners();
    this.rebuildHUD();
    // The minimap is created once (outside the rebuilt HUD objects) so it persists.
    this.minimap = new Minimap(this, this.gameState);
    this.scale.on('resize', this.rebuildHUD, this);
    window.addEventListener('accessibility:changed', this.accessibilityHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('accessibility:changed', this.accessibilityHandler);
      this.subs.disposeAll();
      this.minimap?.destroy();
      this.minimap = undefined;
      // this.scale is the global ScaleManager, not scene-scoped — without
      // this, a stale listener bound to this (stopped) scene instance
      // survives every return-to-menu-and-relaunch.
      this.scale.off('resize', this.rebuildHUD, this);
    });
  }

  override update(): void {
    this.minimap?.update();
    if (!this.selectedUnit) return;
    if (this.hpFillRect && this.hpText) {
      const hp = this.selectedUnit.getHealth();
      const hpMax = this.selectedUnit.getStats().maxHealth;
      const ratio = hpMax > 0 ? hp / hpMax : 0;
      const width = Math.max(1, Math.round(this.hpBarWidth * ratio));
      const color = ratio > 0.5 ? 0x44cc66 : ratio > 0.25 ? 0xddcc22 : 0xcc3322;
      this.hpFillRect.setSize(width, this.hpFillRect.height).setFillStyle(color);
      this.hpText.setText(HUD_STRINGS.unitPanel.hp(hp, hpMax));
    }

    if (this.moraleFillRect && this.moraleText) {
      const morale = this.selectedUnit.getMorale();
      const band = getMoraleBand(morale);
      const width = Math.max(1, Math.round(this.hpBarWidth * morale / 100));
      this.moraleFillRect.setSize(width, this.moraleFillRect.height).setFillStyle(moraleBandFill(band));
      this.moraleText.setText(HUD_STRINGS.unitPanel.morale(morale));
      this.moraleWarnText?.setText(band === MoraleBand.STEADY || band === MoraleBand.INSPIRED ? '' : band);
    }

    if (this.infoLineText) {
      const battles = this.selectedUnit.getBattlesEngaged();
      const homeId = this.selectedUnit.getHomeCityId();
      const homeName = homeId ? this.gameState.getCity(homeId)?.getName() ?? HUD_STRINGS.unitPanel.homeFallback : HUD_STRINGS.unitPanel.homeFallback;
      const rank = this.selectedUnit.getRankLabel();
      const xp = this.selectedUnit.getXP();
      const toNext = this.selectedUnit.getXPToNextLevel();
      const xpText = toNext > 0 ? HUD_STRINGS.unitPanel.xpProgress(xp, xp + toNext) : HUD_STRINGS.unitPanel.xpMax;
      const status = this.selectedUnit.isEngagedInBattle() ? HUD_STRINGS.unitPanel.statusInBattle : HUD_STRINGS.unitPanel.statusReady;
      this.infoLineText.setText(HUD_STRINGS.unitPanel.infoLine(battles, homeName, rank, xpText, status));
    }

    if (this.stanceHintText) {
      const morale = this.selectedUnit.getMorale();
      const band   = getMoraleBand(morale);
      const eff    = effectiveBattleOrder(this.selectedUnit);
      const chosen = this.selectedUnit.getBattleOrder();
      if (band === MoraleBand.BROKEN) {
        this.stanceHintText.setColor('#ff8888');
        this.stanceHintText.setText(HUD_STRINGS.stance.brokenHint);
      } else if (chosen === 'ADVANCE' && eff !== 'ADVANCE') {
        // ADVANCE is the chosen stance but morale is overriding it.
        this.stanceHintText.setColor('#ffaa44');
        this.stanceHintText.setText(HUD_STRINGS.stance.advanceDowngraded(band));
      } else if (eff !== 'ADVANCE' && band !== MoraleBand.STEADY && band !== MoraleBand.INSPIRED) {
        // ADVANCE not chosen, but morale would block it — show why the button is grey.
        this.stanceHintText.setColor('#d7c7a0');
        this.stanceHintText.setText(HUD_STRINGS.stance.advanceLocked(band));
      } else {
        this.stanceHintText.setColor('#d7c7a0');
        this.stanceHintText.setText(this.selectedUnit.getUnitType() === 'CAVALRY'
          ? HUD_STRINGS.stance.cavalryAdvanceHint
          : HUD_STRINGS.stance.advanceHint);
      }
    }
  }

  private setupEventListeners(): void {
    this.subs.on('game:tick', ({ tick }) => {
      const prevWidth = this.tickText?.width ?? 0;
      this.tickText?.setText(formatGameTime(tick));
      // The day counter widens as it rolls over digits ("Day 9" → "Day 10" → "Day 100").
      // When the width grows, the SPEED button placement that flowed past this text is
      // now stale, so re-layout once. Comparing widths is cheap and only triggers on a
      // genuine grow event.
      const newWidth = this.tickText?.width ?? 0;
      if (newWidth > prevWidth + 0.5) {
        this.rebuildHUD();
        return;
      }
      // City/territory panels are static drawings; redraw once a second so their
      // production progress, HP and construction % stay current.
      if ((this.selectedCity || this.selectedTerritoryPos) && tick % TICK_RATE === 0) {
        this.rebuildHUD();
        return;
      }
      this.refreshResources();
    });

    this.subs.on('unit:selected', ({ unit }) => {
      this.selectedUnit = unit;
      if (unit) {
        this.selectedCity = null;
        this.selectedTerritoryPos = null;
      }
      this.rebuildHUD();
    });

    this.subs.on('city:selected', ({ city }) => {
      this.selectedCity = city;
      if (city) {
        this.selectedUnit = null;
        this.selectedTerritoryPos = null;
      }
      this.rebuildHUD();
    });

    this.subs.on('territory:highlighted', ({ position }) => {
      this.selectedTerritoryPos = position;
      if (position) {
        this.selectedUnit = null;
        this.selectedCity = null;
      }
      this.rebuildHUD();
    });

    this.subs.on('unit:battle-order-changed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildHUD();
    });

    this.subs.on('unit:spy-changed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildHUD();
    });

    this.subs.on('spy:detected', ({ ownerNationId, position }) => {
      const localNation = this.getLocalNation();
      if (localNation && ownerNationId === localNation.getId()) {
        this.pushNotification(HUD_STRINGS.notifications.spyCaught(position.row, position.col));
      }
    });

    this.subs.on('unit:destroyed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) {
        this.selectedUnit = null;
      }
      this.rebuildHUD();
    });

    this.subs.on('territory:claimed', ({ position, nationId, fromNationId }) => {
      const localNation = this.getLocalNation();
      if (!localNation) return;
      if (nationId !== localNation.getId() && fromNationId !== localNation.getId()) return;

      const nationName = this.gameState.getNation(nationId)?.getName() ?? HUD_STRINGS.notifications.unknownNation;
      const sourceName = fromNationId ? this.gameState.getNation(fromNationId)?.getName() ?? HUD_STRINGS.notifications.anotherNation : null;
      this.pushNotification(sourceName && nationId === localNation.getId()
        ? HUD_STRINGS.notifications.tileCaptured(nationName, position.row, position.col, sourceName)
        : nationId === localNation.getId()
          ? HUD_STRINGS.notifications.tileClaimed(nationName, position.row, position.col)
          : HUD_STRINGS.notifications.tileLost(sourceName ?? HUD_STRINGS.notifications.anEnemy, position.row, position.col));
      this.rebuildHUD();
    });

    this.subs.on('territory:building-started', ({ position, nationId, building }) => {
      if (!this.isLocalNation(nationId)) return;
      const label = TERRITORY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' ');
      this.pushNotification(HUD_STRINGS.notifications.buildingStarted(label, position.row, position.col));
      this.rebuildHUD();
    });

    this.subs.on('territory:building-built', ({ position, building }) => {
      const ownerId = this.gameState.getGrid().getTerritory(position)?.getControllingNation();
      if (!ownerId || !this.isLocalNation(ownerId)) return;
      const label = TERRITORY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' ');
      this.pushNotification(HUD_STRINGS.notifications.buildingFinished(label, position.row, position.col));
      this.rebuildHUD();
    });

    this.subs.on('city:unit-spawned', ({ cityId, unitType }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? HUD_STRINGS.notifications.cityFallback;
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      this.pushNotification(HUD_STRINGS.notifications.cityTrained(cityName, unitType.replace(/_/g, ' ').toLowerCase()));
    });

    this.subs.on('city:production-complete', ({ cityId, order }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? HUD_STRINGS.notifications.cityFallback;
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      this.pushNotification(HUD_STRINGS.notifications.cityCompleted(cityName, order.label.toLowerCase()));
    });

    this.subs.on('city:building-built', ({ cityId, building }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? HUD_STRINGS.notifications.cityFallback;
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      const label = CITY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' ');
      this.pushNotification(HUD_STRINGS.notifications.cityBuilt(cityName, label));
    });

    this.subs.on('unit:withdrew', ({ unitId, to }) => {
      const unit = this.gameState.getUnit(unitId);
      if (!unit || !this.isLocalNation(unit.getOwnerId())) return;
      const label = unit ? unitDisplayName(unit) : HUD_STRINGS.notifications.unitFallback;
      this.pushNotification(HUD_STRINGS.notifications.unitWithdrew(label, to.row, to.col));
      this.rebuildHUD();
    });

    this.subs.on('nation:research-complete', ({ nationId, techId }) => {
      if (!this.isLocalNation(nationId)) return;
      const nationName = this.gameState.getNation(nationId)?.getName() ?? HUD_STRINGS.notifications.nationFallback;
      this.pushNotification(HUD_STRINGS.notifications.researchComplete(nationName, techId.replace(/_/g, ' ')));
    });

    this.subs.on('diplomacy:war-declared', ({ nationId1, nationId2 }) => {
      if (!this.isLocalNation(nationId1) && !this.isLocalNation(nationId2)) return;
      const a = this.gameState.getNation(nationId1)?.getName() ?? HUD_STRINGS.notifications.nationUnknown;
      const b = this.gameState.getNation(nationId2)?.getName() ?? HUD_STRINGS.notifications.nationUnknown;
      this.pushNotification(HUD_STRINGS.notifications.warDeclared(a, b));
      this.flashWarAlert();
      this.rebuildHUD();
    });

    this.subs.on('diplomacy:peace-signed', ({ fromNationId, toNationId }) => {
      if (!this.isLocalNation(fromNationId) && !this.isLocalNation(toNationId)) return;
      const a = this.gameState.getNation(fromNationId)?.getName() ?? HUD_STRINGS.notifications.nationUnknown;
      const b = this.gameState.getNation(toNationId)?.getName() ?? HUD_STRINGS.notifications.nationUnknown;
      this.pushNotification(HUD_STRINGS.notifications.peaceSigned(a, b));
      this.rebuildHUD();
    });

    this.subs.on('unit:step-complete', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildHUD();
    });

    // Track which regions we've already notified about to avoid repeat messages
    const dominatedNotified = new Set<string>();
    this.subs.on('region:dominated', ({ regionId, nationId }) => {
      if (!this.isLocalNation(nationId)) return;
      if (dominatedNotified.has(regionId)) return;
      dominatedNotified.add(regionId);
      const region = this.gameState.getRegionSystem()?.getRegion(regionId);
      if (region) this.pushNotification(HUD_STRINGS.notifications.regionDominated(region.name));
    });

    // Morale band crossings — toast only for player-owned units and only when
    // entering a worse band, or recovering all the way to STEADY/INSPIRED.
    this.subs.on('morale:band-changed', ({ unitId, oldBand, newBand }) => {
      const unit = this.gameState.getUnit(unitId);
      if (!unit || !this.isLocalNation(unit.getOwnerId())) return;
      const worsening = MORALE_BAND_ORDER[newBand] < MORALE_BAND_ORDER[oldBand];
      const reachedGood = newBand === MoraleBand.STEADY || newBand === MoraleBand.INSPIRED;
      if (worsening || reachedGood) {
        this.pushNotification(HUD_STRINGS.notifications.moraleBand(unitDisplayName(unit), newBand));
      } else if (this.selectedUnit?.id === unitId) {
        // Re-evaluate the selected unit's stance buttons (ADVANCE availability).
        this.rebuildHUD();
      }
    });
  }

  private rebuildHUD(): void {
    MONO = { fontFamily: getFont() };
    // Keep the persistent minimap sized/positioned to the current viewport.
    // Pass the actual top-bar height so the minimap sits below it instead of on top
    // of the resource row when the bar wraps to two lines in skinny mode.
    const W = this.scale.width;
    const H = this.scale.height;
    const scale = uiScale(H);
    const skinnyBar = W < 1100;
    const barH = Math.round((skinnyBar ? 88 : 52) * scale);
    this.minimap?.layout(barH + Math.round(6 * scale));
    for (const obj of this.hudObjects) {
      if (obj.active) obj.destroy();
    }
    this.hudObjects = [];
    this.tickText = null;
    this.speedBtnText = null;
    this.researchBtnText = null;
    this.researchProgressRect = null;
    this.researchBtnFullW = 0;
    this.resourceValueTexts.clear();
    this.hpFillRect = null;
    this.hpText = null;
    this.moraleFillRect = null;
    this.moraleText = null;
    this.moraleWarnText = null;
    this.infoLineText = null;
    this.stanceHintText = null;
    this.stanceTooltip?.destroy();
    this.stanceTooltip = null;
    this.hpBarWidth = 0;

    this.buildTopBar(W, scale);
    this.buildNotificationToasts(scale);
    this.buildResourceBreakdownPanel(scale);
    this.buildAlertHistoryPanel(W, H, scale);
    this.buildDiplomacyWidget(W, H, scale);
    this.buildInfoPanel(H, scale);
    this.refreshResources();
  }

  private buildTopBar(W: number, scale: number): void {
    // Bumped from 960 — at 960-1100 the resource row used to crowd the alerts button on row 1.
    const skinny = W < 1100;
    const widthFactor = skinny ? Phaser.Math.Clamp(W / 620, 0.62, 1) : 1;
    const barH = Math.round((skinny ? 88 : 52) * scale);
    const pad = Math.round((skinny ? 8 : 10) * scale);
    const midY = skinny ? Math.round(25 * scale) : Math.round(barH / 2);
    const resourceY = skinny ? Math.round(64 * scale) : midY;
    const btnW = Math.round(96 * scale * widthFactor);
    const btnH = Math.round((skinny ? 28 : 30) * scale);
    const gap = Math.round((skinny ? 6 : 8) * scale);

    // HUD backgrounds are interactive so clicks on them are captured here and
    // don't fall through to the map tile underneath (GameScene sits below).
    this.track(this.add.rectangle(W / 2, 0, W, barH, 0x0d1020, 0.94).setOrigin(0.5, 0).setInteractive());
    this.track(this.add.rectangle(W / 2, barH, W, 1, 0x3355bb, 0.7).setOrigin(0.5, 0));

    this.tickText = this.track(this.add.text(pad, midY, formatGameTime(this.tickEngine.getCurrentTick()), {
      ...MONO, fontSize: fs(skinny ? 13 : 15, scale), color: '#d6e0ff',
    }).setOrigin(0, 0.5)) as Phaser.GameObjects.Text;

    // Place the difficulty label after the measured width of the time label so the
    // two never overlap regardless of "Day N HH:00" length or font scaling.
    const difficultyX = pad + this.tickText.width + gap;
    const difficultyText = this.track(this.add.text(difficultyX, midY, this.setup.difficulty.toUpperCase(), {
      ...MONO, fontSize: fs(skinny ? 10 : 12, scale), color: difficultyColor(this.setup.difficulty), fontStyle: 'bold',
    }).setOrigin(0, 0.5)) as Phaser.GameObjects.Text;

    // Flow the SPEED button past the actual end of the difficulty text, so it
    // never gets covered as the day counter grows or fonts scale up. Keep a
    // sane minimum offset so the layout still looks consistent at game start.
    const speedBtnW   = Math.round(60 * scale * widthFactor);
    const leftFlowEnd = difficultyX + difficultyText.width;
    const minSpeedX   = pad + Math.round((skinny ? 142 : 196) * scale * widthFactor);
    const speedX      = Math.max(minSpeedX, leftFlowEnd + gap + speedBtnW / 2);
    this.makeButton(speedX, midY, speedBtnW, btnH, speedLabel(this.gameSpeed), scale, () => {
      const idx = SPEED_CYCLE.indexOf(this.gameSpeed);
      this.gameSpeed = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length]!;
      this.speedBtnText?.setText(speedLabel(this.gameSpeed));
      this.eventBus.emit('game:speed-change', { speed: this.gameSpeed });
    }, 0x1b2442);
    this.speedBtnText = this.hudObjects[this.hudObjects.length - 1] as Phaser.GameObjects.Text;

    // Flow ALERTS button immediately after the SPEED button.
    const alertsLabel = skinny ? HUD_STRINGS.topBar.alertsSkinny(this.notifications.length) : HUD_STRINGS.topBar.alerts(this.notifications.length);
    const alertsBtnWFlow = Math.round((skinny ? 58 : 92) * scale * widthFactor);
    const alertsX = speedX + speedBtnW / 2 + gap + alertsBtnWFlow / 2;
    this.makeButton(alertsX, midY, alertsBtnWFlow, btnH, alertsLabel, scale, () => {
      this.showAlertHistory = !this.showAlertHistory;
      this.rebuildHUD();
    }, this.showAlertHistory ? 0x3c2a5e : 0x241c36);

    const resourceW = skinny
      ? Math.floor((W - pad * 2 - gap * (RESOURCE_BUTTONS.length - 1)) / RESOURCE_BUTTONS.length)
      : Math.round(86 * scale);
    const resourceStartX = skinny
      ? pad
      : W - pad - btnW * 3 - gap * 3 - resourceW * RESOURCE_BUTTONS.length - gap * (RESOURCE_BUTTONS.length - 1) - Math.round(18 * scale);
    RESOURCE_BUTTONS.forEach((resource, index) => {
      const x = resourceStartX + index * (resourceW + gap) + resourceW / 2;
      this.makeResourceButton(x, resourceY, resourceW, btnH, scale, resource);
    });

    // Clamp the right-side buttons so they can't extend far enough left to draw on top
    // of the alerts/speed buttons. If the viewport is too narrow for the desired widths,
    // shrink the three right buttons proportionally (with a readable floor) instead.
    const alertsRight  = alertsX + alertsBtnWFlow / 2;
    const idealRightLeft = W - pad - btnW * 3 - gap * 2;
    const minRightLeft   = alertsRight + gap;
    const rightLeftEdge  = Math.max(idealRightLeft, minRightLeft);
    const rightAvailable = Math.max(0, W - pad - rightLeftEdge);
    const desiredRightW  = btnW * 3 + gap * 2;
    const rightBtnW      = desiredRightW <= rightAvailable
      ? btnW
      : Math.max(Math.round(36 * scale), Math.floor((rightAvailable - gap * 2) / 3));

    const researchX = rightLeftEdge + rightBtnW / 2;
    const saveX     = researchX + rightBtnW + gap;
    const menuX     = saveX + rightBtnW + gap;

    const nation = this.getLocalNation();
    const currentResearch = nation?.getCurrentResearch();
    const researchBtnLabel = currentResearch
      ? currentResearch.techId.replace(/_/g, ' ').toUpperCase().slice(0, skinny ? 6 : 10)
      : (skinny ? HUD_STRINGS.topBar.techSkinny : HUD_STRINGS.topBar.research);
    const researchBtnFill = currentResearch ? 0x1e2810 : 0x1a1e3c;
    this.makeButton(researchX, midY, rightBtnW, btnH, researchBtnLabel, scale, () => {
      if (this.bridge.isResearchOpen()) {
        this.bridge.closeResearch();
      } else {
        this.bridge.openResearch();
      }
    }, researchBtnFill);
    this.researchBtnText = this.hudObjects[this.hudObjects.length - 1] as Phaser.GameObjects.Text;
    // Thin progress bar across the bottom of the research button
    const barThick = Math.max(3, Math.round(3 * scale));
    this.researchProgressRect = this.track(this.add.rectangle(
      researchX - rightBtnW / 2,
      midY + btnH / 2 - barThick,
      0, barThick, 0x44cc22,
    ).setOrigin(0, 0)) as Phaser.GameObjects.Rectangle;
    this.researchBtnFullW = rightBtnW;

    this.makeButton(saveX, midY, rightBtnW, btnH, HUD_STRINGS.topBar.save, scale, () => {
      const ok = this.bridge.saveToSlot(1);
      this.pushNotification(ok ? HUD_STRINGS.notifications.gameSaved : HUD_STRINGS.notifications.gameSaveFailed);
      this.rebuildHUD();
    }, 0x14321e);

    this.makeButton(menuX, midY, rightBtnW, btnH, skinny ? HUD_STRINGS.topBar.menuSkinny : HUD_STRINGS.topBar.menu, scale, () => {
      this.scene.get('GameScene')?.input.keyboard?.emit('keydown-ESC');
    }, 0x1e2244);
  }

  private makeResourceButton(
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
    resource: ResourceType,
  ): void {
    const active = this.activeResourceBreakdown === resource;
    const bg = this.track(this.add.rectangle(x, y, w, h, active ? 0x2b3d5d : 0x162030)
      .setStrokeStyle(1, active ? 0x88aaff : 0x345070)
      .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Rectangle;
    const label = this.track(this.add.text(x, y, '', {
      ...MONO, fontSize: fs(12, scale), color: '#eef5ff',
    }).setOrigin(0.5)) as Phaser.GameObjects.Text;

    this.resourceValueTexts.set(resource, label);
    bg.on('pointerover', () => bg.setFillStyle(active ? 0x36517b : 0x20304a));
    bg.on('pointerout', () => bg.setFillStyle(active ? 0x2b3d5d : 0x162030));
    bg.on('pointerup', () => {
      this.activeResourceBreakdown = this.activeResourceBreakdown === resource ? null : resource;
      this.rebuildHUD();
    });
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    scale: number,
    onClick: () => void,
    fill: number,
  ): void {
    const bg = this.track(this.add.rectangle(x, y, w, h, fill)
      .setStrokeStyle(1, 0x4464aa)
      .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Rectangle;
    const text = this.track(this.add.text(x, y, label, {
      ...MONO, fontSize: fs(11, scale), color: '#d8e4ff',
    }).setOrigin(0.5)) as Phaser.GameObjects.Text;

    bg.on('pointerover', () => bg.setFillStyle(fill + 0x101018));
    bg.on('pointerout', () => bg.setFillStyle(fill));
    bg.on('pointerup', () => onClick());

    void text;
  }

  private buildNotificationToasts(scale: number): void {
    const toastEntries = this.toastIds
      .map(id => this.notifications.find(notification => notification.id === id))
      .filter((entry): entry is AlertEntry => Boolean(entry))
      .slice(-4)
      .reverse();
    const startX = Math.round(14 * scale);
    let y = Math.round(62 * scale);

    for (const entry of toastEntries) {
      const width = Math.min(Math.round(420 * scale), Math.round(this.scale.width * 0.45));
      const height = Math.round(30 * scale);
      this.track(this.add.rectangle(startX, y, width, height, 0x111a2a, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x3355aa).setInteractive());
      this.track(this.add.text(startX + Math.round(10 * scale), y + height / 2, HUD_STRINGS.toasts.entry(formatGameTime(entry.createdTick), entry.text), {
        ...MONO, fontSize: fs(11, scale), color: '#f2f6ff',
        wordWrap: { width: width - Math.round(20 * scale) },
      }).setOrigin(0, 0.5));
      y += height + Math.round(6 * scale);
    }
  }

  private buildAlertHistoryPanel(W: number, H: number, scale: number): void {
    if (!this.showAlertHistory) return;

    const pad = Math.round(12 * scale);
    const panelW = Math.min(Math.round(460 * scale), W - pad * 2);
    const panelH = Math.min(Math.round(340 * scale), H - Math.round(120 * scale));
    const x = pad;
    const y = Math.round(62 * scale);
    const rowH = Math.round(24 * scale);
    const maxRows = Math.max(6, Math.floor((panelH - pad * 3 - rowH) / rowH));

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0c1220, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x476ac2).setInteractive());
    this.track(this.add.text(x + pad, y + pad, HUD_STRINGS.alertHistory.title, {
      ...MONO, fontSize: fs(14, scale), color: '#ffddb0', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.makeButton(x + panelW - pad - Math.round(74 * scale), y + pad + Math.round(10 * scale), Math.round(74 * scale), Math.round(24 * scale), HUD_STRINGS.alertHistory.close, scale, () => {
      this.showAlertHistory = false;
      this.rebuildHUD();
    }, 0x2a1e30);

    const recent = [...this.notifications].slice(-maxRows).reverse();
    recent.forEach((entry, index) => {
      this.track(this.add.text(x + pad, y + pad * 2 + Math.round(26 * scale) + index * rowH, HUD_STRINGS.alertHistory.entry(formatGameTime(entry.createdTick), entry.text), {
        ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
        wordWrap: { width: panelW - pad * 2 },
      }).setOrigin(0, 0));
    });
  }

  private buildResourceBreakdownPanel(scale: number): void {
    if (!this.activeResourceBreakdown) return;

    const pad = Math.round(12 * scale);
    const panelW = Math.round(320 * scale);
    const panelH = Math.round(290 * scale);
    const x = this.scale.width - panelW - Math.round(230 * scale);
    const y = Math.round(62 * scale);
    const breakdown = this.getResourceBreakdown(this.activeResourceBreakdown);

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0d1426, 0.97)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a6ec7).setInteractive());
    this.track(this.add.text(x + pad, y + pad, HUD_STRINGS.resourceBreakdown.panelTitle(RESOURCE_EMOJI[this.activeResourceBreakdown], breakdown.title), {
      ...MONO, fontSize: fs(14, scale), color: '#f6e0a0', fontStyle: 'bold',
    }).setOrigin(0, 0));

    const lines = [
      HUD_STRINGS.resourceBreakdown.storedNow(breakdown.current),
      '',
      HUD_STRINGS.resourceBreakdown.sourcesHeading,
      ...breakdown.sources.map(line => HUD_STRINGS.resourceBreakdown.indent(line)),
      '',
      HUD_STRINGS.resourceBreakdown.outgoingHeading,
      ...(breakdown.outgoing.length > 0 ? breakdown.outgoing.map(line => HUD_STRINGS.resourceBreakdown.indent(line)) : [HUD_STRINGS.resourceBreakdown.indent(HUD_STRINGS.resourceBreakdown.none)]),
    ];

    this.track(this.add.text(x + pad, y + Math.round(38 * scale), lines.join('\n'), {
      ...MONO, fontSize: fs(11, scale), color: '#dfe8ff',
      lineSpacing: Math.round(2 * scale),
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));

    // Tip line at bottom of panel
    this.track(this.add.text(x + pad, y + panelH - Math.round(36 * scale), HUD_STRINGS.resourceBreakdown.tip(breakdown.tip), {
      ...MONO, fontSize: fs(10, scale), color: '#8dd8a8',
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));
  }

  private buildDiplomacyWidget(W: number, H: number, scale: number): void {
    const localNation = this.getLocalNation();
    if (!localNation) return;

    const knownIds = this.gameState.getKnownNationIds(localNation.getId());
    const others = knownIds
      .map(id => this.gameState.getNation(id))
      .filter((nation): nation is NonNullable<ReturnType<GameState['getNation']>> => Boolean(nation))
      .filter(nation => nation.getId() !== localNation.getId());
    const defeated = this.gameState.getDefeatedNations();
    if (others.length === 0 && defeated.length === 0) return;

    const pad = Math.round(10 * scale);
    const rowH = Math.round(42 * scale);
    const visibleRows = others.length + defeated.length;
    const panelW = Math.round(298 * scale);
    const panelH = Math.round(58 * scale) + visibleRows * rowH + pad;
    const x = W - panelW - pad;
    const y = H - panelH - pad;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0c1220, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a6ec7).setInteractive());
    this.track(this.add.text(x + pad, y + pad, HUD_STRINGS.diplomacy.title, {
      ...MONO, fontSize: fs(14, scale), color: '#d8e3ff', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + pad + Math.round(16 * scale), HUD_STRINGS.diplomacy.knownNations, {
      ...MONO, fontSize: fs(10, scale), color: '#95a8d8',
    }).setOrigin(0, 0));

    this.makeButton(x + panelW - pad - Math.round(48 * scale), y + pad + Math.round(12 * scale), Math.round(96 * scale), Math.round(24 * scale), HUD_STRINGS.diplomacy.openFull, scale, () => {
      this.openDiplomacy();
    }, 0x1b2540);

    let rowY = y + Math.round(54 * scale);
    for (const nation of others.slice(0, visibleRows)) {
      const relation = localNation.getRelation(nation.getId());
      const row = this.track(this.add.rectangle(x + panelW / 2, rowY + rowH / 2, panelW - pad * 2, rowH - Math.round(4 * scale), 0x10192a, 0.98)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x2b426d)
        .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Rectangle;
      row.on('pointerup', () => this.openDiplomacy(nation.getId()));
      row.on('pointerover', () => row.setFillStyle(0x17243a, 0.98));
      row.on('pointerout', () => row.setFillStyle(0x10192a, 0.98));

      this.track(this.add.circle(x + pad + Math.round(9 * scale), rowY + rowH / 2 - Math.round(2 * scale), Math.max(4, Math.round(5 * scale)), parseInt(nation.getColor().replace('#', ''), 16)));
      this.track(this.add.text(x + pad + Math.round(22 * scale), rowY + Math.round(11 * scale), nation.getName(), {
        ...MONO, fontSize: fs(12, scale), color: '#e0e9ff', fontStyle: 'bold',
      }).setOrigin(0, 0));
      this.track(this.add.text(x + pad + Math.round(22 * scale), rowY + Math.round(25 * scale), relationLabel(relation), {
        ...MONO, fontSize: fs(10, scale), color: relationColor(relation),
      }).setOrigin(0, 0));

      // Allies get no war/peace button — alliances are scenario-defined and not
      // something the widget should be able to break with one click.
      const btnLabel = relation === DiplomaticStatus.WAR ? HUD_STRINGS.diplomacy.peace : HUD_STRINGS.diplomacy.war;
      const btnFill = relation === DiplomaticStatus.WAR ? 0x21402c : 0x402020;
      if (relation !== DiplomaticStatus.ALLY) this.makeButton(x + panelW - pad - Math.round(34 * scale), rowY + rowH / 2 - Math.round(2 * scale), Math.round(68 * scale), Math.round(24 * scale), btnLabel, scale, () => {
        if (relation === DiplomaticStatus.WAR) {
          this.networkAdapter.sendCommand({
            type: 'PROPOSE_PEACE',
            playerId: this.playerId,
            targetNationId: nation.getId(),
            issuedAtTick: this.tickEngine.getCurrentTick(),
          }).then(result => {
            if (!result.success && result.reason) {
              this.pushNotification(result.reason);
            }
          }).catch(() => { /* ignore */ });
        } else {
          void this.networkAdapter.sendCommand({
            type: 'DECLARE_WAR',
            playerId: this.playerId,
            targetNationId: nation.getId(),
            issuedAtTick: this.tickEngine.getCurrentTick(),
          });
        }
      }, btnFill);

      rowY += rowH;
    }

    for (const nation of defeated) {
      const row = this.track(this.add.rectangle(x + panelW / 2, rowY + rowH / 2, panelW - pad * 2, rowH - Math.round(4 * scale), 0x141414, 0.95)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x555555)) as Phaser.GameObjects.Rectangle;

      this.track(this.add.text(x + pad + Math.round(4 * scale), rowY + Math.round(9 * scale), HUD_STRINGS.diplomacy.rip, {
        ...MONO, fontSize: fs(11, scale), color: '#9aa0a8', fontStyle: 'bold',
      }).setOrigin(0, 0));
      this.track(this.add.text(x + pad + Math.round(42 * scale), rowY + Math.round(11 * scale), nation.name, {
        ...MONO, fontSize: fs(12, scale), color: '#b8bec8', fontStyle: 'bold',
      }).setOrigin(0, 0));
      this.track(this.add.text(x + pad + Math.round(42 * scale), rowY + Math.round(25 * scale), HUD_STRINGS.diplomacy.defeated, {
        ...MONO, fontSize: fs(10, scale), color: '#9aa0a8',
      }).setOrigin(0, 0));
      row.setFillStyle(0x141414, 0.95);
      rowY += rowH;
    }
  }

  private buildInfoPanel(H: number, scale: number): void {
    if (this.selectedUnit) {
      this.buildUnitPanel(H, scale);
      return;
    }
    if (this.selectedCity) {
      this.buildCityPanel(H, scale);
      return;
    }
    if (this.selectedTerritoryPos) {
      this.buildTerritoryPanel(H, scale);
    }
  }

  private buildUnitPanel(H: number, scale: number): void {
    const unit = this.selectedUnit!;
    const nation = this.gameState.getNation(unit.getOwnerId());
    const deposits = nation ? this.gameState.getNationActiveDeposits(nation.getId()) : new Set<TerritoryResourceType>();
    const counts = nation ? this.gameState.getNationActiveDepositCounts(nation.getId()) : new Map<TerritoryResourceType, number>();
    const weaponBonus = weaponTierDamageBonus(deposits);
    const weaponLabel = resolveWeaponTier(deposits, nation);
    const armorLabel = unit.getStats().armorType === 'heavy' ? HUD_STRINGS.unitPanel.armorHeavy : HUD_STRINGS.unitPanel.armorLight;

    const manaParts: string[] = [];
    const fireFactor = fireManaDamageFactor(deposits, counts);
    if (fireFactor > 1) manaParts.push(HUD_STRINGS.unitPanel.manaFire(Math.round((fireFactor - 1) * 100)));
    const earthFactor = earthManaHPFactor(deposits, counts);
    if (earthFactor > 1) manaParts.push(HUD_STRINGS.unitPanel.manaEarth(Math.round((earthFactor - 1) * 100)));
    const waterRegen = waterManaRegenBonus(deposits, counts);
    if (waterRegen > 0) manaParts.push(HUD_STRINGS.unitPanel.manaWater(Math.round(waterRegen * 100)));
    const lightningSpeed = lightningManaSpeedBonus(deposits, counts);
    if (lightningSpeed > 0) manaParts.push(HUD_STRINGS.unitPanel.manaLightning(lightningSpeed));
    const airVision = airManaVisionBonus(deposits, counts);
    if (airVision > 0) manaParts.push(HUD_STRINGS.unitPanel.manaAir(airVision));
    const shadowReduce = shadowManaVisionReduction(deposits, counts);
    if (shadowReduce > 0) {
      const wdBonus = shadowManaWithdrawBonus(deposits, counts);
      manaParts.push(HUD_STRINGS.unitPanel.manaShadow(wdBonus > 0 ? HUD_STRINGS.unitPanel.manaShadowWithdraw(Math.round(wdBonus * 100)) : ''));
    }
    const manaLine = manaParts.join('  ');
    const pad = Math.round(12 * scale);
    const barW = Math.round(170 * scale);
    const barH = Math.round(8 * scale);
    const btnW = Math.round(68 * scale);
    const btnH = Math.round(24 * scale);
    const gap = Math.round(6 * scale);
    const panelW = Math.round(360 * scale);
    const panelH = Math.round(254 * scale);
    const x = 0;
    const y = H - panelH;

    this.hpBarWidth = barW;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb).setInteractive());
    this.track(this.add.text(x + pad, y + pad, unitDisplayName(unit) + (unit.isSpy() ? HUD_STRINGS.unitPanel.undercoverSuffix : ''), {
      ...MONO, fontSize: fs(14, scale), color: unit.isSpy() ? '#c488e8' : '#dce6ff', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, nation?.getName() ?? '', {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));

    this.buildBar(x + pad, y + pad + Math.round(34 * scale), barW, barH, scale, HUD_STRINGS.unitPanel.hpLabel);
    this.buildMoraleBar(x + pad, y + pad + Math.round(60 * scale), barW, barH, scale);

    this.track(this.add.text(x + pad, y + pad + Math.round(88 * scale),
      HUD_STRINGS.unitPanel.primaryStats(unit.getStats().meleeDamage + weaponBonus, unit.getStats().rangedDamage + weaponBonus, unit.getStats().speed),
      { ...MONO, fontSize: fs(11, scale), color: '#c3d0f7' }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + pad + Math.round(108 * scale),
      HUD_STRINGS.unitPanel.secondaryStats(armorLabel, weaponLabel, unit.getStats().attackRange, unit.getStats().vision),
      { ...MONO, fontSize: fs(11, scale), color: '#9bb0de' }).setOrigin(0, 0));

    this.infoLineText = this.track(this.add.text(x + pad, y + pad + Math.round(130 * scale), '', {
      ...MONO, fontSize: fs(10, scale), color: '#8ea3d2',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;

    this.stanceHintText = this.track(this.add.text(x + pad, y + pad + Math.round(150 * scale), '', {
      ...MONO, fontSize: fs(10, scale), color: '#d7c7a0',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;

    if (manaLine) {
      this.track(this.add.text(x + pad, y + pad + Math.round(168 * scale), HUD_STRINGS.unitPanel.manaLine(manaLine), {
        ...MONO, fontSize: fs(10, scale), color: '#9ec8e8',
        wordWrap: { width: panelW - pad * 2 },
      }).setOrigin(0, 0));
    }

    // Outpost construction lives in the territory buildings menu now (double-click
    // an unclaimed tile adjacent to your land), not on the unit panel.
    const rowY = y + panelH - pad - btnH;
    // Lift the label a full button half-height clear of the row so it can't sit on
    // top of the WITHDRAW button beneath it.
    const labelY = rowY - Math.round(btnH / 2) - Math.round(10 * scale);

    this.track(this.add.text(x + pad, labelY, HUD_STRINGS.stance.heading, {
      ...MONO, fontSize: fs(10, scale), color: '#8fa6d8', fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    STANCE_ORDERS.forEach(({ order, label, tooltip }, index) => {
      const bx = x + pad + index * (btnW + gap) + btnW / 2;
      const active = unit.getBattleOrder() === order;
      // Block ADVANCE selection when morale is too low to honor it (it would be
      // downgraded to HOLD). Check morale directly rather than effectiveBattleOrder,
      // which reflects the unit's *current* order — for a unit not already on ADVANCE
      // that always reads as non-ADVANCE and would wrongly grey the button out.
      const wouldBeBlocked = order === 'ADVANCE' && unit.getMorale() <= MORALE_ADVANCE_BLOCK_AT_OR_BELOW;
      const disabled = wouldBeBlocked && !active;
      const fill = active ? 0x34558e : disabled ? 0x1b2230 : 0x182235;
      const border = active ? 0x8cb4ff : disabled ? 0x344155 : 0x47628d;
      const bg = this.track(this.add.rectangle(bx, rowY, btnW, btnH, fill)
        .setStrokeStyle(1, border)) as Phaser.GameObjects.Rectangle;
      this.track(this.add.text(bx, rowY, label, {
        ...MONO, fontSize: fs(10, scale), color: disabled ? '#59657a' : '#f0f5ff',
      }).setOrigin(0.5));

      bg.setInteractive({ useHandCursor: !disabled });
      bg.on('pointerover', () => this.showStanceTooltip(bx, rowY - btnH / 2 - 6, tooltip, scale));
      bg.on('pointerout', () => this.hideStanceTooltip());

      if (!disabled) {
        bg.on('pointerup', () => {
          void this.networkAdapter.sendCommand({
            type: 'SET_UNIT_BATTLE_ORDER',
            playerId: this.playerId,
            unitId: unit.id,
            battleOrder: order,
            issuedAtTick: this.tickEngine.getCurrentTick(),
          });
        });
      }
    });

    // Spy toggle — Scouts can go undercover once Ancient Rituals is researched.
    if (unit.getUnitType() === 'SCOUT' && (nation?.hasResearched('ancient_rituals') ?? false)) {
      const terrOwner = this.gameState.getGrid().getTerritory(unit.position)?.getControllingNation();
      const onOwnOrNeutral = !terrOwner || terrOwner === unit.getOwnerId();
      const spy = unit.isSpy();
      const spyDisabled = unit.isEngagedInBattle() || !onOwnOrNeutral;
      const spyBx = x + pad + 3 * (btnW + gap) + btnW / 2;
      const fill = spy ? 0x4a2a6e : spyDisabled ? 0x1b2230 : 0x2a3a5e;
      const border = spy ? 0xc488e8 : spyDisabled ? 0x344155 : 0x5a7caa;
      const spyBg = this.track(this.add.rectangle(spyBx, rowY, btnW, btnH, fill)
        .setStrokeStyle(1, border)) as Phaser.GameObjects.Rectangle;
      this.track(this.add.text(spyBx, rowY, spy ? HUD_STRINGS.spy.drop : HUD_STRINGS.spy.spy, {
        ...MONO, fontSize: fs(10, scale), color: spyDisabled ? '#59657a' : '#f0f5ff',
      }).setOrigin(0.5));
      const spyTip = spy
        ? HUD_STRINGS.spy.dropTooltip
        : spyDisabled
          ? (unit.isEngagedInBattle() ? HUD_STRINGS.spy.blockedInBattleTooltip : HUD_STRINGS.spy.blockedTerritoryTooltip)
          : HUD_STRINGS.spy.enableTooltip;
      spyBg.setInteractive({ useHandCursor: !spyDisabled });
      spyBg.on('pointerover', () => this.showStanceTooltip(spyBx, rowY - btnH / 2 - 6, spyTip, scale));
      spyBg.on('pointerout', () => this.hideStanceTooltip());
      if (!spyDisabled) {
        spyBg.on('pointerup', () => {
          void this.networkAdapter.sendCommand({
            type: 'CONVERT_TO_SPY',
            playerId: this.playerId,
            unitId: unit.id,
            spy: !spy,
            issuedAtTick: this.tickEngine.getCurrentTick(),
          });
        });
      }
    }
  }

  /** Show the stance hover tooltip above a button (screen coords; UI scene has no zoom). */
  private showStanceTooltip(x: number, y: number, text: string, scale: number): void {
    if (!this.stanceTooltip) {
      const bg = this.add.rectangle(0, 0, 10, 10, 0x0a0e1e, 0.96)
        .setStrokeStyle(1, 0x5a6cc0).setOrigin(0.5, 1);
      const label = this.add.text(0, 0, '', {
        ...MONO, fontSize: fs(10, scale), color: '#e6ecff',
        wordWrap: { width: Math.round(260 * scale) },
      }).setOrigin(0.5, 1);
      this.stanceTooltip = this.add.container(0, 0, [bg, label]).setDepth(2000);
    }
    const bg = this.stanceTooltip.getAt(0) as Phaser.GameObjects.Rectangle;
    const label = this.stanceTooltip.getAt(1) as Phaser.GameObjects.Text;
    label.setText(text);
    const padX = 8;
    const padY = 6;
    bg.setSize(label.width + padX * 2, label.height + padY * 2);
    label.setPosition(0, -padY);
    bg.setPosition(0, 0);
    this.stanceTooltip.setPosition(x, y);
    this.stanceTooltip.setVisible(true);
  }

  private hideStanceTooltip(): void {
    this.stanceTooltip?.setVisible(false);
  }

  private buildCityPanel(H: number, scale: number): void {
    const city = this.selectedCity!;
    const nation = this.gameState.getNation(city.getOwnerId());
    const pad = Math.round(12 * scale);
    const panelW = Math.round(340 * scale);
    const currentOrder = city.getCurrentOrder();
    const panelH = Math.round((currentOrder ? 148 : 126) * scale);
    const x = 0;
    const y = H - panelH;
    const buildings = city.getBuildings().map(building => CITY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' '));

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb).setInteractive());
    this.track(this.add.text(x + pad, y + pad, city.getName(), {
      ...MONO, fontSize: fs(14, scale), color: '#ffd9a8', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, nation?.getName() ?? '', {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));
    this.track(this.add.text(x + pad, y + Math.round(38 * scale), HUD_STRINGS.cityPanel.health(city.getHealth(), city.getMaxHealth()), {
      ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + Math.round(60 * scale), HUD_STRINGS.cityPanel.buildings(buildings.join(', ') || HUD_STRINGS.cityPanel.buildingsNone), {
      ...MONO, fontSize: fs(11, scale), color: '#b9c7eb',
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));

    if (currentOrder) {
      const pct = (currentOrder.ticksTotal - currentOrder.ticksRemaining) / currentOrder.ticksTotal;
      const secsLeft = (currentOrder.ticksRemaining / TICK_RATE).toFixed(0);
      const barW = panelW - pad * 2;
      const barH = Math.max(6, Math.round(7 * scale));
      const barY = y + Math.round(86 * scale);

      this.track(this.add.text(x + pad, barY - Math.round(14 * scale), HUD_STRINGS.cityPanel.production(currentOrder.label, secsLeft), {
        ...MONO, fontSize: fs(11, scale), color: '#a8d4a8',
      }).setOrigin(0, 0));
      this.track(this.add.rectangle(x + pad, barY, barW, barH, 0x0d1e14).setOrigin(0, 0));
      this.track(this.add.rectangle(x + pad, barY, Math.max(2, Math.round(barW * pct)), barH, 0x3dbb6d).setOrigin(0, 0));
    } else {
      this.track(this.add.text(x + pad, y + Math.round(86 * scale), HUD_STRINGS.cityPanel.productionIdle, {
        ...MONO, fontSize: fs(11, scale), color: '#5a7a5a',
      }).setOrigin(0, 0));
    }
  }

  private buildTerritoryPanel(H: number, scale: number): void {
    const position = this.selectedTerritoryPos!;
    const territory = this.gameState.getGrid().getTerritory(position);
    const ownerId = territory?.getControllingNation() ?? null;
    const ownerName = ownerId ? this.gameState.getNation(ownerId)?.getName() ?? HUD_STRINGS.territoryPanel.ownerUnknown : HUD_STRINGS.territoryPanel.ownerUnclaimed;
    const pad = Math.round(12 * scale);
    const panelW = Math.round(380 * scale);

    // Region info
    const regionSystem = this.gameState.getRegionSystem();
    const region = regionSystem?.getRegionAt(position) ?? null;
    const regionController = region ? regionSystem!.getControllingNation(region.id, this.gameState) : null;
    const localNation = this.getLocalNation();
    const regionFrac = region && localNation
      ? regionSystem!.getControlFraction(region.id, localNation.getId(), this.gameState)
      : 0;
    const hasRegion = region !== null;
    const nearestRegion = !hasRegion && regionSystem ? regionSystem.getNearestRegion(position) : null;

    const panelH = Math.round(118 * scale);
    const x = 0;
    const y = H - panelH;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb).setInteractive());
    const terrain = TERRAIN_DISPLAY_NAME[territory?.getTerrainType() ?? ''] ?? territory?.getTerrainType() ?? HUD_STRINGS.territoryPanel.terrainUnknown;
    const titleText = region
      ? HUD_STRINGS.territoryPanel.titleInRegion(position.row, position.col, terrain, region.name)
      : nearestRegion
        ? HUD_STRINGS.territoryPanel.titleNearRegion(position.row, position.col, terrain, nearestRegion.region.name)
        : HUD_STRINGS.territoryPanel.titlePlain(position.row, position.col, terrain);
    this.track(this.add.text(x + pad, y + pad, titleText, {
      ...MONO, fontSize: fs(14, scale), color: '#dce6ff', fontStyle: 'bold',
      wordWrap: { width: panelW - pad * 2 - Math.round(80 * scale) },
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, ownerName, {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));

    const deposit = territory?.getResourceDeposit() ?? null;
    const buildings = territory?.getBuildings() ?? [];
    const construction = territory?.getCurrentConstruction() ?? null;
    const buildingText = buildings.length > 0
      ? buildings.map(building => HUD_STRINGS.territoryPanel.buildingEntry(BUILDING_MAP_ICON[building], building.replace(/_/g, ' '))).join('  ')
      : HUD_STRINGS.territoryPanel.noBuildings;

    this.track(this.add.text(x + pad, y + Math.round(42 * scale), HUD_STRINGS.territoryPanel.deposit(deposit ? deposit.replace(/_/g, ' ') : HUD_STRINGS.territoryPanel.depositNone), {
      ...MONO, fontSize: fs(11, scale), color: deposit ? '#f1d37a' : '#8a96ad',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + Math.round(66 * scale), buildingText, {
      ...MONO, fontSize: fs(11, scale), color: buildings.length > 0 ? '#9dd1a9' : '#8a96ad',
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));

    if (construction) {
      const pct = construction.ticksTotal > 0
        ? Math.round((1 - construction.ticksRemaining / construction.ticksTotal) * 100)
        : 0;
      this.track(this.add.text(x + pad, y + Math.round(88 * scale), HUD_STRINGS.territoryPanel.construction(construction.label, pct), {
        ...MONO, fontSize: fs(11, scale), color: '#a8d4a8',
      }).setOrigin(0, 0));
    }

    if (hasRegion && region && !construction) {
      const pctStr = `${Math.round(regionFrac * 100)}%`;
      const regionColor = regionController === localNation?.getId() ? '#f0c060' : regionController ? '#d08080' : '#a0b8d8';
      this.track(this.add.text(x + pad, y + Math.round(92 * scale), HUD_STRINGS.territoryPanel.region(region.name, pctStr), {
        ...MONO, fontSize: fs(11, scale), color: regionColor, fontStyle: 'italic',
      }).setOrigin(0, 0));
    }
  }

  private buildBar(x: number, y: number, barW: number, barH: number, scale: number, label: string): void {
    this.track(this.add.text(x, y, label, {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(0, 0));
    const barX = x + Math.round(48 * scale);
    this.track(this.add.rectangle(barX, y + Math.round(6 * scale), barW, barH, 0x141c2c).setOrigin(0, 0));
    this.hpFillRect = this.track(this.add.rectangle(barX, y + Math.round(6 * scale), 1, barH, 0x44cc66).setOrigin(0, 0)) as Phaser.GameObjects.Rectangle;
    this.hpText = this.track(this.add.text(barX + barW + Math.round(8 * scale), y - Math.round(2 * scale), '', {
      ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;
  }

  private buildMoraleBar(x: number, y: number, barW: number, barH: number, scale: number): void {
    this.track(this.add.text(x, y, HUD_STRINGS.unitPanel.moraleLabel, {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(0, 0));
    const barX = x + Math.round(48 * scale);
    this.track(this.add.rectangle(barX, y + Math.round(6 * scale), barW, barH, 0x141c2c).setOrigin(0, 0));
    this.moraleFillRect = this.track(this.add.rectangle(barX, y + Math.round(6 * scale), 1, barH, 0x4488ff).setOrigin(0, 0)) as Phaser.GameObjects.Rectangle;
    this.moraleText = this.track(this.add.text(barX + barW + Math.round(8 * scale), y - Math.round(2 * scale), '', {
      ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;
    this.moraleWarnText = this.track(this.add.text(barX + barW + Math.round(44 * scale), y - Math.round(2 * scale), '', {
      ...MONO, fontSize: fs(10, scale), color: '#ff8b6b',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;
  }

  private refreshResources(): void {
    const nation = this.getLocalNation();
    const treasury = nation?.getTreasury();
    if (!treasury) return;

    for (const resource of RESOURCE_BUTTONS) {
      const text = this.resourceValueTexts.get(resource);
      if (!text) continue;
      text.setText(HUD_STRINGS.resourceValue(RESOURCE_EMOJI[resource], treasury.getAmount(resource)));
    }

    // Update research button label and progress bar
    if (this.researchBtnText) {
      const skinny = this.scale.width < 820;
      const cr = nation?.getCurrentResearch();
      this.researchBtnText.setText(
        cr ? cr.techId.replace(/_/g, ' ').toUpperCase().slice(0, skinny ? 6 : 10) : (skinny ? HUD_STRINGS.topBar.techSkinny : HUD_STRINGS.topBar.research),
      );
      this.researchBtnText.setColor(cr ? '#b8e89a' : '#d8e4ff');
      if (this.researchProgressRect) {
        const frac = cr && cr.ticksTotal > 0 ? 1 - cr.ticksRemaining / cr.ticksTotal : 0;
        this.researchProgressRect.setSize(Math.round(this.researchBtnFullW * frac), this.researchProgressRect.height);
      }
    }
  }

  private getResourceBreakdown(resource: ResourceType): {
    title: string;
    current: number;
    sources: string[];
    outgoing: string[];
    tip: string;
  } {
    const nation = this.getLocalNation();
    const treasury = nation?.getTreasury();
    const current = treasury?.getAmount(resource) ?? 0;
    if (!nation) return { title: resource, current, sources: [], outgoing: [], tip: '' };

    const cities = this.gameState.getCitiesByNation(nation.getId());
    const territories = this.gameState.getGrid().getTerritoriesByNation(nation.getId());
    const cityCount = cities.length;
    // City buildings yield per level, so sum levels (not just count cities that have one).
    const levelSum = (b: CityBuildingType) => cities.reduce((sum, city) => sum + city.getBuildingLevel(b), 0);
    const cityFarmCount = levelSum(CityBuildingType.FARMS);
    const cityWorkshopCount = levelSum(CityBuildingType.WORKSHOP);
    const citySchoolCount = levelSum(CityBuildingType.SCHOOL);
    const cityMarketCount = levelSum(CityBuildingType.MARKET);
    const territoryFarmCount = territories.filter(territory => territory.hasBuilding(TerritoryBuildingType.FARMS)).length;
    const territoryWorkshopCount = territories.filter(territory => territory.hasBuilding(TerritoryBuildingType.WORKSHOP)).length;
    const plainsCount = territories.filter(territory => territory.getTerrainType() === TerrainType.PLAINS).length;
    const forestHillCount = territories.filter(territory => {
      const terrain = territory.getTerrainType();
      return terrain === TerrainType.FOREST || terrain === TerrainType.SNOW_FOREST;
    }).length;
    const desertCount = territories.filter(territory => territory.getTerrainType() === TerrainType.DESERT).length;
    const deposits = this.gameState.getNationActiveDeposits(nation.getId());
    const counts = this.gameState.getNationActiveDepositCounts(nation.getId());

    const upkeep = new Map<ResourceType, number>();
    for (const unit of this.gameState.getUnitsByNation(nation.getId())) {
      const unitUpkeep = unit.getUpkeep();
      for (const [key, amount] of Object.entries(unitUpkeep)) {
        upkeep.set(key as ResourceType, (upkeep.get(key as ResourceType) ?? 0) + (amount ?? 0));
      }
    }

    // Region domination bonuses
    const regionSystem = this.gameState.getRegionSystem();
    let regionFoodBonus = 0;
    let regionMaterialBonus = 0;
    let regionGoldBonus = 0;
    if (nation && regionSystem) {
      for (const region of regionSystem.getAllRegions()) {
        const controller = regionSystem.getControllingNation(region.id, this.gameState);
        if (controller !== nation.getId()) continue;
        const res = regionBonusResource(region.terrain);
        const amt = regionBonusAmount(region);
        if (res === ResourceType.FOOD)         regionFoodBonus     += amt;
        if (res === ResourceType.RAW_MATERIAL) regionMaterialBonus += amt;
        if (res === ResourceType.GOLD)         regionGoldBonus     += amt;
      }
    }

    switch (resource) {
      case ResourceType.FOOD:
        return {
          title: HUD_STRINGS.resourceBreakdown.food.title,
          current,
          sources: [
            HUD_STRINGS.resourceBreakdown.food.baseCityIncome(formatRate(perSecond(cityCount, FOOD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.food.cityFarms(formatRate(perSecond(cityFarmCount, FOOD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.food.territoryFarms(formatRate(perSecond(territoryFarmCount, FOOD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.food.plainsHarvest(formatRate(perSecond(plainsCount, TERRAIN_FOOD_INTERVAL))),
            ...(regionFoodBonus > 0 ? [HUD_STRINGS.resourceBreakdown.food.regionDomination(formatRate(perSecond(regionFoodBonus, REGION_BONUS_INTERVAL)))] : []),
          ],
          outgoing: upkeep.get(ResourceType.FOOD)
            ? [HUD_STRINGS.resourceBreakdown.food.unitUpkeep(formatRate(-perSecond(upkeep.get(ResourceType.FOOD) ?? 0, UPKEEP_INTERVAL)))]
            : [],
          tip: HUD_STRINGS.resourceBreakdown.food.tip,
        };
      case ResourceType.RAW_MATERIAL:
        return {
          title: HUD_STRINGS.resourceBreakdown.material.title,
          current,
          sources: [
            HUD_STRINGS.resourceBreakdown.material.baseCityIncome(formatRate(perSecond(cityCount, MATERIAL_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.material.cityWorkshops(formatRate(perSecond(cityWorkshopCount, MATERIAL_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.material.territoryWorkshops(formatRate(perSecond(territoryWorkshopCount, MATERIAL_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.material.forestsAndHills(formatRate(perSecond(forestHillCount, TERRAIN_MATERIAL_INTERVAL))),
            ...(regionMaterialBonus > 0 ? [HUD_STRINGS.resourceBreakdown.material.regionDomination(formatRate(perSecond(regionMaterialBonus, REGION_BONUS_INTERVAL)))] : []),
          ],
          outgoing: upkeep.get(ResourceType.RAW_MATERIAL)
            ? [HUD_STRINGS.resourceBreakdown.material.unitUpkeep(formatRate(-perSecond(upkeep.get(ResourceType.RAW_MATERIAL) ?? 0, UPKEEP_INTERVAL)))]
            : [],
          tip: HUD_STRINGS.resourceBreakdown.material.tip,
        };
      case ResourceType.GOLD:
        return {
          title: HUD_STRINGS.resourceBreakdown.gold.title,
          current,
          sources: [
            HUD_STRINGS.resourceBreakdown.gold.baseCityIncome(formatRate(perSecond(cityCount, GOLD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.gold.markets(formatRate(perSecond(cityMarketCount, GOLD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.gold.desertRevenue(formatRate(perSecond(desertCount, TERRAIN_GOLD_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.gold.silverAndGold(formatRate(perSecond(mineralGoldBonus(deposits, counts), GOLD_INTERVAL))),
            ...(regionGoldBonus > 0 ? [HUD_STRINGS.resourceBreakdown.gold.regionDomination(formatRate(perSecond(regionGoldBonus, REGION_BONUS_INTERVAL)))] : []),
          ],
          outgoing: upkeep.get(ResourceType.GOLD)
            ? [HUD_STRINGS.resourceBreakdown.gold.unitUpkeep(formatRate(-perSecond(upkeep.get(ResourceType.GOLD) ?? 0, UPKEEP_INTERVAL)))]
            : [],
          tip: HUD_STRINGS.resourceBreakdown.gold.tip,
        };
      case ResourceType.RESEARCH:
        return {
          title: HUD_STRINGS.resourceBreakdown.research.title,
          current,
          sources: [
            HUD_STRINGS.resourceBreakdown.research.baseCityIncome(formatRate(perSecond(cityCount, RESEARCH_INTERVAL))),
            HUD_STRINGS.resourceBreakdown.research.schools(formatRate(perSecond(citySchoolCount, RESEARCH_INTERVAL))),
          ],
          outgoing: [],
          tip: HUD_STRINGS.resourceBreakdown.research.tip,
        };
    }
  }

  /** Flash red bands along the screen edges a few times — used on war declaration. */
  private flashWarAlert(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const thickness = Math.round(Math.min(W, H) * 0.07);
    const color = 0xcc1111;
    const depth = 9000;
    const bars: Phaser.GameObjects.Rectangle[] = [
      this.add.rectangle(W / 2, 0, W, thickness, color).setOrigin(0.5, 0),
      this.add.rectangle(W / 2, H, W, thickness, color).setOrigin(0.5, 1),
      this.add.rectangle(0, H / 2, thickness, H, color).setOrigin(0, 0.5),
      this.add.rectangle(W, H / 2, thickness, H, color).setOrigin(1, 0.5),
    ];
    bars.forEach(b => b.setScrollFactor(0).setDepth(depth).setAlpha(0));
    this.tweens.add({
      targets: bars,
      alpha: 0.55,
      duration: 400,
      yoyo: true,
      repeat: 2, // 3 pulses ≈ 2.4 s
      onComplete: () => bars.forEach(b => b.destroy()),
    });
  }

  private pushNotification(text: string): void {
    const entry: AlertEntry = {
      id: this.nextAlertId++,
      text,
      createdAt: Date.now(),
      createdTick: this.tickEngine.getCurrentTick(),
    };
    this.notifications.push(entry);
    this.toastIds.push(entry.id);
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(-100);
    }
    this.rebuildHUD();
    this.time.delayedCall(4000, () => {
      this.toastIds = this.toastIds.filter(id => id !== entry.id);
      this.rebuildHUD();
    });
  }

  private openDiplomacy(targetNationId?: string): void {
    this.bridge.openDiplomacy(targetNationId);
  }

  private getLocalNation() {
    const player = this.gameState.getLocalPlayer();
    return player ? this.gameState.getNation(player.getControlledNationId()) : null;
  }

  private isLocalNation(nationId: string): boolean {
    return this.getLocalNation()?.getId() === nationId;
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.hudObjects.push(obj);
    return obj;
  }
}

function speedLabel(speed: typeof SPEED_CYCLE[number]): string {
  if (speed === 0) return HUD_STRINGS.topBar.speedPause;
  return HUD_STRINGS.topBar.speedMultiplier(speed);
}

function formatGameTime(tick: number): string {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const dayTick = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const hour = Math.floor((dayTick / TICKS_PER_DAY) * 24);
  return HUD_STRINGS.topBar.gameTime(day, String(hour).padStart(2, '0'));
}

function difficultyColor(difficulty: GameSetup['difficulty']): string {
  switch (difficulty) {
    case 'easy': return '#6bd26b';
    case 'hard': return '#e26f6f';
    case 'sandbox': return '#7bd4ff';
    default: return '#e2d26f';
  }
}

function relationLabel(status: DiplomaticStatus): string {
  switch (status) {
    case DiplomaticStatus.ALLY: return HUD_STRINGS.diplomacy.relationAllied;
    case DiplomaticStatus.WAR: return HUD_STRINGS.diplomacy.relationAtWar;
    default: return HUD_STRINGS.diplomacy.relationAtPeace;
  }
}

function relationColor(status: DiplomaticStatus): string {
  switch (status) {
    case DiplomaticStatus.ALLY: return '#8fe3a8';
    case DiplomaticStatus.WAR: return '#ff8686';
    default: return '#d9d9d9';
  }
}
