import type { PhaserUIBridge } from '@/ui/PhaserUIBridge';
import { DiplomaticStatus } from '@/types/diplomacy';
import { ResourceType } from '@/systems/resources/ResourceType';
import { TICK_RATE } from '@/config/constants';

const TRADE_RESOURCES = [
  { type: ResourceType.GOLD,         label: 'Gold',      emoji: '🪙' },
  { type: ResourceType.RAW_MATERIAL, label: 'Materials', emoji: '🪨' },
  { type: ResourceType.FOOD,         label: 'Food',      emoji: '🍎' },
];

function relationLabel(status: DiplomaticStatus): string {
  if (status === DiplomaticStatus.ALLY) return 'ALLIED';
  if (status === DiplomaticStatus.WAR)  return 'AT WAR';
  return 'AT PEACE';
}
function relationColor(status: DiplomaticStatus): string {
  if (status === DiplomaticStatus.ALLY) return '#55ff99';
  if (status === DiplomaticStatus.WAR)  return '#ff5555';
  return '#ffdd77';
}

export class DiplomacyModal {
  private escHandler: (e: KeyboardEvent) => void;
  private targetNationId: string | null;
  private tradeOffer: Partial<Record<ResourceType, number>> = {};
  private tradeRequest: Partial<Record<ResourceType, number>> = {};

  constructor(private bridge: PhaserUIBridge, targetNationId?: string) {
    this.targetNationId = targetNationId ?? null;
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
  }

