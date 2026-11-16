import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';

/**
 * A tiny, renderer-neutral style vocabulary. All lengths are in pt.
 * Templates use only these keys, so the same layout renders identically
 * as HTML (preview / print) and as a PDF (@react-pdf/renderer, see src/pdf).
 * Views are flex columns by default, as in Yoga / react-pdf.
 */
export interface Style {
  position?: 'relative' | 'absolute';
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number | string;
  height?: number;
  minHeight?: number;
  flexDirection?: 'row' | 'column';
  flexGrow?: number;
  flexShrink?: number;
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignSelf?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  backgroundColor?: string;
  borderTopWidth?: number;
  borderTopColor?: string;
  borderBottomWidth?: number;
  borderBottomColor?: string;
  borderLeftWidth?: number;
  borderLeftColor?: string;
  borderRightWidth?: number;
  borderRightColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  opacity?: number;
  objectFit?: 'contain';
  transform?: string;
}

export interface ViewProps {
  style?: Style;
  /** Form field this element represents (click-to-focus in the preview). */
  field?: string;
  children?: ReactNode;
}
export interface TextProps {
  style?: Style;
  field?: string;
  children?: ReactNode;
}
export interface ImageProps {
  src: string;
  style?: Style;
  field?: string;
}
export interface PageProps {
  children?: ReactNode;
  pageIndex: number;
}

export interface Primitives {
  kind: 'html' | 'pdf';
  View: (p: ViewProps) => ReactNode;
  Text: (p: TextProps) => ReactNode;
  Image: (p: ImageProps) => ReactNode;
  Page: (p: PageProps) => ReactNode;
}

export const A4 = { width: 595.28, height: 841.89 };

// ───────────────────────── HTML renderer ─────────────────────────

const PT_KEYS = new Set<keyof Style>([
  'top', 'left', 'right', 'bottom', 'width', 'height', 'minHeight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
  'fontSize', 'letterSpacing',
]);

export function toCss(style: Style | undefined): CSSProperties {
  const css: Record<string, string | number> = {};
  if (!style) return css;
  for (const [k, v] of Object.entries(style) as [keyof Style, unknown][]) {
    if (v === undefined) continue;
    css[k] = PT_KEYS.has(k) && typeof v === 'number' ? `${v}pt` : (v as string | number);
  }
  for (const side of ['Top', 'Bottom', 'Left', 'Right'] as const) {
    if (style[`border${side}Width`]) css[`border${side}Style`] = 'solid';
  }
  return css as CSSProperties;
}

const viewBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  position: 'relative',
  minWidth: 0,
  flexShrink: 0,
};
const textBase: CSSProperties = { whiteSpace: 'pre', lineHeight: 'normal', margin: 0, flexShrink: 0, boxSizing: 'border-box' };

export const htmlPrimitives: Primitives = {
  kind: 'html',
  View: ({ style, field, children }) => (
    <div style={{ ...viewBase, ...toCss(style) }} data-field={field}>
      {children}
    </div>
  ),
  Text: ({ style, field, children }) => (
    <div style={{ ...textBase, ...toCss(style) }} data-field={field}>
      {children}
    </div>
  ),
  Image: ({ src, style, field }) => (
    <img src={src} alt="" style={{ ...toCss(style), objectFit: 'contain', display: 'block' }} data-field={field} />
  ),
  Page: ({ children, pageIndex }) => (
    <div
      className="invoice-page"
      data-page={pageIndex}
      style={{
        ...viewBase,
        width: `${A4.width}pt`,
        height: `${A4.height}pt`,
        overflow: 'hidden',
        background: '#FFFFFF',
        color: '#202124',
        // Don't inherit anything from the surrounding app (e.g. a <button> centres text).
        textAlign: 'left',
        fontWeight: 400,
        fontStyle: 'normal',
        letterSpacing: 'normal',
        textTransform: 'none',
        lineHeight: 'normal',
        fontSize: '9pt',
        cursor: 'auto',
      }}
    >
      {children}
    </div>
  ),
};

const PrimitivesContext = createContext<Primitives>(htmlPrimitives);
export const PrimitivesProvider = PrimitivesContext.Provider;
export function usePrimitives() {
  return useContext(PrimitivesContext);
}
