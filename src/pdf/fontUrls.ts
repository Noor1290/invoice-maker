// Bundled font files for the PDF (same files the preview uses, via @fontsource).
// WOFF (not WOFF2) because the PDF engine embeds them as TrueType subsets.
import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff?url';
import arimo400i from '@fontsource/arimo/files/arimo-latin-400-italic.woff?url';
import arimo600 from '@fontsource/arimo/files/arimo-latin-600-normal.woff?url';
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff?url';
import gelasio700 from '@fontsource/gelasio/files/gelasio-latin-700-normal.woff?url';
import gelasio400i from '@fontsource/gelasio/files/gelasio-latin-400-italic.woff?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter400i from '@fontsource/inter/files/inter-latin-400-italic.woff?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import playfair600 from '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff?url';
import playfair400i from '@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff?url';
import { faceFile, TEMPLATE_FACES } from '@/templates/fonts';

const URLS: Record<string, string> = {
  [faceFile(TEMPLATE_FACES[0])]: arimo400,
  [faceFile(TEMPLATE_FACES[1])]: arimo400i,
  [faceFile(TEMPLATE_FACES[2])]: arimo600,
  [faceFile(TEMPLATE_FACES[3])]: arimo700,
  [faceFile(TEMPLATE_FACES[4])]: gelasio700,
  [faceFile(TEMPLATE_FACES[5])]: gelasio400i,
  [faceFile(TEMPLATE_FACES[6])]: inter400,
  [faceFile(TEMPLATE_FACES[7])]: inter400i,
  [faceFile(TEMPLATE_FACES[8])]: inter600,
  [faceFile(TEMPLATE_FACES[9])]: inter700,
  [faceFile(TEMPLATE_FACES[10])]: playfair600,
  [faceFile(TEMPLATE_FACES[11])]: playfair400i,
};

export function browserFontSource(file: string): string {
  const url = URLS[file];
  if (!url) throw new Error(`Font file not bundled: ${file}`);
  return url;
}
