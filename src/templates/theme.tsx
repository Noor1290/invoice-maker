import { createContext, useContext } from 'react';

/** The two brand colours a user can pick (Settings ▸ Company profile ▸ Theme colours). */
export interface DocTheme {
  primary: string; // bars, table header, headings
  accent: string; // dividers, section headings, balance row
}

export const DEFAULT_THEME: DocTheme = { primary: '#0B2C5F', accent: '#C9A243' };

/** Full palette used by the templates, derived from the two theme colours. */
export interface Palette {
  navy: string;
  gold: string;
  goldText: string;
  band: string;
  balance: string;
  grey: string;
  light: string;
  ink: string;
  line: string;
  white: string;
}

const FIXED = { grey: '#5F6368', light: '#676D74', ink: '#202124', line: '#D9DEE7', white: '#FFFFFF' };

export const DEFAULT_PALETTE: Palette = {
  navy: DEFAULT_THEME.primary,
  gold: DEFAULT_THEME.accent,
  goldText: '#8A6D1F',
  band: '#F3F5F9',
  balance: '#F7F0DC',
  ...FIXED,
};

export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** Mix `a` toward `b` by t (0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}

/** WCAG relative luminance and contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = rgb(h).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function paletteFor(theme: Partial<DocTheme> | undefined): Palette {
  const primary = isHexColor(theme?.primary) ? theme!.primary.toUpperCase() : DEFAULT_THEME.primary;
  const accent = isHexColor(theme?.accent) ? theme!.accent.toUpperCase() : DEFAULT_THEME.accent;
  if (primary === DEFAULT_THEME.primary && accent === DEFAULT_THEME.accent) return DEFAULT_PALETTE;
  // Darken the accent until it is readable as small text on white (≥ 4.5:1).
  let goldText = accent;
  for (let t = 0; t <= 1 && contrast(goldText, '#FFFFFF') < 4.5; t += 0.05) goldText = mix(accent, '#000000', t);
  return {
    navy: primary,
    gold: accent,
    goldText,
    band: mix(primary, '#FFFFFF', 0.95),
    balance: mix(accent, '#FFFFFF', 0.82),
    ...FIXED,
  };
}

const PaletteContext = createContext<Palette>(DEFAULT_PALETTE);
export const PaletteProvider = PaletteContext.Provider;
export function useClr(): Palette {
  return useContext(PaletteContext);
}
