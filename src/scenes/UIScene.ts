import Phaser from 'phaser';
import type { Unit, BattleOrder } from '@/entities/units/Unit';
import { MORALE_LOW } from '@/entities/units/Unit';
import type { City } from '@/entities/cities/City';
import type { GameState } from '@/managers/GameState';
import type { GameSetup } from '@/types/gameSetup';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { TickEngine } from '@/systems/tick/TickEngine';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TerrainType } from '@/systems/grid/Territory';
import { TerritoryBuildingType, BUILDING_MAP_ICON, TERRITORY_BUILDING_MAP } from '@/systems/territory/TerritoryBuilding';
import { CITY_BUILDING_MAP } from '@/systems/territory/CityBuilding';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';
import { RESOURCE_EMOJI } from '@/utils/resourceIcons';
import type { GridCoordinates } from '@/types/common';
import { weaponTierDamageBonus, mineralGoldBonus, fireManaDamageFactor, earthManaHPFactor, waterManaRegenBonus, lightningManaSpeedBonus, airManaVisionBonus, shadowManaVisionReduction, shadowManaWithdrawBonus } from '@/systems/resources/ResourceBonuses';
import { DiplomaticStatus } from '@/types/diplomacy';
import { TICK_RATE } from '@/config/constants';
import type { TechId } from '@/systems/research/TechTree';

interface UISceneData {
  setup: GameSetup;
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  eventBus: GameEventBus;
  diplomacySystem: DiplomacySystem;
  tickEngine: TickEngine;
}

interface AlertEntry {
  id: number;
  text: string;
  createdAt: number;
}

const MONO: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'monospace' };
const STANCE_ORDERS: Array<{ order: BattleOrder; label: string }> = [
  { order: 'FALL_BACK', label: 'FALLBACK' },
  { order: 'HOLD', label: 'HOLD' },
  { order: 'ADVANCE', label: 'ADVANCE' },
];
const RESOURCE_BUTTONS: ResourceType[] = [
  ResourceType.FOOD,
  ResourceType.RAW_MATERIAL,
  ResourceType.GOLD,
  ResourceType.RESEARCH,
];
const TICKS_PER_DAY = 100;
const SPEED_CYCLE = [1, 2, 4] as const;
const FOOD_INTERVAL = 5;
const MATERIAL_INTERVAL = 10;
const GOLD_INTERVAL = 10;
const RESEARCH_INTERVAL = 10;
const TERRAIN_FOOD_INTERVAL = 50;
const TERRAIN_MATERIAL_INTERVAL = 50;
const TERRAIN_GOLD_INTERVAL = 80;
const UPKEEP_INTERVAL = 30;

function uiScale(h: number): number {
  return Math.min(1.8, Math.max(0.75, h / 900));
}

