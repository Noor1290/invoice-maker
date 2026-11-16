import { describe, expect, it } from 'vitest';
import { contrast, DEFAULT_PALETTE, paletteFor } from './theme';

describe('theme colours', () => {
  it('default theme gives the exact navy & gold palette', () => {
    expect(paletteFor(undefined)).toBe(DEFAULT_PALETTE);
    expect(paletteFor({ primary: '#0b2c5f', accent: '#c9a243' })).toBe(DEFAULT_PALETTE);
  });
  it('custom colours drive the palette; accent text stays readable', () => {
    const p = paletteFor({ primary: '#1E5631', accent: '#F2C14E' });
    expect(p.navy).toBe('#1E5631');
    expect(p.gold).toBe('#F2C14E');
    expect(contrast(p.goldText, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  it('invalid values fall back to the defaults', () => {
    expect(paletteFor({ primary: 'red', accent: '#12' })).toBe(DEFAULT_PALETTE);
  });
});

describe('captions are readable (WCAG AA) on every theme', () => {
  it.each([undefined, { primary: '#1E5631', accent: '#E07A1F' }, { primary: '#5B2A86', accent: '#F2C14E' }, { primary: '#7A1F1F', accent: '#B0B0B0' }])(
    'theme %o',
    (theme) => {
      const p = paletteFor(theme);
      for (const bg of ['#FFFFFF', p.band]) {
        expect(contrast(p.light, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.grey, bg)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
