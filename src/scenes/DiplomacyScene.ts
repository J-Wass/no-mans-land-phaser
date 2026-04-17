/**
 * DiplomacyScene — diplomacy overlay with a foreign nation.
 *
 * Opened when the player double-clicks a city belonging to another nation.
 * Three sections:
 *   RELATIONS  — current status, declare war or propose peace
 *   TRADE      — transfer gold / materials / food between treasuries (instant)
 *   ALLIANCES  — placeholder reserved for future team-game mode
 */

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
  targetNationId:  string;
  gameState:       GameState;
  networkAdapter:  NetworkAdapter;
  diplomacySystem: DiplomacySystem;
  eventBus:        GameEventBus;
  currentTick:     number;
}

const {
  BG, PANEL, HEADER, ACCENT, BTN, BTN_HOV,
  RED_BTN, RED_H, DIM, LT, WHITE, GOLD_C,
} = UI;

const GREEN_BTN = 0x0e3020;
const GREEN_H   = 0x164a30;
const PW = 580; const PH = 520;

const TRADE_RESOURCES: Array<{ type: ResourceType; label: string; emoji: string }> = [
  { type: ResourceType.GOLD,         label: 'Gold',      emoji: '🪙' },
  { type: ResourceType.RAW_MATERIAL, label: 'Materials', emoji: '🪨' },
  { type: ResourceType.FOOD,         label: 'Food',      emoji: '🍎' },
];

export class DiplomacyScene extends Phaser.Scene {
  private targetNationId!:   string;
  private gameState!:        GameState;
  private networkAdapter!: NetworkAdapter;
  private diplomacySystem!:  DiplomacySystem;
  private currentTick!:      number;
  private playerId!:         string;

  private tradeOffer:   Partial<Record<ResourceType, number>> = {};
  private tradeRequest: Partial<Record<ResourceType, number>> = {};

  constructor() { super({ key: 'DiplomacyScene' }); }

  init(data: DiplomacySceneData): void {
    this.targetNationId   = data.targetNationId;
    this.gameState        = data.gameState;
    this.networkAdapter = data.networkAdapter;
    this.diplomacySystem  = data.diplomacySystem;
    this.currentTick      = data.currentTick;
    this.tradeOffer       = {};
    this.tradeRequest     = {};
    this.playerId         = data.gameState.getLocalPlayer()?.getId() ?? '';
  }

  create(): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const cy = H / 2 - 20;
    const px = cx - PW / 2;
    const py = cy - PH / 2;

    const targetNation = this.gameState.getNation(this.targetNationId);
    const lp           = this.gameState.getLocalPlayer();
    const localNation  = lp ? this.gameState.getNation(lp.getControlledNationId()) : null;