function fs(base: number, scale: number): string {
  return `${Math.round(base * scale)}px`;
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

function resolveArmorTier(
  deposits: ReadonlySet<TerritoryResourceType>,
  nation: ReturnType<GameState['getNation']>,
): string {
  if (deposits.has(TerritoryResourceType.FIRE_GLASS)) return 'Fire Glass';
  if (deposits.has(TerritoryResourceType.IRON)) {
    const hasSteelWorking = nation?.hasResearched('steel_working' as TechId) ?? false;
    return hasSteelWorking ? 'Steel' : 'Iron';
  }
  if (deposits.has(TerritoryResourceType.COPPER)) return 'Bronze';
  return 'Leather';
}

export class UIScene extends Phaser.Scene {
  private setup!: GameSetup;
  private gameState!: GameState;
  private networkAdapter!: NetworkAdapter;
  private eventBus!: GameEventBus;
  private diplomacySystem!: DiplomacySystem;
  private tickEngine!: TickEngine;
  private playerId = '';

  private selectedUnit: Unit | null = null;
  private selectedCity: City | null = null;
  private selectedTerritoryPos: GridCoordinates | null = null;

  private gameSpeed: typeof SPEED_CYCLE[number] = 1;
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
  private hpBarWidth = 0;

  private activeResourceBreakdown: ResourceType | null = null;
  private showAlertHistory = false;
  private notifications: AlertEntry[] = [];
  private toastIds: number[] = [];
  private nextAlertId = 1;
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: UISceneData): void {
    this.setup = data.setup;
    this.gameState = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.eventBus = data.eventBus;
    this.diplomacySystem = data.diplomacySystem;
    this.tickEngine = data.tickEngine;
    this.playerId = this.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    this.setupEventListeners();
    this.rebuildHUD();
    this.scale.on('resize', this.rebuildHUD, this);
  }

  override update(): void {
    if (!this.selectedUnit) return;
    if (this.hpFillRect && this.hpText) {
      const hp = this.selectedUnit.getHealth();
      const hpMax = this.selectedUnit.getStats().maxHealth;
      const ratio = hpMax > 0 ? hp / hpMax : 0;
      const width = Math.max(1, Math.round(this.hpBarWidth * ratio));
      const color = ratio > 0.5 ? 0x44cc66 : ratio > 0.25 ? 0xddcc22 : 0xcc3322;
      this.hpFillRect.setSize(width, this.hpFillRect.height).setFillStyle(color);
      this.hpText.setText(`${hp}/${hpMax}`);
    }

    if (this.moraleFillRect && this.moraleText) {
      const morale = this.selectedUnit.getMorale();
      const width = Math.max(1, Math.round(this.hpBarWidth * morale / 100));
      const color = morale > 50 ? 0x4488ff : morale > 30 ? 0xffaa22 : 0xff4444;
      this.moraleFillRect.setSize(width, this.moraleFillRect.height).setFillStyle(color);
      this.moraleText.setText(`${morale}`);
      this.moraleWarnText?.setText(morale <= MORALE_LOW && this.selectedUnit.getBattleOrder() === 'ADVANCE' ? 'LOW MORALE' : '');
    }

    if (this.infoLineText) {
      const battles = this.selectedUnit.getBattlesEngaged();
      const homeId = this.selectedUnit.getHomeCityId();
      const homeName = homeId ? this.gameState.getCity(homeId)?.getName() ?? '-' : '-';
      const rank = this.selectedUnit.getRankLabel();
      const xp = this.selectedUnit.getXP();
      const toNext = this.selectedUnit.getXPToNextLevel();
      const xpText = toNext > 0 ? `${xp}/${xp + toNext}` : 'MAX';
      const status = this.selectedUnit.isEngagedInBattle() ? 'IN BATTLE' : 'READY';
      this.infoLineText.setText(`Battles:${battles}  Home:${homeName}  ${rank} XP:${xpText}  ${status}`);
    }

    if (this.stanceHintText) {
      this.stanceHintText.setText(this.selectedUnit.getUnitType() === 'CAVALRY'
        ? 'Advance acts as Charge: +50% damage.'
        : 'Advance quickens the clash: +25% damage on both sides.');
    }
  }

  private setupEventListeners(): void {
    this.eventBus.on('game:tick', ({ tick }) => {
      const day = Math.floor(tick / TICKS_PER_DAY) + 1;
      this.tickText?.setText(`Day ${day}`);
      this.refreshResources();
    });

    this.eventBus.on('unit:selected', ({ unit }) => {
      this.selectedUnit = unit;
      if (unit) {
        this.selectedCity = null;
        this.selectedTerritoryPos = null;
      }
      this.rebuildHUD();
    });

    this.eventBus.on('city:selected', ({ city }) => {
      this.selectedCity = city;
      if (city) {
        this.selectedUnit = null;
        this.selectedTerritoryPos = null;
      }
      this.rebuildHUD();
    });

    this.eventBus.on('territory:highlighted', ({ position }) => {
      this.selectedTerritoryPos = position;
      if (position) {
        this.selectedUnit = null;
        this.selectedCity = null;
      }
      this.rebuildHUD();
    });

    this.eventBus.on('unit:battle-order-changed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildHUD();
    });

    this.eventBus.on('unit:destroyed', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) {
        this.selectedUnit = null;
      }
      this.rebuildHUD();
    });

    this.eventBus.on('territory:claimed', ({ position, nationId, fromNationId }) => {
      const localNation = this.getLocalNation();
      if (!localNation) return;
      if (nationId !== localNation.getId() && fromNationId !== localNation.getId()) return;

      const nationName = this.gameState.getNation(nationId)?.getName() ?? 'Unknown nation';
      const sourceName = fromNationId ? this.gameState.getNation(fromNationId)?.getName() ?? 'another nation' : null;
      this.pushNotification(sourceName && nationId === localNation.getId()
        ? `${nationName} captured tile (${position.row}, ${position.col}) from ${sourceName}.`
        : nationId === localNation.getId()
          ? `${nationName} claimed tile (${position.row}, ${position.col}).`
          : `${sourceName ?? 'An enemy'} captured tile (${position.row}, ${position.col}) from you.`);
      this.rebuildHUD();
    });

    this.eventBus.on('city:unit-spawned', ({ cityId, unitType }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? 'A city';
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      this.pushNotification(`${cityName} trained ${unitType.replace(/_/g, ' ').toLowerCase()}.`);
    });

    this.eventBus.on('city:production-complete', ({ cityId, order }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? 'A city';
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      this.pushNotification(`${cityName} completed ${order.label.toLowerCase()}.`);
    });

    this.eventBus.on('city:building-built', ({ cityId, building }) => {
      const cityName = this.gameState.getCity(cityId)?.getName() ?? 'A city';
      const city = this.gameState.getCity(cityId);
      if (!city || !this.isLocalNation(city.getOwnerId())) return;
      const label = CITY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' ');
      this.pushNotification(`${cityName} built ${label}.`);
    });

    this.eventBus.on('unit:withdrew', ({ unitId, to }) => {
      const unit = this.gameState.getUnit(unitId);
      if (!unit || !this.isLocalNation(unit.getOwnerId())) return;
      const label = unit ? unitDisplayName(unit) : 'A unit';
      this.pushNotification(`${label} withdrew to (${to.row}, ${to.col}).`);
      this.rebuildHUD();
    });

    this.eventBus.on('nation:research-complete', ({ nationId, techId }) => {
      if (!this.isLocalNation(nationId)) return;
      const nationName = this.gameState.getNation(nationId)?.getName() ?? 'A nation';
      this.pushNotification(`${nationName} completed ${techId.replace(/_/g, ' ')}.`);
    });

    this.eventBus.on('diplomacy:war-declared', ({ nationId1, nationId2 }) => {
      if (!this.isLocalNation(nationId1) && !this.isLocalNation(nationId2)) return;
      const a = this.gameState.getNation(nationId1)?.getName() ?? 'Unknown';
      const b = this.gameState.getNation(nationId2)?.getName() ?? 'Unknown';
      this.pushNotification(`${a} and ${b} are now at war.`);
      this.rebuildHUD();
    });

    this.eventBus.on('diplomacy:peace-signed', ({ fromNationId, toNationId }) => {
      if (!this.isLocalNation(fromNationId) && !this.isLocalNation(toNationId)) return;
      const a = this.gameState.getNation(fromNationId)?.getName() ?? 'Unknown';
      const b = this.gameState.getNation(toNationId)?.getName() ?? 'Unknown';
      this.pushNotification(`${a} and ${b} signed peace.`);
      this.rebuildHUD();
    });

    this.eventBus.on('unit:step-complete', ({ unitId }) => {
      if (this.selectedUnit?.id === unitId) this.rebuildHUD();
    });
  }

  private rebuildHUD(): void {
    for (const obj of this.hudObjects) {
      if (obj.active) obj.destroy();
    }
    this.hudObjects = [];
    this.tickText = null;
    this.speedBtnText = null;
    this.resourceValueTexts.clear();
    this.hpFillRect = null;
    this.hpText = null;
    this.moraleFillRect = null;
    this.moraleText = null;
    this.moraleWarnText = null;
    this.infoLineText = null;
    this.stanceHintText = null;
    this.hpBarWidth = 0;

    const W = this.scale.width;
    const H = this.scale.height;
    const scale = uiScale(H);

    this.buildTopBar(W, scale);
    this.buildNotificationToasts(scale);
    this.buildResourceBreakdownPanel(scale);
    this.buildAlertHistoryPanel(W, H, scale);
    this.buildDiplomacyWidget(W, H, scale);
    this.buildInfoPanel(H, scale);
    this.refreshResources();
  }

  private buildTopBar(W: number, scale: number): void {
    const skinny = W < 820;
    const widthFactor = skinny ? Phaser.Math.Clamp(W / 620, 0.62, 1) : 1;
    const barH = Math.round((skinny ? 88 : 52) * scale);
    const pad = Math.round((skinny ? 8 : 10) * scale);
    const midY = skinny ? Math.round(25 * scale) : Math.round(barH / 2);
    const resourceY = skinny ? Math.round(64 * scale) : midY;
    const btnW = Math.round(96 * scale * widthFactor);
    const btnH = Math.round((skinny ? 28 : 30) * scale);
    const gap = Math.round((skinny ? 6 : 8) * scale);

    this.track(this.add.rectangle(W / 2, 0, W, barH, 0x0d1020, 0.94).setOrigin(0.5, 0));
    this.track(this.add.rectangle(W / 2, barH, W, 1, 0x3355bb, 0.7).setOrigin(0.5, 0));

    this.tickText = this.track(this.add.text(pad, midY, 'Day 1', {
      ...MONO, fontSize: fs(skinny ? 13 : 15, scale), color: '#d6e0ff',
    }).setOrigin(0, 0.5)) as Phaser.GameObjects.Text;

    this.track(this.add.text(pad + Math.round((skinny ? 58 : 74) * scale), midY, this.setup.difficulty.toUpperCase(), {
      ...MONO, fontSize: fs(skinny ? 10 : 12, scale), color: difficultyColor(this.setup.difficulty), fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const speedX = pad + Math.round((skinny ? 142 : 196) * scale * widthFactor);
    this.makeButton(speedX, midY, Math.round(52 * scale * widthFactor), btnH, `${this.gameSpeed}x`, scale, () => {
      const idx = SPEED_CYCLE.indexOf(this.gameSpeed);
      this.gameSpeed = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length]!;
      this.speedBtnText?.setText(`${this.gameSpeed}x`);
      this.eventBus.emit('game:speed-change', { speed: this.gameSpeed });
    }, 0x1b2442);
    this.speedBtnText = this.hudObjects[this.hudObjects.length - 1] as Phaser.GameObjects.Text;

    const alertsLabel = skinny ? `A ${this.notifications.length}` : `ALERTS ${this.notifications.length}`;
    this.makeButton(speedX + Math.round(88 * scale * widthFactor), midY, Math.round((skinny ? 58 : 92) * scale * widthFactor), btnH, alertsLabel, scale, () => {
      this.showAlertHistory = !this.showAlertHistory;
      this.rebuildHUD();
    }, this.showAlertHistory ? 0x3c2a5e : 0x241c36);

    const resourceW = skinny
      ? Math.floor((W - pad * 2 - gap * (RESOURCE_BUTTONS.length - 1)) / RESOURCE_BUTTONS.length)
      : Math.round(86 * scale);
    const resourceStartX = skinny
      ? pad
      : W - pad - btnW * 2 - gap * 2 - resourceW * RESOURCE_BUTTONS.length - gap * (RESOURCE_BUTTONS.length - 1) - Math.round(18 * scale);
    RESOURCE_BUTTONS.forEach((resource, index) => {
      const x = resourceStartX + index * (resourceW + gap) + resourceW / 2;
      this.makeResourceButton(x, resourceY, resourceW, btnH, scale, resource);
    });

    const researchX = W - pad - btnW - gap - btnW / 2;
    const menuX = W - pad - btnW / 2;

    this.makeButton(researchX, midY, btnW, btnH, skinny ? 'TECH' : 'RESEARCH', scale, () => {
      if (this.scene.isActive('ResearchScene')) {
        this.scene.stop('ResearchScene');
      } else {
        this.scene.launch('ResearchScene', {
          gameState: this.gameState,
          networkAdapter: this.networkAdapter,
          eventBus: this.eventBus,
        });
      }
    }, 0x1a1e3c);

    this.makeButton(menuX, midY, btnW, btnH, skinny ? 'MENU' : 'MENU [ESC]', scale, () => {
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
    bg.on('pointerup', () => {
      this.eventBus.emit('ui:click-consumed', {});
      onClick();
    });

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
        .setStrokeStyle(1, 0x3355aa));
      this.track(this.add.text(startX + Math.round(10 * scale), y + height / 2, entry.text, {
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
      .setStrokeStyle(1, 0x476ac2));
    this.track(this.add.text(x + pad, y + pad, 'Alert History', {
      ...MONO, fontSize: fs(14, scale), color: '#ffddb0', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.makeButton(x + panelW - pad - Math.round(74 * scale), y + pad + Math.round(10 * scale), Math.round(74 * scale), Math.round(24 * scale), 'CLOSE', scale, () => {
      this.showAlertHistory = false;
      this.rebuildHUD();
    }, 0x2a1e30);

    const recent = [...this.notifications].slice(-maxRows).reverse();
    recent.forEach((entry, index) => {
      this.track(this.add.text(x + pad, y + pad * 2 + Math.round(26 * scale) + index * rowH, entry.text, {
        ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
        wordWrap: { width: panelW - pad * 2 },
      }).setOrigin(0, 0));
    });
  }

  private buildResourceBreakdownPanel(scale: number): void {
    if (!this.activeResourceBreakdown) return;

    const pad = Math.round(12 * scale);
    const panelW = Math.round(320 * scale);
    const panelH = Math.round(250 * scale);
    const x = this.scale.width - panelW - Math.round(230 * scale);
    const y = Math.round(62 * scale);
    const breakdown = this.getResourceBreakdown(this.activeResourceBreakdown);

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0d1426, 0.97)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a6ec7));
    this.track(this.add.text(x + pad, y + pad, `${RESOURCE_EMOJI[this.activeResourceBreakdown]} ${breakdown.title}`, {
      ...MONO, fontSize: fs(14, scale), color: '#f6e0a0', fontStyle: 'bold',
    }).setOrigin(0, 0));

    const lines = [
      `Stored now: ${breakdown.current}`,
      '',
      'Sources',
      ...breakdown.sources.map(line => `  ${line}`),
      '',
      'Outgoing',
      ...(breakdown.outgoing.length > 0 ? breakdown.outgoing.map(line => `  ${line}`) : ['  None']),
    ];

    this.track(this.add.text(x + pad, y + Math.round(38 * scale), lines.join('\n'), {
      ...MONO, fontSize: fs(11, scale), color: '#dfe8ff',
      lineSpacing: Math.round(2 * scale),
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
    if (others.length === 0) return;

    const pad = Math.round(10 * scale);
    const rowH = Math.round(42 * scale);
    const visibleRows = others.length;
    const panelW = Math.round(298 * scale);
    const panelH = Math.round(58 * scale) + visibleRows * rowH + pad;
    const x = W - panelW - pad;
    const y = H - panelH - pad;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0c1220, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a6ec7));
    this.track(this.add.text(x + pad, y + pad, 'Diplomacy', {
      ...MONO, fontSize: fs(14, scale), color: '#d8e3ff', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + pad + Math.round(16 * scale), 'Known nations', {
      ...MONO, fontSize: fs(10, scale), color: '#95a8d8',
    }).setOrigin(0, 0));

    this.makeButton(x + panelW - pad - Math.round(48 * scale), y + pad + Math.round(12 * scale), Math.round(96 * scale), Math.round(24 * scale), 'OPEN FULL', scale, () => {
      this.openDiplomacy();
    }, 0x1b2540);

    let rowY = y + Math.round(54 * scale);
    for (const nation of others.slice(0, visibleRows)) {
      const relation = localNation.getRelation(nation.getId());
      const row = this.track(this.add.rectangle(x + panelW / 2, rowY + rowH / 2, panelW - pad * 2, rowH - Math.round(4 * scale), 0x10192a, 0.98)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x2b426d)
        .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Rectangle;
      row.on('pointerup', () => {
        this.eventBus.emit('ui:click-consumed', {});
        this.openDiplomacy(nation.getId());
      });
      row.on('pointerover', () => row.setFillStyle(0x17243a, 0.98));
      row.on('pointerout', () => row.setFillStyle(0x10192a, 0.98));

      this.track(this.add.circle(x + pad + Math.round(9 * scale), rowY + rowH / 2 - Math.round(2 * scale), Math.max(4, Math.round(5 * scale)), parseInt(nation.getColor().replace('#', ''), 16)));
      this.track(this.add.text(x + pad + Math.round(22 * scale), rowY + Math.round(11 * scale), nation.getName(), {
        ...MONO, fontSize: fs(12, scale), color: '#e0e9ff', fontStyle: 'bold',
      }).setOrigin(0, 0));
      this.track(this.add.text(x + pad + Math.round(22 * scale), rowY + Math.round(25 * scale), relationLabel(relation), {
        ...MONO, fontSize: fs(10, scale), color: relationColor(relation),
      }).setOrigin(0, 0));

      const btnLabel = relation === DiplomaticStatus.WAR ? 'PEACE' : 'WAR';
      const btnFill = relation === DiplomaticStatus.WAR ? 0x21402c : 0x402020;
      this.makeButton(x + panelW - pad - Math.round(34 * scale), rowY + rowH / 2 - Math.round(2 * scale), Math.round(68 * scale), Math.round(24 * scale), btnLabel, scale, () => {
        if (relation === DiplomaticStatus.WAR) {
          void this.networkAdapter.sendCommand({
            type: 'PROPOSE_PEACE',
            playerId: this.playerId,
            targetNationId: nation.getId(),
            issuedAtTick: this.tickEngine.getCurrentTick(),
          });
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
    const armorLabel = resolveArmorTier(deposits, nation);

    const manaParts: string[] = [];
    const fireFactor = fireManaDamageFactor(deposits, counts);
    if (fireFactor > 1) manaParts.push(`Fire+${Math.round((fireFactor - 1) * 100)}%DMG`);
    const earthFactor = earthManaHPFactor(deposits, counts);
    if (earthFactor > 1) manaParts.push(`Earth+${Math.round((earthFactor - 1) * 100)}%HP`);
    const waterRegen = waterManaRegenBonus(deposits, counts);
    if (waterRegen > 0) manaParts.push(`Water+${Math.round(waterRegen * 100)}%REGEN`);
    const lightningSpeed = lightningManaSpeedBonus(deposits, counts);
    if (lightningSpeed > 0) manaParts.push(`Lightning+${lightningSpeed}SPD`);
    const airVision = airManaVisionBonus(deposits, counts);
    if (airVision > 0) manaParts.push(`Air+${airVision}VIS`);
    const shadowReduce = shadowManaVisionReduction(deposits, counts);
    if (shadowReduce > 0) {
      const wdBonus = shadowManaWithdrawBonus(deposits, counts);
      manaParts.push(`Shadow:HIDDEN${wdBonus > 0 ? `+${Math.round(wdBonus * 100)}%WD` : ''}`);
    }
    const manaLine = manaParts.join('  ');
    const territory = this.gameState.getGrid().getTerritory(unit.position);
    const unclaimed = territory?.getControllingNation() === null;
    const canOutpost = unclaimed && territory?.getTerrainType() !== TerrainType.WATER && territory?.getTerrainType() !== TerrainType.MOUNTAIN;
    const pad = Math.round(12 * scale);
    const barW = Math.round(170 * scale);
    const barH = Math.round(8 * scale);
    const btnW = Math.round(68 * scale);
    const btnH = Math.round(24 * scale);
    const gap = Math.round(6 * scale);
    const panelW = Math.round(360 * scale);
    const panelH = Math.round(246 * scale) + (canOutpost ? btnH + gap : 0);
    const x = 0;
    const y = H - panelH;

    this.hpBarWidth = barW;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb));
    this.track(this.add.text(x + pad, y + pad, unitDisplayName(unit), {
      ...MONO, fontSize: fs(14, scale), color: '#dce6ff', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, nation?.getName() ?? '', {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));

    this.buildBar(x + pad, y + pad + Math.round(34 * scale), barW, barH, scale, 'HP');
    this.buildMoraleBar(x + pad, y + pad + Math.round(60 * scale), barW, barH, scale);

    this.track(this.add.text(x + pad, y + pad + Math.round(88 * scale),
      `Melee:${unit.getStats().meleeDamage + weaponBonus}  Ranged:${unit.getStats().rangedDamage + weaponBonus}  Speed:${unit.getStats().speed}`,
      { ...MONO, fontSize: fs(11, scale), color: '#c3d0f7' }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + pad + Math.round(108 * scale),
      `Armor:${armorLabel}  Range:${unit.getStats().attackRange}  Vision:${unit.getStats().vision}`,
      { ...MONO, fontSize: fs(11, scale), color: '#9bb0de' }).setOrigin(0, 0));

    this.infoLineText = this.track(this.add.text(x + pad, y + pad + Math.round(130 * scale), '', {
      ...MONO, fontSize: fs(10, scale), color: '#8ea3d2',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;

    this.stanceHintText = this.track(this.add.text(x + pad, y + pad + Math.round(150 * scale), '', {
      ...MONO, fontSize: fs(10, scale), color: '#d7c7a0',
    }).setOrigin(0, 0)) as Phaser.GameObjects.Text;

    if (manaLine) {
      this.track(this.add.text(x + pad, y + pad + Math.round(168 * scale), `Mana: ${manaLine}`, {
        ...MONO, fontSize: fs(10, scale), color: '#9ec8e8',
        wordWrap: { width: panelW - pad * 2 },
      }).setOrigin(0, 0));
    }

    let rowY = y + panelH - pad - btnH;
    if (canOutpost) {
      const outpost = TERRITORY_BUILDING_MAP.get(TerritoryBuildingType.OUTPOST);
      const cost = outpost?.cost ?? {};
      const label = [
        cost[ResourceType.GOLD] ? `${cost[ResourceType.GOLD]}${RESOURCE_EMOJI[ResourceType.GOLD]}` : '',
        cost[ResourceType.RAW_MATERIAL] ? `${cost[ResourceType.RAW_MATERIAL]}${RESOURCE_EMOJI[ResourceType.RAW_MATERIAL]}` : '',
        cost[ResourceType.FOOD] ? `${cost[ResourceType.FOOD]}${RESOURCE_EMOJI[ResourceType.FOOD]}` : '',
      ].filter(Boolean).join(' ');
      this.makeButton(x + pad + Math.round(50 * scale), rowY, Math.round(100 * scale), btnH, 'OUTPOST', scale, () => {
        void this.networkAdapter.sendCommand({
          type: 'BUILD_TERRITORY',
          playerId: this.playerId,
          position: unit.position,
          building: TerritoryBuildingType.OUTPOST,
          issuedAtTick: this.tickEngine.getCurrentTick(),
        });
      }, 0x203320);
      this.track(this.add.text(x + pad + Math.round(110 * scale), rowY - Math.round(16 * scale), label, {
        ...MONO, fontSize: fs(9, scale), color: '#8acc9a',
      }).setOrigin(0.5, 0));
      rowY -= btnH + gap;
    }

    STANCE_ORDERS.forEach(({ order, label }, index) => {
      const bx = x + pad + index * (btnW + gap) + btnW / 2;
      const active = unit.getBattleOrder() === order;
      const disabled = order === 'ADVANCE' && unit.getMorale() <= MORALE_LOW && !active;
      const fill = active ? 0x34558e : disabled ? 0x1b2230 : 0x182235;
      const border = active ? 0x8cb4ff : disabled ? 0x344155 : 0x47628d;
      const bg = this.track(this.add.rectangle(bx, rowY, btnW, btnH, fill)
        .setStrokeStyle(1, border)) as Phaser.GameObjects.Rectangle;
      this.track(this.add.text(bx, rowY, label, {
        ...MONO, fontSize: fs(10, scale), color: disabled ? '#59657a' : '#f0f5ff',
      }).setOrigin(0.5));

      if (!disabled) {
        bg.setInteractive({ useHandCursor: true });
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
  }

  private buildCityPanel(H: number, scale: number): void {
    const city = this.selectedCity!;
    const nation = this.gameState.getNation(city.getOwnerId());
    const pad = Math.round(12 * scale);
    const panelW = Math.round(340 * scale);
    const panelH = Math.round(126 * scale);
    const x = 0;
    const y = H - panelH;
    const buildings = city.getBuildings().map(building => CITY_BUILDING_MAP.get(building)?.label ?? building.replace(/_/g, ' '));
    const currentOrder = city.getCurrentOrder();

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb));
    this.track(this.add.text(x + pad, y + pad, city.getName(), {
      ...MONO, fontSize: fs(14, scale), color: '#ffd9a8', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, nation?.getName() ?? '', {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));
    this.track(this.add.text(x + pad, y + Math.round(38 * scale), `Health: ${city.getHealth()}/${city.getMaxHealth()}`, {
      ...MONO, fontSize: fs(11, scale), color: '#dbe6ff',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + Math.round(60 * scale), `Buildings: ${buildings.join(', ') || 'None'}`, {
      ...MONO, fontSize: fs(11, scale), color: '#b9c7eb',
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + Math.round(86 * scale), `Production: ${currentOrder ? currentOrder.label : 'Idle'}`, {
      ...MONO, fontSize: fs(11, scale), color: '#a8d4a8',
    }).setOrigin(0, 0));
  }

  private buildTerritoryPanel(H: number, scale: number): void {
    const position = this.selectedTerritoryPos!;
    const territory = this.gameState.getGrid().getTerritory(position);
    const ownerId = territory?.getControllingNation() ?? null;
    const ownerName = ownerId ? this.gameState.getNation(ownerId)?.getName() ?? 'Unknown' : 'Unclaimed';
    const pad = Math.round(12 * scale);
    const panelW = Math.round(360 * scale);
    const panelH = Math.round(118 * scale);
    const x = 0;
    const y = H - panelH;

    this.track(this.add.rectangle(x, y, panelW, panelH, 0x0a0f1c, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3355bb));
    this.track(this.add.text(x + pad, y + pad, `${territory?.getTerrainType() ?? 'Unknown'} (${position.row}, ${position.col})`, {
      ...MONO, fontSize: fs(14, scale), color: '#dce6ff', fontStyle: 'bold',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + panelW - pad, y + pad, ownerName, {
      ...MONO, fontSize: fs(11, scale), color: '#8fa6d8',
    }).setOrigin(1, 0));

    const deposit = territory?.getResourceDeposit() ?? null;
    const buildings = territory?.getBuildings() ?? [];
    const buildingText = buildings.length > 0
      ? buildings.map(building => `${BUILDING_MAP_ICON[building]} ${building.replace(/_/g, ' ')}`).join('  ')
      : 'No buildings';

    this.track(this.add.text(x + pad, y + Math.round(42 * scale), `Deposit: ${deposit ? deposit.replace(/_/g, ' ') : 'None'}`, {
      ...MONO, fontSize: fs(11, scale), color: deposit ? '#f1d37a' : '#8a96ad',
    }).setOrigin(0, 0));
    this.track(this.add.text(x + pad, y + Math.round(66 * scale), buildingText, {
      ...MONO, fontSize: fs(11, scale), color: buildings.length > 0 ? '#9dd1a9' : '#8a96ad',
      wordWrap: { width: panelW - pad * 2 },
    }).setOrigin(0, 0));
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
    this.track(this.add.text(x, y, 'Morale', {
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
      text.setText(`${RESOURCE_EMOJI[resource]} ${treasury.getAmount(resource)}`);
    }
  }

  private getResourceBreakdown(resource: ResourceType): {
    title: string;
    current: number;
    sources: string[];
    outgoing: string[];
  } {
    const nation = this.getLocalNation();
    const treasury = nation?.getTreasury();
    const current = treasury?.getAmount(resource) ?? 0;
    if (!nation) return { title: resource, current, sources: [], outgoing: [] };

    const cities = this.gameState.getCitiesByNation(nation.getId());
    const territories = this.gameState.getGrid().getTerritoriesByNation(nation.getId());
    const cityCount = cities.length;
    const cityFarmCount = cities.filter(city => city.hasBuilding('FARMS' as never)).length;
    const cityWorkshopCount = cities.filter(city => city.hasBuilding('WORKSHOP' as never)).length;
    const citySchoolCount = cities.filter(city => city.hasBuilding('SCHOOL' as never)).length;
    const cityMarketCount = cities.filter(city => city.hasBuilding('MARKET' as never)).length;
    const territoryFarmCount = territories.filter(territory => territory.hasBuilding(TerritoryBuildingType.FARMS)).length;
    const territoryWorkshopCount = territories.filter(territory => territory.hasBuilding(TerritoryBuildingType.WORKSHOP)).length;
    const plainsCount = territories.filter(territory => territory.getTerrainType() === TerrainType.PLAINS).length;
    const forestHillCount = territories.filter(territory => {
      const terrain = territory.getTerrainType();
      return terrain === TerrainType.FOREST || terrain === TerrainType.HILLS;
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

    switch (resource) {
      case ResourceType.FOOD:
        return {
          title: 'Food Flow',
          current,
          sources: [
            `Base city income ${formatRate(perSecond(cityCount, FOOD_INTERVAL))}`,
            `City farms ${formatRate(perSecond(cityFarmCount, FOOD_INTERVAL))}`,
            `Territory farms ${formatRate(perSecond(territoryFarmCount, FOOD_INTERVAL))}`,
            `Plains harvest ${formatRate(perSecond(plainsCount, TERRAIN_FOOD_INTERVAL))}`,
          ],
          outgoing: upkeep.get(ResourceType.FOOD)
            ? [`Unit upkeep ${formatRate(-perSecond(upkeep.get(ResourceType.FOOD) ?? 0, UPKEEP_INTERVAL))}`]
            : [],
        };
      case ResourceType.RAW_MATERIAL:
        return {
          title: 'Material Flow',
          current,
          sources: [
            `Base city income ${formatRate(perSecond(cityCount, MATERIAL_INTERVAL))}`,
            `City workshops ${formatRate(perSecond(cityWorkshopCount, MATERIAL_INTERVAL))}`,
            `Territory workshops ${formatRate(perSecond(territoryWorkshopCount, MATERIAL_INTERVAL))}`,
            `Forests and hills ${formatRate(perSecond(forestHillCount, TERRAIN_MATERIAL_INTERVAL))}`,
          ],
          outgoing: upkeep.get(ResourceType.RAW_MATERIAL)
            ? [`Unit upkeep ${formatRate(-perSecond(upkeep.get(ResourceType.RAW_MATERIAL) ?? 0, UPKEEP_INTERVAL))}`]
            : [],
        };
      case ResourceType.GOLD:
        return {
          title: 'Gold Flow',
          current,
          sources: [
            `Base city income ${formatRate(perSecond(cityCount, GOLD_INTERVAL))}`,
            `Markets ${formatRate(perSecond(cityMarketCount, GOLD_INTERVAL))}`,
            `Desert revenue ${formatRate(perSecond(desertCount, TERRAIN_GOLD_INTERVAL))}`,
            `Silver and gold deposits ${formatRate(perSecond(mineralGoldBonus(deposits, counts), GOLD_INTERVAL))}`,
          ],
          outgoing: upkeep.get(ResourceType.GOLD)
            ? [`Unit upkeep ${formatRate(-perSecond(upkeep.get(ResourceType.GOLD) ?? 0, UPKEEP_INTERVAL))}`]
            : [],
        };
      case ResourceType.RESEARCH:
        return {
          title: 'Research Flow',
          current,
          sources: [
            `Base city income ${formatRate(perSecond(cityCount, RESEARCH_INTERVAL))}`,
            `Schools ${formatRate(perSecond(citySchoolCount, RESEARCH_INTERVAL))}`,
          ],
          outgoing: [],
        };
    }
  }

  private pushNotification(text: string): void {
    const entry: AlertEntry = {
      id: this.nextAlertId++,
      text,
      createdAt: Date.now(),
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
    this.scene.stop('DiplomacyScene');
    this.scene.launch('DiplomacyScene', {
      targetNationId,
      gameState: this.gameState,
      networkAdapter: this.networkAdapter,
      diplomacySystem: this.diplomacySystem,
      eventBus: this.eventBus,
      currentTick: this.tickEngine.getCurrentTick(),
    });
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
    case DiplomaticStatus.ALLY: return 'Allied';
    case DiplomaticStatus.WAR: return 'At War';
    default: return 'At Peace';
  }
}

function relationColor(status: DiplomaticStatus): string {
  switch (status) {
    case DiplomaticStatus.ALLY: return '#8fe3a8';
    case DiplomaticStatus.WAR: return '#ff8686';
    default: return '#d9d9d9';
  }
}
