import Phaser from 'phaser';
import type { GameState } from '@/managers/GameState';
import type { NetworkAdapter } from '@/network/NetworkAdapter';
import type { DiplomacySystem } from '@/systems/diplomacy/DiplomacySystem';
import type { GameEventBus } from '@/systems/events/GameEventBus';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceType } from '@/systems/resources/ResourceType';
import { UI } from '@/config/uiTheme';
import { TICK_RATE } from '@/config/constants';

export interface DiplomacySceneData {
  targetNationId?: string;
  gameState: GameState;
  networkAdapter: NetworkAdapter;
  diplomacySystem: DiplomacySystem;
  eventBus: GameEventBus;
  currentTick: number;
}

const {
  BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV,
  RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C,
} = UI;

const GREEN_BTN = 0x0e3020;
const GREEN_H = 0x164a30;
const SELECTED_ROW = 0x243656;
const PW = 860;
const PH = 560;

const TRADE_RESOURCES: Array<{ type: ResourceType; label: string; emoji: string }> = [
  { type: ResourceType.GOLD, label: 'Gold', emoji: '🪙' },
  { type: ResourceType.RAW_MATERIAL, label: 'Materials', emoji: '🪨' },
  { type: ResourceType.FOOD, label: 'Food', emoji: '🍎' },
];

export class DiplomacyScene extends Phaser.Scene {
  private targetNationId: string | null = null;
  private gameState!: GameState;
  private networkAdapter!: NetworkAdapter;
  private diplomacySystem!: DiplomacySystem;
  private eventBus!: GameEventBus;
  private currentTick!: number;
  private playerId!: string;

  private tradeOffer: Partial<Record<ResourceType, number>> = {};
  private tradeRequest: Partial<Record<ResourceType, number>> = {};

  constructor() {
    super({ key: 'DiplomacyScene' });
  }

