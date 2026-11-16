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
