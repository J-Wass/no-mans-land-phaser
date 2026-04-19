import Phaser from 'phaser';
import type UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';
import { UI } from '@/config/uiTheme';

export interface UiMetrics {
  width: number;
  height: number;
  shortSide: number;
  longSide: number;
  scale: number;
  compact: boolean;
  stacked: boolean;
  pad: number;
  gap: number;
  smallGap: number;
  radius: number;
  buttonHeight: number;
  iconSize: number;
  titleSize: number;
  headingSize: number;
  bodySize: number;
  labelSize: number;
  captionSize: number;
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';

export interface ButtonParts {
  root: UIPlugin.Label;
  background: UIPlugin.RoundRectangle;
  text: Phaser.GameObjects.Text;
}

export interface ButtonOptions {
  variant?: ButtonVariant;
  width?: number;
  height?: number;
  fontSize?: number;
  enabled?: boolean;
}

const BUTTON_COLORS: Record<ButtonVariant, { fill: number; hover: number; stroke: number; text: string }> = {
  primary: { fill: UI.BTN_ACTIVE, hover: 0x3c70af, stroke: UI.ACCENT_SOFT, text: UI.WHITE },
  secondary: { fill: UI.BTN, hover: UI.BTN_HOV, stroke: UI.ACCENT, text: UI.LT },
  danger: { fill: UI.RED_BTN, hover: UI.RED_H, stroke: 0xff8a7b, text: '#ffe3de' },
  success: { fill: UI.GREEN_BTN, hover: UI.GREEN_H, stroke: 0x89e4ad, text: '#e6fff0' },
  warning: { fill: UI.WARN_BTN, hover: UI.WARN_H, stroke: 0xffd37a, text: '#fff1d1' },
  ghost: { fill: UI.PANEL_ALT, hover: UI.SURFACE, stroke: 0x6d80a4, text: UI.LT },
};

export function getUiMetrics(scene: Phaser.Scene): UiMetrics {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const scale = Phaser.Math.Clamp(shortSide / 900, 0.82, 1.42);
  const compact = width < 1180;
  const stacked = width < 900;
  const pad = Math.round(Phaser.Math.Clamp(shortSide * 0.028, 14, 30));
  const gap = Math.round(Phaser.Math.Clamp(shortSide * 0.018, 10, 22));
  const smallGap = Math.max(8, Math.round(gap * 0.6));
  const radius = Math.round(Phaser.Math.Clamp(shortSide * 0.018, 10, 22));
  const buttonHeight = Math.round(Phaser.Math.Clamp(shortSide * 0.07, 42, 66));
  const iconSize = Math.round(Phaser.Math.Clamp(shortSide * 0.05, 24, 40));
  const titleSize = Math.round(Phaser.Math.Clamp(42 * scale, 32, 64));
  const headingSize = Math.round(Phaser.Math.Clamp(22 * scale, 18, 30));
  const bodySize = Math.round(Phaser.Math.Clamp(16 * scale, 14, 22));
  const labelSize = Math.round(Phaser.Math.Clamp(13 * scale, 12, 18));
  const captionSize = Math.round(Phaser.Math.Clamp(12 * scale, 11, 16));

  return {
    width,
    height,
    shortSide,
    longSide,
    scale,
    compact,
    stacked,
    pad,
    gap,
    smallGap,
    radius,
    buttonHeight,
    iconSize,
    titleSize,
    headingSize,
    bodySize,
    labelSize,
    captionSize,
    safeTop: pad,
    safeBottom: height - pad,
    safeLeft: pad,
    safeRight: width - pad,
  };
}

export function createBackdrop(scene: Phaser.Scene, alpha = 0.72): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, UI.BG, alpha)
    .setOrigin(0, 0)
    .setInteractive();
}

export function createRoundRect(
  scene: Phaser.Scene,
  width: number,
  height: number,
  fillColor: number,
  alpha = 1,
  radius = 16,
  strokeColor: number = UI.ACCENT,
  strokeWidth = 2,
): UIPlugin.RoundRectangle {
  return scene.rexUI.add.roundRectangle(0, 0, width, height, radius, fillColor, alpha)
    .setStrokeStyle(strokeWidth, strokeColor, 0.9);
}

export function colorString(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function createText(
  scene: Phaser.Scene,
  text: string,
  metrics: UiMetrics,
  kind: 'title' | 'heading' | 'body' | 'label' | 'caption' | 'data' = 'body',
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const size = kind === 'title'
    ? metrics.titleSize
    : kind === 'heading'
      ? metrics.headingSize
      : kind === 'body'
        ? metrics.bodySize
        : kind === 'caption'
          ? metrics.captionSize
          : metrics.labelSize;

  const defaultStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: kind === 'data' ? UI.FONT_DATA : UI.FONT_BODY,
    fontSize: `${size}px`,
    color: kind === 'caption' ? UI.MUTED : UI.LT,
  };

  return scene.add.text(0, 0, text, { ...defaultStyle, ...style });
}