  init(data: DiplomacySceneData): void {
    this.targetNationId = data.targetNationId ?? null;
    this.gameState = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.diplomacySystem = data.diplomacySystem;
    this.eventBus = data.eventBus;
    this.currentTick = data.currentTick;
    this.tradeOffer = {};
    this.tradeRequest = {};
    this.playerId = data.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    const localPlayer = this.gameState.getLocalPlayer();
    const localNation = localPlayer ? this.gameState.getNation(localPlayer.getControlledNationId()) : null;
    const knownNations = localNation
      ? this.gameState.getKnownNationIds(localNation.getId())
        .map(id => this.gameState.getNation(id))
        .filter((nation): nation is NonNullable<ReturnType<GameState['getNation']>> => Boolean(nation))
      : [];

    if (!this.targetNationId || !knownNations.some(nation => nation.getId() === this.targetNationId)) {
      this.targetNationId = knownNations[0]?.getId() ?? null;
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2 - 8;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    this.add.rectangle(0, 0, W, H, BG, 0.55).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);
    this.add.rectangle(cx, py + 25, PW, 50, HEADER).setOrigin(0.5);
    this.add.text(px + 24, py + 25, 'DIPLOMACY', {
      fontSize: '20px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(px + 162, py + 25, 'Known nations', {
      fontSize: '12px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const closeBg = this.add.rectangle(px + PW - 30, py + 25, 48, 36, RED_BTN)
      .setStrokeStyle(1, ACCENT)
      .setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 30, py + 25, '✕', {
      fontSize: '18px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    closeBg.on('pointerup', () => this.scene.stop('DiplomacyScene'));
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout', () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.scene.stop('DiplomacyScene'));

    const listX = px + 16;
    const listY = py + 66;
    const listW = 240;
    const detailX = listX + listW + 18;
    const detailW = PW - (detailX - px) - 18;

    this.add.rectangle(listX + listW / 2, py + PH / 2 + 20, listW, PH - 88, 0x0b1220, 0.88)
      .setStrokeStyle(1, 0x223b66);

    if (!localNation || knownNations.length === 0 || !this.targetNationId) {
      this.add.text(cx, cy, 'No other nations have been discovered yet.', {
        fontSize: '16px', color: '#b6c4df', fontFamily: 'monospace',
      }).setOrigin(0.5);
      return;
    }

    let rowY = listY;
    for (const nation of knownNations) {
      const selected = nation.getId() === this.targetNationId;
      const rowBg = this.add.rectangle(listX + listW / 2, rowY, listW - 10, 42, selected ? SELECTED_ROW : 0x121a2c)
        .setStrokeStyle(1, selected ? 0x7ca2ff : 0x223652)
        .setInteractive({ useHandCursor: true });
      this.add.circle(listX + 18, rowY, 6, parseInt(nation.getColor().replace('#', ''), 16));
      this.add.text(listX + 32, rowY - 8, nation.getName(), {
        fontSize: '14px', color: '#dde7ff', fontFamily: 'monospace', fontStyle: selected ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);
      this.add.text(listX + 32, rowY + 8, relationLabel(localNation.getRelation(nation.getId())), {
        fontSize: '11px', color: relationColor(localNation.getRelation(nation.getId())), fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
      rowBg.on('pointerup', () => {
        this.scene.restart({
          targetNationId: nation.getId(),
          gameState: this.gameState,
          networkAdapter: this.networkAdapter,
          diplomacySystem: this.diplomacySystem,
          eventBus: this.eventBus,
          currentTick: this.currentTick,
        });
      });
      rowY += 48;
    }

    const targetNation = this.gameState.getNation(this.targetNationId);
    if (!targetNation) return;

    this.add.rectangle(detailX + detailW / 2, py + PH / 2 + 20, detailW, PH - 88, 0x0b1220, 0.88)
      .setStrokeStyle(1, 0x223b66);
    this.add.circle(detailX + 20, listY, 10, parseInt(targetNation.getColor().replace('#', ''), 16));
    this.add.text(detailX + 40, listY, targetNation.getName(), {
      fontSize: '20px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    let y = listY + 28;
    this.add.text(detailX + 8, y, 'RELATIONS', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    y += 26;

    const status = localNation.getRelation(targetNation.getId());
    this.add.text(detailX + 8, y, `Current status: ${relationLabel(status)}`, {
      fontSize: '14px', color: relationColor(status), fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const actionX = detailX + detailW - 96;
    if (status === DiplomaticStatus.WAR) {
      const cooldownLeft = this.diplomacySystem.getPeaceCooldownRemaining(localNation.getId(), targetNation.getId(), this.currentTick);
      const onCooldown = cooldownLeft > 0;
      const peaceBg = this.add.rectangle(actionX, y, 172, 30, onCooldown ? 0x0a1a10 : GREEN_BTN)
        .setStrokeStyle(1, onCooldown ? 0x224422 : 0x22aa66);
      if (!onCooldown) peaceBg.setInteractive({ useHandCursor: true });
      this.add.text(actionX, y, 'PROPOSE PEACE', {
        fontSize: '12px', color: onCooldown ? '#335533' : '#66ff99', fontFamily: 'monospace',
      }).setOrigin(0.5);
      if (!onCooldown) {
        peaceBg.on('pointerover', () => peaceBg.setFillStyle(GREEN_H));
        peaceBg.on('pointerout', () => peaceBg.setFillStyle(GREEN_BTN));
        peaceBg.on('pointerup', async () => {
          await this.networkAdapter.sendCommand({
            type: 'PROPOSE_PEACE',
            playerId: this.playerId,
            targetNationId: targetNation.getId(),
            issuedAtTick: this.currentTick,
          });
          this.scene.stop('DiplomacyScene');
        });
      } else {
        const sLeft = Math.ceil(cooldownLeft / TICK_RATE);
        this.add.text(actionX, y + 18, `cooldown: ${sLeft}s`, {
          fontSize: '10px', color: '#556a55', fontFamily: 'monospace',
        }).setOrigin(0.5, 0);
      }
    } else if (status === DiplomaticStatus.NEUTRAL) {
      const canWar = this.diplomacySystem.canDeclareWar(localNation.getId(), targetNation.getId(), this.currentTick);
      const cooldownLeft = this.diplomacySystem.getPeaceCooldownRemaining(localNation.getId(), targetNation.getId(), this.currentTick);
      const warBg = this.add.rectangle(actionX, y, 172, 30, canWar ? RED_BTN : 0x1a0a0a)
        .setStrokeStyle(1, canWar ? 0xaa2222 : 0x442222);
      if (canWar) warBg.setInteractive({ useHandCursor: true });
      this.add.text(actionX, y, 'DECLARE WAR', {
        fontSize: '12px', color: canWar ? '#ff9999' : '#553333', fontFamily: 'monospace',
      }).setOrigin(0.5);
      if (canWar) {
        warBg.on('pointerover', () => warBg.setFillStyle(RED_H));
        warBg.on('pointerout', () => warBg.setFillStyle(RED_BTN));
        warBg.on('pointerup', async () => {
          await this.networkAdapter.sendCommand({
            type: 'DECLARE_WAR',
            playerId: this.playerId,
            targetNationId: targetNation.getId(),
            issuedAtTick: this.currentTick,
          });
          this.scene.stop('DiplomacyScene');
        });
      } else if (cooldownLeft > 0) {
        const sLeft = Math.ceil(cooldownLeft / TICK_RATE);
        this.add.text(actionX, y + 18, `cooldown: ${sLeft}s`, {
          fontSize: '10px', color: '#665555', fontFamily: 'monospace',
        }).setOrigin(0.5, 0);
      }
    }

    y += 42;
    this.add.rectangle(detailX + detailW / 2, y, detailW - 14, 1, ACCENT).setOrigin(0.5);
    y += 14;

    this.add.text(detailX + 8, y, 'TRADE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    y += 20;

    const localTreasury = localNation.getTreasury();
    const targetTreasury = targetNation.getTreasury();
    this.add.text(detailX + 190, y, 'YOU GIVE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(detailX + 376, y, 'YOU RECEIVE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 18;

    const offerLbls: Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};
    const requestLbls: Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};

    for (const res of TRADE_RESOURCES) {
      const row = y;
      this.add.text(detailX + 8, row + 14, `${res.emoji} ${res.label}`, {
        fontSize: '13px', color: LT, fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      const offerLbl = this.add.text(detailX + 190, row + 14, String(this.tradeOffer[res.type] ?? 0), {
        fontSize: '16px', color: GOLD_C, fontFamily: 'monospace',
      }).setOrigin(0.5);
      offerLbls[res.type] = offerLbl;
      const maxOffer = localTreasury.getAmount(res.type);
      this.makeStepBtn(detailX + 158, row + 14, '-', BTN, LT).on('pointerup', () => {
        this.tradeOffer[res.type] = Math.max(0, (this.tradeOffer[res.type] ?? 0) - 10);
        offerLbl.setText(String(this.tradeOffer[res.type]));
      });
      this.makeStepBtn(detailX + 222, row + 14, '+', BTN, LT).on('pointerup', () => {
        this.tradeOffer[res.type] = Math.min(maxOffer, (this.tradeOffer[res.type] ?? 0) + 10);
        offerLbl.setText(String(this.tradeOffer[res.type]));
      });
      this.add.text(detailX + 140, row + 26, `(have: ${maxOffer})`, {
        fontSize: '10px', color: '#555577', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      const reqLbl = this.add.text(detailX + 376, row + 14, String(this.tradeRequest[res.type] ?? 0), {
        fontSize: '16px', color: '#88ddff', fontFamily: 'monospace',
      }).setOrigin(0.5);
      requestLbls[res.type] = reqLbl;
      const maxReq = targetTreasury.getAmount(res.type);
      this.makeStepBtn(detailX + 344, row + 14, '-', BTN, LT).on('pointerup', () => {
        this.tradeRequest[res.type] = Math.max(0, (this.tradeRequest[res.type] ?? 0) - 10);
        reqLbl.setText(String(this.tradeRequest[res.type]));
      });
      this.makeStepBtn(detailX + 408, row + 14, '+', BTN, LT).on('pointerup', () => {
        this.tradeRequest[res.type] = Math.min(maxReq, (this.tradeRequest[res.type] ?? 0) + 10);
        reqLbl.setText(String(this.tradeRequest[res.type]));
      });
      this.add.text(detailX + 324, row + 26, `(they have: ${maxReq})`, {
        fontSize: '10px', color: '#555577', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      y += 36;
    }

    y += 8;
    const tradeBg = this.add.rectangle(detailX + detailW / 2, y + 16, 190, 32, BTN)
      .setStrokeStyle(1, ACCENT)
      .setInteractive({ useHandCursor: true });
    this.add.text(detailX + detailW / 2, y + 16, '⇄ EXECUTE TRADE', {
      fontSize: '13px', color: GOLD_C, fontFamily: 'monospace',
    }).setOrigin(0.5);
    const tradeStatus = this.add.text(detailX + detailW / 2, y + 40, '', {
      fontSize: '11px', color: '#ff8888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    tradeBg.on('pointerover', () => tradeBg.setFillStyle(BTN_HOV));
    tradeBg.on('pointerout', () => tradeBg.setFillStyle(BTN));
    tradeBg.on('pointerup', async () => {
      const result = await this.networkAdapter.sendCommand({
        type: 'OFFER_TRADE',
        playerId: this.playerId,
        targetNationId: targetNation.getId(),
        offer: { ...this.tradeOffer },
        request: { ...this.tradeRequest },
        issuedAtTick: this.currentTick,
      });
      if (result.success) {
        tradeStatus.setColor('#88ff88').setText('Trade accepted!');
        this.tradeOffer = {};
        this.tradeRequest = {};
        for (const res of TRADE_RESOURCES) {
          offerLbls[res.type]?.setText('0');
          requestLbls[res.type]?.setText('0');
        }
      } else {
        tradeStatus.setColor('#ff8888').setText(result.reason ?? 'Trade rejected.');
      }
    });
  }

  private makeStepBtn(
    x: number,
    y: number,
    label: string,
    fillColor: number,
    textColor: string,
  ): Phaser.GameObjects.Rectangle {
    const btn = this.add.rectangle(x, y, 26, 26, fillColor)
      .setStrokeStyle(1, ACCENT)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontSize: '16px', color: textColor, fontFamily: 'monospace',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(BTN_HOV));
    btn.on('pointerout', () => btn.setFillStyle(fillColor));
    return btn;
  }
}

function relationLabel(status: DiplomaticStatus): string {
  switch (status) {
    case DiplomaticStatus.ALLY: return 'ALLIED';
    case DiplomaticStatus.WAR: return 'AT WAR';
    default: return 'AT PEACE';
  }
}

function relationColor(status: DiplomaticStatus): string {
  switch (status) {
    case DiplomaticStatus.ALLY: return '#55ff99';
    case DiplomaticStatus.WAR: return '#ff5555';
    default: return '#ffdd77';
  }
}
