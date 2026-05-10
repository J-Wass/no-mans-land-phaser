const KEY_FONT = 'accessibility:font';
const KEY_SIZE = 'accessibility:fontSize';

export const FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Monospace',  value: 'monospace' },
  { label: 'Sans-serif', value: '"Trebuchet MS", Verdana, sans-serif' },
  { label: 'Serif',      value: '"Times New Roman", Georgia, serif' },
];

export const SIZE_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: 'Small',   value: 0.85 },
  { label: 'Normal',  value: 1.0  },
  { label: 'Large',   value: 1.2  },
  { label: 'X-Large', value: 1.4  },
];

export function getFont(): string {
  return localStorage.getItem(KEY_FONT) ?? 'monospace';
}

export function setFont(value: string): void {
  localStorage.setItem(KEY_FONT, value);
}

export function getFontSizeScale(): number {
  const stored = localStorage.getItem(KEY_SIZE);
  return stored ? parseFloat(stored) : 1.0;
}

export function setFontSizeScale(value: number): void {
  localStorage.setItem(KEY_SIZE, String(value));
}