    this.add.rectangle(0, 0, W, H, BG, 0.55).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, PW, PH, PANEL).setStrokeStyle(1, ACCENT);

    // ── Header ─────────────────────────────────────────────────────────────────
    const HDR_H = 50;
    this.add.rectangle(cx, py + HDR_H / 2, PW, HDR_H, HEADER).setOrigin(0.5);

    const nColor = targetNation ? parseInt(targetNation.getColor().replace('#', ''), 16) : 0xffffff;
    this.add.circle(px + 26, py + HDR_H / 2, 9, nColor);
    this.add.text(px + 46, py + HDR_H / 2, targetNation?.getName() ?? '???', {
      fontSize: '20px', color: WHITE, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.add.text(px + 260, py + HDR_H / 2, '— DIPLOMACY', {
      fontSize: '13px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const closeBg = this.add.rectangle(px + PW - 30, py + HDR_H / 2, 48, 36, RED_BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(px + PW - 30, py + HDR_H / 2, '✕', {
      fontSize: '18px', color: '#ff9999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    closeBg.on('pointerup',   () => this.scene.stop('DiplomacyScene'));
    closeBg.on('pointerover', () => closeBg.setFillStyle(RED_H));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(RED_BTN));
    this.input.keyboard!.once('keydown-ESC', () => this.scene.stop('DiplomacyScene'));

    let y = py + HDR_H + 18;

    // ── RELATIONS ─────────────────────────────────────────────────────────────
    this.add.text(px + 20, y, 'RELATIONS', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    y += 20;

    const status = localNation?.getRelation(this.targetNationId) ?? DiplomaticStatus.NEUTRAL;
    const statusColor =
      status === DiplomaticStatus.WAR  ? '#ff5555' :
      status === DiplomaticStatus.ALLY ? '#55ff99' : '#ffdd77';

    this.add.text(px + 20, y + 14, 'Current status:', {
      fontSize: '14px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.add.text(px + 172, y + 14, status, {
      fontSize: '14px', color: statusColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Action button (war or peace)
    if (localNation && localNation.getId() !== this.targetNationId) {
      if (status === DiplomaticStatus.WAR) {
        const cooldownLeft = this.diplomacySystem.getPeaceCooldownRemaining(
          localNation.getId(), this.targetNationId, this.currentTick,
        );
        const onCooldown = cooldownLeft > 0;

        const peaceBg = this.add.rectangle(px + 360, y + 14, 160, 30,
          onCooldown ? 0x0a1a10 : GREEN_BTN,
        ).setStrokeStyle(1, onCooldown ? 0x224422 : 0x22aa66);
        if (!onCooldown) peaceBg.setInteractive({ useHandCursor: true });

        this.add.text(px + 360, y + 14, 'PROPOSE PEACE', {
          fontSize: '12px', color: onCooldown ? '#335533' : '#66ff99', fontFamily: 'monospace',
        }).setOrigin(0.5);

        if (!onCooldown) {
          peaceBg.on('pointerover', () => peaceBg.setFillStyle(GREEN_H));
          peaceBg.on('pointerout',  () => peaceBg.setFillStyle(GREEN_BTN));
          peaceBg.on('pointerup',   async () => {
            await this.networkAdapter.sendCommand({
              type: 'PROPOSE_PEACE', playerId: this.playerId,
              targetNationId: this.targetNationId, issuedAtTick: this.currentTick,
            });
            this.scene.stop('DiplomacyScene');
          });
        } else {
          const sLeft = Math.ceil(cooldownLeft / TICK_RATE);
          this.add.text(px + 360, y + 32, `cooldown: ${sLeft}s`, {
            fontSize: '11px', color: '#555555', fontFamily: 'monospace',
          }).setOrigin(0.5);
        }
      } else if (status === DiplomaticStatus.NEUTRAL) {
        const canWar     = this.diplomacySystem.canDeclareWar(
          localNation.getId(), this.targetNationId, this.currentTick,
        );
        const cooldownLeft = this.diplomacySystem.getPeaceCooldownRemaining(
          localNation.getId(), this.targetNationId, this.currentTick,
        );

        const warBg = this.add.rectangle(px + 360, y + 14, 160, 30,
          canWar ? RED_BTN : 0x1a0a0a,
        ).setStrokeStyle(1, canWar ? 0xaa2222 : 0x442222);
        if (canWar) warBg.setInteractive({ useHandCursor: true });

        this.add.text(px + 360, y + 14, 'DECLARE WAR', {
          fontSize: '12px', color: canWar ? '#ff9999' : '#553333', fontFamily: 'monospace',
        }).setOrigin(0.5);

        if (canWar) {
          warBg.on('pointerover', () => warBg.setFillStyle(RED_H));
          warBg.on('pointerout',  () => warBg.setFillStyle(RED_BTN));
          warBg.on('pointerup',   async () => {
            await this.networkAdapter.sendCommand({
              type: 'DECLARE_WAR', playerId: this.playerId,
              targetNationId: this.targetNationId, issuedAtTick: this.currentTick,
            });
            this.scene.stop('DiplomacyScene');
          });
        } else if (cooldownLeft > 0) {
          const sLeft = Math.ceil(cooldownLeft / TICK_RATE);
          this.add.text(px + 360, y + 32, `cooldown: ${sLeft}s`, {
            fontSize: '11px', color: '#555555', fontFamily: 'monospace',
          }).setOrigin(0.5);
        }
      }
      // ALLY status: no war/peace buttons (managed through team setup)
    }

    y += 52;

    // ── TRADE ─────────────────────────────────────────────────────────────────
    this.add.rectangle(cx, y, PW - 10, 1, ACCENT).setOrigin(0.5);
    y += 14;
    this.add.text(px + 20, y, 'TRADE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    y += 20;

    const localTreasury  = localNation?.getTreasury();
    const targetTreasury = targetNation?.getTreasury();

    // Column headers
    this.add.text(px + 200, y, 'YOU GIVE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(cx + 90, y, 'YOU RECEIVE', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 18;

    const offerLbls:   Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};
    const requestLbls: Partial<Record<ResourceType, Phaser.GameObjects.Text>> = {};

    for (const res of TRADE_RESOURCES) {
      const rowY = y;
      this.add.text(px + 20, rowY + 14, `${res.emoji} ${res.label}`, {
        fontSize: '13px', color: LT, fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      // ── Offer column (what you give) ──────────────────────────────────────
      const offerVal = this.tradeOffer[res.type] ?? 0;
      const offerLbl = this.add.text(px + 200, rowY + 14, String(offerVal), {
        fontSize: '16px', color: GOLD_C, fontFamily: 'monospace',
      }).setOrigin(0.5);
      offerLbls[res.type] = offerLbl;

      const oBtnMinus = this.makeStepBtn(px + 168, rowY + 14, '−', BTN, LT);
      const oBtnPlus  = this.makeStepBtn(px + 234, rowY + 14, '+', BTN, LT);
      const maxOffer  = localTreasury?.getAmount(res.type) ?? 0;
      oBtnMinus.on('pointerup', () => {
        this.tradeOffer[res.type] = Math.max(0, (this.tradeOffer[res.type] ?? 0) - 10);
        offerLbl.setText(String(this.tradeOffer[res.type]));
      });
      oBtnPlus.on('pointerup', () => {
        this.tradeOffer[res.type] = Math.min(maxOffer, (this.tradeOffer[res.type] ?? 0) + 10);
        offerLbl.setText(String(this.tradeOffer[res.type]));
      });
      this.add.text(px + 148, rowY + 26, `(have: ${maxOffer})`, {
        fontSize: '10px', color: '#555577', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      // ── Request column (what you receive) ─────────────────────────────────
      const reqVal = this.tradeRequest[res.type] ?? 0;
      const reqLbl = this.add.text(cx + 90, rowY + 14, String(reqVal), {
        fontSize: '16px', color: '#88ddff', fontFamily: 'monospace',
      }).setOrigin(0.5);
      requestLbls[res.type] = reqLbl;

      const rBtnMinus = this.makeStepBtn(cx + 56,  rowY + 14, '−', BTN, LT);
      const rBtnPlus  = this.makeStepBtn(cx + 126, rowY + 14, '+', BTN, LT);
      const maxReq    = targetTreasury?.getAmount(res.type) ?? 0;
      rBtnMinus.on('pointerup', () => {
        this.tradeRequest[res.type] = Math.max(0, (this.tradeRequest[res.type] ?? 0) - 10);
        reqLbl.setText(String(this.tradeRequest[res.type]));
      });
      rBtnPlus.on('pointerup', () => {
        this.tradeRequest[res.type] = Math.min(maxReq, (this.tradeRequest[res.type] ?? 0) + 10);
        reqLbl.setText(String(this.tradeRequest[res.type]));
      });
      this.add.text(cx + 68, rowY + 26, `(they have: ${maxReq})`, {
        fontSize: '10px', color: '#555577', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);

      y += 36;
    }

    // Execute Trade button + status feedback
    y += 6;
    const tradeBg = this.add.rectangle(cx, y + 16, 180, 32, BTN)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(cx, y + 16, '⇄  EXECUTE TRADE', {
      fontSize: '13px', color: GOLD_C, fontFamily: 'monospace',
    }).setOrigin(0.5);
    const tradeStatus = this.add.text(cx, y + 38, '', {
      fontSize: '11px', color: '#ff8888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    tradeBg.on('pointerover', () => tradeBg.setFillStyle(BTN_HOV));
    tradeBg.on('pointerout',  () => tradeBg.setFillStyle(BTN));
    tradeBg.on('pointerup',   async () => {
      const result = await this.networkAdapter.sendCommand({
        type: 'OFFER_TRADE',
        playerId:       this.playerId,
        targetNationId: this.targetNationId,
        offer:          { ...this.tradeOffer },
        request:        { ...this.tradeRequest },
        issuedAtTick:   this.currentTick,
      });
      if (result.success) {
        tradeStatus.setColor('#88ff88').setText('Trade accepted!');
        // Reset counters on success
        this.tradeOffer   = {};
        this.tradeRequest = {};
        for (const res of TRADE_RESOURCES) {
          offerLbls[res.type]?.setText('0');
          requestLbls[res.type]?.setText('0');
        }
      } else {
        tradeStatus.setColor('#ff8888').setText(result.reason ?? 'Trade rejected.');
      }
    });

    y += 50;

    // ── ALLIANCES ─────────────────────────────────────────────────────────────
    this.add.rectangle(cx, y, PW - 10, 1, ACCENT).setOrigin(0.5);
    y += 14;
    this.add.text(px + 20, y, 'ALLIANCES', {
      fontSize: '11px', color: DIM, fontFamily: 'monospace', letterSpacing: 2,
    });
    y += 20;
    this.add.text(px + 20, y, 'Formal alliances are available in team game mode.', {
      fontSize: '13px', color: '#444466', fontFamily: 'monospace',
    });
  }

  // ── Helper ────────────────────────────────────────────────────────────────────

  private makeStepBtn(
    x: number,
    y: number,
    label: string,
    fillColor: number,
    textColor: string,
  ): Phaser.GameObjects.Rectangle {
    const btn = this.add.rectangle(x, y, 26, 26, fillColor)
      .setStrokeStyle(1, ACCENT).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontSize: '16px', color: textColor, fontFamily: 'monospace',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(BTN_HOV));
    btn.on('pointerout',  () => btn.setFillStyle(fillColor));
    return btn;
  }
}