export function createButton(
  scene: Phaser.Scene,
  metrics: UiMetrics,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): ButtonParts {
  const variant = options.variant ?? 'secondary';
  const palette = BUTTON_COLORS[variant];
  const width = options.width ?? Math.round(150 * metrics.scale);
  const height = options.height ?? metrics.buttonHeight;
  const background = createRoundRect(
    scene,
    width,
    height,
    palette.fill,
    1,
    Math.round(metrics.radius * 0.9),
    palette.stroke,
    2,
  );
  const text = createText(scene, label, metrics, 'label', {
    fontSize: `${options.fontSize ?? Math.round(metrics.labelSize * 1.05)}px`,
    color: palette.text,
    fontFamily: UI.FONT_BODY,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const root = scene.rexUI.add.label({
    width,
    height,
    background,
    text,
    align: 'center',
    space: {
      left: metrics.smallGap,
      right: metrics.smallGap,
      top: Math.max(8, Math.round(metrics.smallGap * 0.8)),
      bottom: Math.max(8, Math.round(metrics.smallGap * 0.8)),
    },
  }).layout();

  const enabled = options.enabled ?? true;
  if (enabled) {
    root.setInteractive({ useHandCursor: true });
    root.on('pointerover', () => background.setFillStyle(palette.hover));
    root.on('pointerout', () => background.setFillStyle(palette.fill));
    root.on('pointerup', () => onClick());
  } else {
    background.setFillStyle(UI.PANEL_ALT).setStrokeStyle(2, 0x34435d, 0.8);
    text.setColor('#6d7f9d');
    root.disableInteractive();
    root.setAlpha(0.8);
  }

  return { root, background, text };
}

export function setButtonEnabled(button: ButtonParts, enabled: boolean, variant: ButtonVariant = 'secondary'): void {
  const palette = BUTTON_COLORS[variant];
  if (!enabled) {
    button.background.setFillStyle(UI.PANEL_ALT).setStrokeStyle(2, 0x34435d, 0.8);
    button.text.setColor('#6d7f9d');
    button.root.disableInteractive();
    button.root.setAlpha(0.82);
    return;
  }

  button.background.setFillStyle(palette.fill).setStrokeStyle(2, palette.stroke, 0.9);
  button.text.setColor(palette.text);
  button.root.setInteractive({ useHandCursor: true });
  button.root.setAlpha(1);
}

export function createPanelSizer(
  scene: Phaser.Scene,
  metrics: UiMetrics,
  width: number,
  height: number,
  orientation: 0 | 1 | 'x' | 'y' | 'horizontal' | 'vertical' = 'y',
  fill: number = UI.PANEL,
): UIPlugin.Sizer {
  const panel = scene.rexUI.add.sizer({
    width,
    height,
    orientation,
    space: {
      left: metrics.pad,
      right: metrics.pad,
      top: metrics.pad,
      bottom: metrics.pad,
      item: metrics.gap,
    },
  });
  panel.addBackground(createRoundRect(scene, width, height, fill, 0.96, metrics.radius, UI.ACCENT, 2));
  return panel;
}

export function createScrollablePanel(
  scene: Phaser.Scene,
  metrics: UiMetrics,
  width: number,
  height: number,
  content: Phaser.GameObjects.GameObject,
  fill: number = UI.PANEL_ALT,
): UIPlugin.ScrollablePanel {
  return scene.rexUI.add.scrollablePanel({
    width,
    height,
    background: createRoundRect(scene, width, height, fill, 0.96, metrics.radius, UI.ACCENT, 2),
    panel: {
      child: content,
      mask: { padding: 1, updateMode: 'everyTick' },
      enableLayer: true,
    },
    slider: {
      track: createRoundRect(scene, Math.max(10, Math.round(metrics.smallGap * 1.1)), height, UI.PANEL, 1, metrics.smallGap, 0x2f4b74, 1),
      thumb: createRoundRect(scene, Math.max(10, Math.round(metrics.smallGap * 1.1)), Math.max(50, Math.round(height * 0.18)), UI.ACCENT, 1, metrics.smallGap, UI.ACCENT_SOFT, 1),
    },
    mouseWheelScroller: { focus: false, speed: 0.18 },
    scrollMode: 0,
    space: {
      left: metrics.smallGap,
      right: metrics.smallGap,
      top: metrics.smallGap,
      bottom: metrics.smallGap,
      panel: metrics.smallGap,
      sliderY: metrics.smallGap,
    },
  }).layout();
}

export function fitPanel(
  width: number,
  height: number,
  fraction: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  return {
    width: Math.min(maxWidth, Math.round(width * fraction)),
    height: Math.min(maxHeight, Math.round(height * fraction)),
  };
}
