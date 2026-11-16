/**
 * Template fonts. All self-hosted (bundled via @fontsource), so the preview,
 * print view and PDF use the very same font files, with no CDN.
 *
 * Classic matches the original spreadsheet template, which uses Arial and Georgia:
 *   Arimo   = metric-compatible with Arial   (Apache 2.0)
 *   Gelasio = metric-compatible with Georgia (OFL)
 * Minimal uses the app's brand fonts, Inter and Playfair Display.
 */
export const FONT = {
  arial: 'Arimo',
  georgia: 'Gelasio',
  inter: 'Inter',
  playfair: 'Playfair Display',
} as const;

export interface FontFaceSpec {
  family: string;
  /** @fontsource package / file prefix */
  pkg: string;
  weight: 400 | 500 | 600 | 700;
  italic?: boolean;
}

/** Every face any template uses. The PDF registers exactly these files. */
export const TEMPLATE_FACES: FontFaceSpec[] = [
  { family: FONT.arial, pkg: 'arimo', weight: 400 },
  { family: FONT.arial, pkg: 'arimo', weight: 400, italic: true },
  { family: FONT.arial, pkg: 'arimo', weight: 600 },
  { family: FONT.arial, pkg: 'arimo', weight: 700 },
  { family: FONT.georgia, pkg: 'gelasio', weight: 700 },
  { family: FONT.georgia, pkg: 'gelasio', weight: 400, italic: true },
  { family: FONT.inter, pkg: 'inter', weight: 400 },
  { family: FONT.inter, pkg: 'inter', weight: 400, italic: true },
  { family: FONT.inter, pkg: 'inter', weight: 600 },
  { family: FONT.inter, pkg: 'inter', weight: 700 },
  { family: FONT.playfair, pkg: 'playfair-display', weight: 600 },
  { family: FONT.playfair, pkg: 'playfair-display', weight: 400, italic: true },
];

/** "@fontsource/arimo/files/arimo-latin-700-normal.woff" */
export function faceFile(f: FontFaceSpec): string {
  return `@fontsource/${f.pkg}/files/${f.pkg}-latin-${f.weight}-${f.italic ? 'italic' : 'normal'}.woff`;
}

let ready: Promise<void> | null = null;

/** Resolve once every template font face is loaded (needed before measuring text). */
export function loadTemplateFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      TEMPLATE_FACES.map((f) => document.fonts.load(`${f.italic ? 'italic ' : ''}${f.weight} 12px "${f.family}"`)),
    ).then(() => undefined);
  }
  return ready;
}
