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

/** Read a localStorage key, falling back to `fallback` if storage is blocked (private mode, quota, sandboxed iframe). */
function readStorage(key: string, fallback: string | null): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return fallback;
  }
}

/** Write a localStorage key; a no-op (in-memory defaults keep working) if storage is blocked. */
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage — accessibility settings just won't persist this session.
  }
}

export function getFont(): string {
  return readStorage(KEY_FONT, null) ?? 'monospace';
}

export function setFont(value: string): void {
  writeStorage(KEY_FONT, value);
  applyAccessibilitySettings();
}

export function getFontSizeScale(): number {
  const stored = readStorage(KEY_SIZE, null);
  return stored ? parseFloat(stored) : 1.0;
}

export function setFontSizeScale(value: number): void {
  writeStorage(KEY_SIZE, String(value));
  applyAccessibilitySettings();
}

export function applyAccessibilitySettings(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const font = getFont();
  root.style.setProperty('--font-display', font);
  root.style.setProperty('--font-body', font);
  root.style.setProperty('--font-data', font);
  window.dispatchEvent(new CustomEvent('accessibility:changed'));
}