  render(): HTMLElement {
    const localPlayer = this.bridge.gameState.getLocalPlayer();
    const localNation = localPlayer
      ? this.bridge.gameState.getNation(localPlayer.getControlledNationId())
      : null;
    const knownNations = localNation
      ? this.bridge.gameState.getKnownNationIds(localNation.getId())
          .map(id => this.bridge.gameState.getNation(id))
          .filter((n): n is NonNullable<typeof n> => Boolean(n))
      : [];
    const defeatedNations = this.bridge.gameState.getDefeatedNations();

    if (!this.targetNationId || !knownNations.some(n => n.getId() === this.targetNationId)) {
      this.targetNationId = knownNations[0]?.getId() ?? null;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.width = 'min(860px, 94vw)';
    panel.style.maxHeight = '92vh';
    panel.style.gap = 'var(--ui-gap)';

    // Header row
    const hdrRow = document.createElement('div');
    hdrRow.className = 'row spread';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'col tight';
    const title = document.createElement('div');
    title.className = 'text-heading text-bold';
    title.textContent = 'DIPLOMACY';
    const subtitle = document.createElement('div');
    subtitle.className = 'text-caption text-dim';
    subtitle.textContent = 'Known nations';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-sm';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    hdrRow.appendChild(titleWrap);
    hdrRow.appendChild(closeBtn);
    panel.appendChild(hdrRow);

    if (!localNation || (knownNations.length === 0 && defeatedNations.length === 0)) {
      const empty = document.createElement('div');
      empty.className = 'text-body text-dim text-center';
      empty.style.padding = '40px 0';
      empty.textContent = 'No other nations have been discovered yet.';
      panel.appendChild(empty);
      backdrop.appendChild(panel);
      document.addEventListener('keydown', this.escHandler);
      return backdrop;
    }

    // Two-column layout
    const cols = document.createElement('div');
    cols.className = 'row';
    cols.style.alignItems = 'flex-start';
    cols.style.gap = 'var(--ui-gap)';
    cols.style.flex = '1';
    cols.style.overflow = 'hidden';

    // Left column: nation list
    const listCol = document.createElement('div');
    listCol.className = 'col tight scrollable';
    listCol.style.width = '220px';
    listCol.style.flexShrink = '0';
    listCol.style.background = 'rgba(11,18,32,0.88)';
    listCol.style.border = '1px solid #223b66';
    listCol.style.borderRadius = '5px';
    listCol.style.padding = '6px';
    listCol.style.maxHeight = '60vh';

    for (const nation of knownNations) {
      const selected = nation.getId() === this.targetNationId;
      const row = document.createElement('div');
      row.className = `nation-row${selected ? ' selected' : ''}`;

      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = nation.getColor();

      const info = document.createElement('div');
      info.className = 'col tight';
      const nameLbl = document.createElement('div');
      nameLbl.className = 'text-label text-mono';
      nameLbl.style.fontWeight = selected ? 'bold' : 'normal';
      nameLbl.textContent = nation.getName();
      const statusLbl = document.createElement('div');
      statusLbl.className = 'text-caption text-mono';
      const rel = localNation.getRelation(nation.getId());
      statusLbl.textContent = relationLabel(rel);
      statusLbl.style.color = relationColor(rel);

      info.appendChild(nameLbl);
      info.appendChild(statusLbl);
      row.appendChild(dot);
      row.appendChild(info);
      row.addEventListener('click', () => {
        this.destroy();
        this.targetNationId = nation.getId();
        const newModal = new DiplomacyModal(this.bridge, nation.getId());
        const el = newModal.render();
        (this.bridge as any).activeModals?.set('diplomacy', newModal);
        import('@/ui/UIManager').then(({ UIManager }) => UIManager.open('diplomacy', el));
      });
      listCol.appendChild(row);
    }

    for (const nation of defeatedNations) {
      const row = document.createElement('div');
      row.className = 'nation-row';
      row.style.opacity = '0.72';

      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = '#6f7380';

      const info = document.createElement('div');
      info.className = 'col tight';
      const nameLbl = document.createElement('div');
      nameLbl.className = 'text-label text-mono';
      nameLbl.textContent = `RIP ${nation.name}`;
      const statusLbl = document.createElement('div');
      statusLbl.className = 'text-caption text-mono';
      statusLbl.textContent = 'DEFEATED';
      statusLbl.style.color = '#9aa0a8';

      info.appendChild(nameLbl);
      info.appendChild(statusLbl);
      row.appendChild(dot);
      row.appendChild(info);
      listCol.appendChild(row);
    }

    // Right column: detail panel
    const detailCol = document.createElement('div');
    detailCol.className = 'col grow scrollable';
    detailCol.style.maxHeight = '60vh';

    const targetNation = this.targetNationId ? this.bridge.gameState.getNation(this.targetNationId) : null;
    if (targetNation) {
      // Nation header
      const natHdr = document.createElement('div');
      natHdr.className = 'row tight';
      const natDot = document.createElement('div');
      natDot.style.width = '18px';
      natDot.style.height = '18px';
      natDot.style.borderRadius = '50%';
      natDot.style.backgroundColor = targetNation.getColor();
      natDot.style.flexShrink = '0';
      const natName = document.createElement('div');
      natName.className = 'text-heading text-bold';
      natName.textContent = targetNation.getName();
      natHdr.appendChild(natDot);
      natHdr.appendChild(natName);
      detailCol.appendChild(natHdr);

      // Relations section
      const relSection = document.createElement('div');
      relSection.className = 'panel-alt col tight';
      const relLabel = document.createElement('div');
      relLabel.className = 'section-label';
      relLabel.textContent = 'RELATIONS';

      const status = localNation.getRelation(targetNation.getId());
      const statusRow = document.createElement('div');
      statusRow.className = 'row spread';

      const statusText = document.createElement('div');
      statusText.className = 'text-body text-mono text-bold';
      statusText.style.color = relationColor(status);
      statusText.textContent = `Status: ${relationLabel(status)}`;

      statusRow.appendChild(statusText);

      const currentTick = this.bridge.tickEngine.getCurrentTick();
      if (status === DiplomaticStatus.WAR) {
        const cooldown = this.bridge.diplomacySystem.getPeaceCooldownRemaining(
          localNation.getId(), targetNation.getId(), currentTick);
        const onCooldown = cooldown > 0;
        const peaceBtn = document.createElement('button');
        peaceBtn.className = `btn btn-success btn-sm${onCooldown ? ' disabled' : ''}`;
        peaceBtn.disabled = onCooldown;
        peaceBtn.textContent = onCooldown ? `PEACE (${Math.ceil(cooldown / TICK_RATE)}s)` : 'PROPOSE PEACE';
        peaceBtn.addEventListener('click', async () => {
          const lp = this.bridge.gameState.getLocalPlayer();
          if (!lp) return;
          await this.bridge.networkAdapter.sendCommand({
            type: 'PROPOSE_PEACE',
            playerId: lp.getId(),
            targetNationId: targetNation.getId(),
            issuedAtTick: currentTick,
          });
          this.close();
        });
        statusRow.appendChild(peaceBtn);
      } else if (status === DiplomaticStatus.NEUTRAL) {
        const canWar = this.bridge.diplomacySystem.canDeclareWar(
          localNation.getId(), targetNation.getId(), currentTick);
        const cooldown = this.bridge.diplomacySystem.getPeaceCooldownRemaining(
          localNation.getId(), targetNation.getId(), currentTick);
        const warBtn = document.createElement('button');
        warBtn.className = `btn btn-danger btn-sm${canWar ? '' : ' disabled'}`;
        warBtn.disabled = !canWar;
        warBtn.textContent = !canWar && cooldown > 0
          ? `WAR (${Math.ceil(cooldown / TICK_RATE)}s)` : 'DECLARE WAR';
        warBtn.addEventListener('click', async () => {
          const lp = this.bridge.gameState.getLocalPlayer();
          if (!lp) return;
          await this.bridge.networkAdapter.sendCommand({
            type: 'DECLARE_WAR',
            playerId: lp.getId(),
            targetNationId: targetNation.getId(),
            issuedAtTick: currentTick,
          });
          this.close();
        });
        statusRow.appendChild(warBtn);
      }

      relSection.appendChild(relLabel);
      relSection.appendChild(statusRow);
      detailCol.appendChild(relSection);

      // Trade section
      const tradeSection = document.createElement('div');
      tradeSection.className = 'panel-alt col tight';
      const tradeLabel = document.createElement('div');
      tradeLabel.className = 'section-label';
      tradeLabel.textContent = 'TRADE';

      const tradeColHdr = document.createElement('div');
      tradeColHdr.className = 'row';
      tradeColHdr.style.gap = '0';
      ['', 'YOU GIVE', 'YOU RECEIVE'].forEach((h, i) => {
        const cell = document.createElement('div');
        cell.className = 'text-caption text-dim text-center';
        cell.style.flex = i === 0 ? '1' : '0 0 130px';
        cell.textContent = h;
        tradeColHdr.appendChild(cell);
      });

      tradeSection.appendChild(tradeLabel);
      tradeSection.appendChild(tradeColHdr);

      const localTreasury = localNation.getTreasury();
      const targetTreasury = targetNation.getTreasury();
      const offerLbls  = new Map<ResourceType, HTMLElement>();
      const requestLbls = new Map<ResourceType, HTMLElement>();

      for (const res of TRADE_RESOURCES) {
        const resRow = document.createElement('div');
        resRow.className = 'row';
        resRow.style.gap = '0';

        const nameLbl = document.createElement('div');
        nameLbl.style.flex = '1';
        nameLbl.className = 'text-label';
        nameLbl.textContent = `${res.emoji} ${res.label}`;

        // Offer controls
        const offerCell = document.createElement('div');
        offerCell.style.flex = '0 0 130px';
        offerCell.className = 'row tight';
        offerCell.style.justifyContent = 'center';

        const minusOffer = document.createElement('button');
        minusOffer.className = 'step-btn';
        minusOffer.textContent = '-';
        const offerLbl = document.createElement('span');
        offerLbl.className = 'text-body text-mono text-gold';
        offerLbl.style.minWidth = '30px';
        offerLbl.style.textAlign = 'center';
        offerLbl.textContent = '0';
        offerLbls.set(res.type, offerLbl);
        const plusOffer = document.createElement('button');
        plusOffer.className = 'step-btn';
        plusOffer.textContent = '+';

        const maxOffer = localTreasury.getAmount(res.type);
        minusOffer.addEventListener('click', () => {
          this.tradeOffer[res.type] = Math.max(0, (this.tradeOffer[res.type] ?? 0) - 10);
          offerLbl.textContent = String(this.tradeOffer[res.type]);
        });
        plusOffer.addEventListener('click', () => {
          this.tradeOffer[res.type] = Math.min(maxOffer, (this.tradeOffer[res.type] ?? 0) + 10);
          offerLbl.textContent = String(this.tradeOffer[res.type]);
        });

        offerCell.appendChild(minusOffer);
        offerCell.appendChild(offerLbl);
        offerCell.appendChild(plusOffer);

        // Request controls
        const reqCell = document.createElement('div');
        reqCell.style.flex = '0 0 130px';
        reqCell.className = 'row tight';
        reqCell.style.justifyContent = 'center';

        const minusReq = document.createElement('button');
        minusReq.className = 'step-btn';
        minusReq.textContent = '-';
        const reqLbl = document.createElement('span');
        reqLbl.className = 'text-body text-mono';
        reqLbl.style.color = '#88ddff';
        reqLbl.style.minWidth = '30px';
        reqLbl.style.textAlign = 'center';
        reqLbl.textContent = '0';
        requestLbls.set(res.type, reqLbl);
        const plusReq = document.createElement('button');
        plusReq.className = 'step-btn';
        plusReq.textContent = '+';

        const maxReq = targetTreasury.getAmount(res.type);
        minusReq.addEventListener('click', () => {
          this.tradeRequest[res.type] = Math.max(0, (this.tradeRequest[res.type] ?? 0) - 10);
          reqLbl.textContent = String(this.tradeRequest[res.type]);
        });
        plusReq.addEventListener('click', () => {
          this.tradeRequest[res.type] = Math.min(maxReq, (this.tradeRequest[res.type] ?? 0) + 10);
          reqLbl.textContent = String(this.tradeRequest[res.type]);
        });

        reqCell.appendChild(minusReq);
        reqCell.appendChild(reqLbl);
        reqCell.appendChild(plusReq);

        resRow.appendChild(nameLbl);
        resRow.appendChild(offerCell);
        resRow.appendChild(reqCell);
        tradeSection.appendChild(resRow);
      }

      const tradeStatus = document.createElement('div');
      tradeStatus.className = 'text-caption text-center';
      tradeStatus.style.minHeight = '16px';

      const tradeBtn = document.createElement('button');
      tradeBtn.className = 'btn btn-secondary btn-sm';
      tradeBtn.style.alignSelf = 'center';
      tradeBtn.textContent = '⇄ EXECUTE TRADE';
      tradeBtn.addEventListener('click', async () => {
        const lp = this.bridge.gameState.getLocalPlayer();
        if (!lp) return;
        const result = await this.bridge.networkAdapter.sendCommand({
          type: 'OFFER_TRADE',
          playerId: lp.getId(),
          targetNationId: targetNation.getId(),
          offer: { ...this.tradeOffer },
          request: { ...this.tradeRequest },
          issuedAtTick: currentTick,
        });
        if (result.success) {
          tradeStatus.textContent = 'Trade accepted!';
          tradeStatus.style.color = '#88ff88';
          this.tradeOffer = {};
          this.tradeRequest = {};
          for (const res of TRADE_RESOURCES) {
            offerLbls.get(res.type)!.textContent = '0';
            requestLbls.get(res.type)!.textContent = '0';
          }
        } else {
          tradeStatus.textContent = result.reason ?? 'Trade rejected.';
          tradeStatus.style.color = '#ff8888';
        }
      });

      tradeSection.appendChild(tradeBtn);
      tradeSection.appendChild(tradeStatus);
      detailCol.appendChild(tradeSection);
    } else if (defeatedNations.length > 0) {
      const defeatedPanel = document.createElement('div');
      defeatedPanel.className = 'panel-alt col tight';
      const defeatedTitle = document.createElement('div');
      defeatedTitle.className = 'section-label';
      defeatedTitle.textContent = 'DEFEATED NATIONS';
      defeatedPanel.appendChild(defeatedTitle);
      for (const nation of defeatedNations) {
        const item = document.createElement('div');
        item.className = 'text-body text-mono';
        item.textContent = `RIP ${nation.name}`;
        item.style.color = '#b8bec8';
        defeatedPanel.appendChild(item);
      }
      detailCol.appendChild(defeatedPanel);
    }

    cols.appendChild(listCol);
    cols.appendChild(detailCol);
    panel.appendChild(cols);
    backdrop.appendChild(panel);
    document.addEventListener('keydown', this.escHandler);
    return backdrop;
  }

  private close(): void {
    this.destroy();
    this.bridge.closeDiplomacy();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
  }
}
