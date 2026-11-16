/**
 * Text measurement and line-wrapping.
 *
 * Templates pre-break every multi-line text into explicit lines using these
 * measurements, so the HTML preview, print view and PDF all break lines and
 * pages in exactly the same places (they use the same font files).
 */

export interface FontSpec {
  family: string;
  size: number; // pt
  weight?: 400 | 500 | 600 | 700;
  italic?: boolean;
}

/** Returns the advance width of `text` in pt. */
export type Measure = (text: string, font: FontSpec) => number;

/** Rough measurer for tests / non-browser environments (≈ Arial average widths). */
export const approxMeasure: Measure = (text, f) => {
  let em = 0;
  for (const ch of text) {
    if (/[ il.,:;|!'`]/.test(ch)) em += 0.28;
    else if (/[mwMW@]/.test(ch)) em += 0.83;
    else if (/[A-Z0-9]/.test(ch)) em += 0.64;
    else em += 0.52;
  }
  return em * f.size * (f.weight && f.weight >= 600 ? 1.06 : 1);
};

/** Canvas-based measurer: exact for the loaded web fonts. */
export function createCanvasMeasure(): Measure {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const cache = new Map<string, number>();
  return (text, f) => {
    if (!text) return 0;
    const font = `${f.italic ? 'italic ' : ''}${f.weight ?? 400} 100px "${f.family}"`;
    const key = font + '\u0000' + text;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width / 100; // em
      if (cache.size > 20000) cache.clear();
      cache.set(key, w);
    }
    return w * f.size;
  };
}

/**
 * Greedy word wrap. Honors explicit newlines; breaks words longer than the line.
 * A small safety margin keeps lines from re-wrapping in the PDF renderer.
 */
export function wrapText(text: string, maxWidth: number, font: FontSpec, measure: Measure): string[] {
  const limit = maxWidth * 0.985;
  const out: string[] = [];
  for (const para of (text ?? '').replace(/\r/g, '').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const token of words) {
      const candidate = line + token;
      if (measure(candidate.trimEnd(), font) <= limit) {
        line = candidate;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      line = /^\s+$/.test(token) ? '' : token;
      // A single word wider than the line: hard-break it.
      while (measure(line, font) > limit && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut), font) > limit) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Largest font size ≤ font.size (down to minSize) at which `text` fits in `width`. */
export function fitFontSize(text: string, width: number, font: FontSpec, measure: Measure, minSize = font.size * 0.7): number {
  let size = font.size;
  while (size > minSize && measure(text, { ...font, size }) > width) size -= 0.25;
  return size;
}
