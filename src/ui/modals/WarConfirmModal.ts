export class WarConfirmModal {
  private escHandler: (e: KeyboardEvent) => void;

  constructor(
    private nationNames: string[],
    private onConfirm: () => void,
    private onClose: () => void,
  ) {
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
  }

  render(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const panel = document.createElement('div');
    panel.className = 'modal-panel narrow';
    panel.style.gap = 'var(--ui-gap)';

    const title = document.createElement('div');
    title.className = 'text-heading text-danger text-center text-bold';
    title.textContent = 'DECLARE WAR?';

    const desc = document.createElement('div');
    desc.className = 'text-body text-dim text-center text-wrap';
    desc.textContent = 'Moving this unit will pull the following nations into open conflict.';

    const list = document.createElement('div');
    list.className = 'col tight';
    list.style.alignItems = 'center';
    for (const name of this.nationNames) {
      const entry = document.createElement('div');
      entry.className = 'text-body text-gold text-bold text-mono';
      entry.textContent = `- ${name}`;
      list.appendChild(entry);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'row';
    btnRow.style.marginTop = '4px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary grow';
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger grow';
    confirmBtn.textContent = 'DECLARE WAR & MOVE';
    confirmBtn.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    panel.appendChild(title);
    panel.appendChild(desc);
    panel.appendChild(list);
    panel.appendChild(btnRow);
    backdrop.appendChild(panel);

    document.addEventListener('keydown', this.escHandler);
    return backdrop;
  }

  private close(): void {
    this.destroy();
    this.onClose();
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
  }
}
