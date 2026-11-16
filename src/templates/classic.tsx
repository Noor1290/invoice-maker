import { useMemo } from 'react';
import type { DocModel, TextLine } from './model';
import { A4, usePrimitives, type Style } from './primitives';
import { fitFontSize, wrapText, type FontSpec, type Measure } from './measure';
import { paginate, type PageSlice } from './paginate';
import { FONT } from './fonts';
import { formatMoney } from '@/lib/money';
import { useClr, type Palette } from './theme';

/**
 * Classic: a faithful rendering of the original spreadsheet invoice template.
 *
 * Geometry comes straight from the sheet: column widths B–J (5, 40, 7, 13, 8, 15, 8, 13, 16),
 * row heights, fills, borders and fonts (Arial → Arimo, Georgia → Gelasio). Excel prints the
 * sheet fit-to-width at ~77%; here widths use the same proportions, row heights are 80% and
 * font sizes 90% of the sheet's values, so text stays comfortably readable on A4.
 */

const FS = 0.9; // font scale
const HS = 0.8; // row-height scale
const f = (pt: number) => +(pt * FS).toFixed(2);
const h = (pt: number) => +(pt * HS).toFixed(2);

const M = 18; // page margin (≈ Excel's 0.3")
const GUT = 11; // Excel columns A and K
const COLW = { B: 23.36, C: 166.44, D: 31.54, E: 56.06, F: 35.62, G: 64.24, H: 35.62, I: 56.06, J: 68.33 };
const X0 = M + GUT;
const W = Object.values(COLW).reduce((a, b) => a + b, 0);
/**
 * Line-item table columns: #, Description, Qty, Unit Price, Disc. %, Amount (VAT exclusive).
 * '#' keeps column B's width and Amount ends flush with column J (the totals values).
 */
const TC = { no: COLW.B, desc: 0, qty: 40, price: 82, disc: 50, amount: 100 };
TC.desc = W - TC.no - TC.qty - TC.price - TC.disc - TC.amount;
const LEFT_W = COLW.B + COLW.C + COLW.D + COLW.E; // B:E
const RIGHT_W = COLW.G + COLW.H + COLW.I + COLW.J; // G:J
const INDENT = 5.5; // Excel indent level 1
const PAD = 2.5;

const TOP_BAR = h(8);
const FOOTER = h(22) + h(4);
const USABLE = A4.height - 2 * M - TOP_BAR - FOOTER;

const font = (size: number, weight: 400 | 700 = 400, italic = false, family: string = FONT.arial): FontSpec => ({
  family,
  size,
  weight,
  italic,
});
const asStyle = (fs: FontSpec, color: string): Style => ({
  fontFamily: fs.family,
  fontSize: fs.size,
  fontWeight: fs.weight,
  fontStyle: fs.italic ? 'italic' : 'normal',
  color,
});

const F_BODY = font(f(9));
const F_HEAD = font(f(8), 700);
const F_LINE = font(f(9));
const F_NOTES = font(f(8), 400, true);
const F_WORDS = font(f(8.5), 400, true);
const DESC_LINE_H = 9.6;
const ROW_MIN = h(22);
const MIN_ROWS = 12; // the Excel template has 12 item rows

export interface ClassicLayout {
  pages: PageSlice[];
  rowLines: string[][];
  rowHeights: number[];
  padRows: number;
  fromLines: string[][];
  toLines: string[][];
  partiesH: number;
  notesLines: string[];
  wordsLines: string[];
  bottomH: number;
}

function wrapLines(lines: TextLine[], width: number, fs: FontSpec, measure: Measure): string[][] {
  return lines.map((l) => wrapText(l.text, width, fs, measure));
}

export function layoutClassic(m: DocModel, measure: Measure): ClassicLayout {
  const descW = TC.desc - 2 * INDENT;
  const rowLines = m.rows.map((r) => wrapText(r.description, descW, F_BODY, measure));
  const rowHeights = rowLines.map((ls) => Math.max(ROW_MIN, ls.length * DESC_LINE_H + 8));

  const fromLines = wrapLines(m.seller.lines, LEFT_W, F_LINE, measure);
  const toLines = wrapLines(m.client.lines, RIGHT_W, F_LINE, measure);
  const n = Math.max(fromLines.flat().length, toLines.flat().length, 1);
  const partiesH = h(20) + h(20) + n * h(16) + h(18);

  const notesLines = m.notes.trim() ? wrapText(m.notes.trim(), LEFT_W, F_NOTES, measure) : [];
  const wordsLines = m.amountInWords ? wrapText(m.amountInWords, LEFT_W, F_WORDS, measure) : [];

  const leftH =
    h(18) + Math.max(1, m.bank.length) * h(18) + h(30) + wordsLines.length * 12 + 4 + h(24) + Math.max(h(44), notesLines.length * 9 + 6);
  const rightH = 4 * h(18) + (m.notSubjectToVat ? h(16) : 0) + h(30) + h(18) + h(24) + h(44) + h(16);
  const bottomH = h(14) + Math.max(leftH, rightH) + h(18) + h(24) + h(10);

  const firstTop = h(14) + h(44) + 5 * h(20) + h(10) + h(4) + h(12) + partiesH;
  const contTop = CONT_H;
  const tableHeader = h(30);

  let pages = paginate({ pageHeight: USABLE, firstTop, contTop, tableHeader, rows: rowHeights, bottom: bottomH });
  let padRows = 0;
  if (pages.length === 1 && rowHeights.length < MIN_ROWS) {
    const used = firstTop + tableHeader + rowHeights.reduce((a, b) => a + b, 0) + bottomH;
    padRows = Math.max(0, Math.min(MIN_ROWS - rowHeights.length, Math.floor((USABLE - used) / ROW_MIN)));
  }
  if (!rowHeights.length) pages = pages.map((p) => ({ ...p, start: 0, end: 0 }));

  return { pages, rowLines, rowHeights, padRows, fromLines, toLines, partiesH, notesLines, wordsLines, bottomH };
}

const CONT_H = h(14) + 26 + h(4) + h(12);

// ───────────────────────── Rendering ─────────────────────────

export function ClassicDoc({ model, measure }: { model: DocModel; measure: Measure }) {
  const layout = useMemo(() => layoutClassic(model, measure), [model, measure]);
  const { Page } = usePrimitives();
  return (
    <>
      {layout.pages.map((pg) => (
        <Page key={pg.index} pageIndex={pg.index}>
          <ClassicPage model={model} layout={layout} page={pg} pageCount={layout.pages.length} measure={measure} />
        </Page>
      ))}
    </>
  );
}

function ClassicPage({
  model: m,
  layout: L,
  page,
  pageCount,
  measure,
}: {
  model: DocModel;
  layout: ClassicLayout;
  page: PageSlice;
  pageCount: number;
  measure: Measure;
}) {
  const clr = useClr();
  const { View } = usePrimitives();
  const totalRows = L.rowHeights.length + L.padRows;
  const hasRows = page.end > page.start || (page.last && L.padRows > 0) || (page.first && totalRows === 0);

  return (
    <>
      {/* Row 1: navy bar across A:K */}
      <View style={{ position: 'absolute', top: M, left: M, width: A4.width - 2 * M, height: TOP_BAR, backgroundColor: clr.navy }} />

      <View style={{ position: 'absolute', top: M + TOP_BAR, left: X0, width: W }}>
        {page.first ? <TopBlock m={m} L={L} /> : <ContHeader m={m} page={page} pageCount={pageCount} />}
        {hasRows && <TableHeader currency={m.currency} />}
        {Array.from({ length: page.end - page.start }, (_, k) => {
          const i = page.start + k;
          return (
            <ItemRow
              key={i}
              i={i}
              m={m}
              lines={L.rowLines[i]}
              height={L.rowHeights[i]}
              lastOverall={i === totalRows - 1}
              measure={measure}
            />
          );
        })}
        {page.last &&
          Array.from({ length: L.padRows }, (_, k) => {
            const i = L.rowHeights.length + k;
            return <BlankRow key={`pad${k}`} i={i} lastOverall={i === totalRows - 1} />;
          })}
        {page.last && <BottomBlock m={m} L={L} measure={measure} />}
      </View>

      <Footer text={m.footer} page={page} pageCount={pageCount} />
      {m.isVoid && <VoidMark />}
    </>
  );
}

function Cell({
  w,
  hgt,
  align = 'left',
  indent = 0,
  style,
  field,
  children,
}: {
  w: number;
  hgt?: number;
  align?: 'left' | 'center' | 'right';
  indent?: number;
  style?: Style;
  field?: string;
  children?: React.ReactNode;
}) {
  const { View } = usePrimitives();
  return (
    <View
      field={field}
      style={{
        width: w,
        height: hgt,
        justifyContent: 'center',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        paddingLeft: align === 'left' ? indent || PAD : PAD,
        paddingRight: align === 'right' ? indent || PAD : PAD,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function TopBlock({ m, L }: { m: DocModel; L: ClassicLayout }) {
  const clr = useClr();
  const { View, Text, Image } = usePrimitives();
  const meta: [string, string, string][] = [
    ['Invoice No.', m.number || ' ', 'number'],
    ['Invoice Date', m.issueDate, 'issueDate'],
    ['Payment Terms', m.terms, 'termsDays'],
    ['Due Date', m.dueDate, 'dueDate'],
    ['Currency', m.currency, 'currency'],
  ];
  if (m.isCreditNote) meta[0][0] = 'Credit Note No.';
  const fromFlat = L.fromLines.flat();
  const toFlat = L.toLines.flat();
  const nLines = Math.max(fromFlat.length, toFlat.length, 1);

  return (
    <View>
      <View style={{ height: h(14) }} />
      {/* Rows 3–9: logo (B3) | title + meta (G:J) */}
      <View style={{ flexDirection: 'row', height: h(44) + 5 * h(20) }}>
        <View style={{ width: LEFT_W + COLW.F, alignItems: 'flex-start' }} field="seller">
          {m.logoUrl ? (
            <Image src={m.logoUrl} style={{ width: 138.4, height: 93.4, objectFit: 'contain' }} />
          ) : (
            m.logoPlaceholder && <LogoPlaceholderBox width={138.4} height={70} />
          )}
        </View>
        <View style={{ width: RIGHT_W }}>
          <View style={{ height: h(44), justifyContent: 'center', alignItems: 'flex-end' }}>
            <Text style={{ ...asStyle(font(f(26), 700, false, FONT.georgia), clr.navy) }}>{m.title}</Text>
          </View>
          {meta.map(([label, value, field]) => (
            <View
              key={label}
              field={field}
              style={{ flexDirection: 'row', height: h(20), borderBottomWidth: 0.6, borderBottomColor: clr.line }}
            >
              <Cell w={COLW.G + COLW.H} align="right">
                <Text style={asStyle(font(f(9), 700), clr.grey)}>{label}</Text>
              </Cell>
              <Cell w={COLW.I + COLW.J} align="right">
                <Text style={asStyle(font(f(10), 700), clr.navy)}>{value}</Text>
              </Cell>
            </View>
          ))}
        </View>
      </View>
      <View style={{ height: h(10) }} />
      {/* Row 11: gold divider B:J */}
      <View style={{ height: h(4), backgroundColor: clr.gold }} />
      <View style={{ height: h(12) }} />

      {/* Rows 13–19: FROM | BILL TO */}
      <View style={{ flexDirection: 'row', height: L.partiesH }}>
        <Party
          w={LEFT_W}
          heading="FROM"
          name={m.seller.name}
          lines={fromFlat}
          n={nLines}
          field="seller"
          nameField="seller"
        />
        <View style={{ width: COLW.F }} />
        <Party
          w={RIGHT_W}
          heading={m.isCreditNote ? 'CREDIT TO' : 'BILL TO'}
          name={m.client.name}
          lines={toFlat}
          n={nLines}
          field="client.address"
          nameField="client.name"
          lineFields={L.toLines.flatMap((ls, i) => ls.map(() => m.client.lines[i]?.field))}
        />
      </View>
    </View>
  );
}

function SectionHeading({ w, text, hgt, field }: { w: number; text: string; hgt: number; field?: string }) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  return (
    <View field={field} style={{ width: w, height: hgt, justifyContent: 'center', borderBottomWidth: 0.6, borderBottomColor: clr.gold }}>
      <Text style={{ ...asStyle(font(f(9), 700), clr.gold), paddingLeft: PAD }}>{text}</Text>
    </View>
  );
}

function Party(props: {
  w: number;
  heading: string;
  name: string;
  lines: string[];
  n: number;
  field: string;
  nameField: string;
  lineFields?: (string | undefined)[];
}) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  return (
    <View style={{ width: props.w }}>
      <SectionHeading w={props.w} text={props.heading} hgt={h(20)} field={props.nameField} />
      <View field={props.nameField} style={{ height: h(20), justifyContent: 'center', paddingLeft: PAD }}>
        <Text style={asStyle(font(f(11), 700), clr.navy)}>{props.name || ' '}</Text>
      </View>
      {props.lines.map((t, i) => (
        <View key={i} field={props.lineFields?.[i] ?? props.field} style={{ height: h(16), justifyContent: 'center', paddingLeft: PAD }}>
          <Text style={asStyle(F_LINE, clr.grey)}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function TableHeader({ currency }: { currency: string }) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  const hs = asStyle(F_HEAD, clr.white);
  return (
    <View style={{ flexDirection: 'row', height: h(30), backgroundColor: clr.navy }}>
      <Cell w={TC.no} align="center">
        <Text style={hs}>#</Text>
      </Cell>
      <Cell w={TC.desc} indent={INDENT}>
        <Text style={hs}>DESCRIPTION</Text>
      </Cell>
      <Cell w={TC.qty} align="center">
        <Text style={hs}>QTY</Text>
      </Cell>
      <Cell w={TC.price} align="right">
        <Text style={hs}>UNIT PRICE</Text>
        <Text style={hs}>{`(${currency})`}</Text>
      </Cell>
      <Cell w={TC.disc} align="center">
        <Text style={hs}>DISC. %</Text>
      </Cell>
      <Cell w={TC.amount} align="right" indent={INDENT}>
        <Text style={hs}>AMOUNT (VAT</Text>
        <Text style={hs}>{`EXCLUSIVE) (${currency})`}</Text>
      </Cell>
    </View>
  );
}

function rowFrame(i: number, lastOverall: boolean, height: number, clr: Palette): Style {
  return {
    flexDirection: 'row',
    height,
    backgroundColor: i % 2 === 1 ? clr.band : clr.white,
    borderBottomWidth: lastOverall ? 1.2 : 0.6,
    borderBottomColor: lastOverall ? clr.navy : clr.line,
  };
}

function ItemRow({
  i,
  m,
  lines,
  height,
  lastOverall,
  measure,
}: {
  i: number;
  m: DocModel;
  lines: string[];
  height: number;
  lastOverall: boolean;
  measure: Measure;
}) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  const r = m.rows[i];
  const fd = (k: string) => `lines.${i}.${k}`;
  const num = (text: string, w: number, bold = false, color = clr.ink) => {
    const fs = font(f(9), bold ? 700 : 400);
    const size = fitFontSize(text, w - PAD - (bold ? INDENT : PAD), fs, measure);
    return <Text style={asStyle({ ...fs, size }, color)}>{text}</Text>;
  };
  return (
    <View style={rowFrame(i, lastOverall, height, clr)}>
      <Cell w={TC.no} align="center">
        <Text style={asStyle(F_BODY, clr.light)}>{r.no}</Text>
      </Cell>
      <Cell w={TC.desc} indent={INDENT} field={fd('description')}>
        {lines.map((t, k) => (
          <View key={k} style={{ height: DESC_LINE_H, justifyContent: 'center' }}>
            <Text style={asStyle(F_BODY, clr.ink)}>{t}</Text>
          </View>
        ))}
      </Cell>
      <Cell w={TC.qty} align="center" field={fd('qty')}>
        {num(r.qty, TC.qty)}
      </Cell>
      <Cell w={TC.price} align="right" field={fd('unitPrice')}>
        {num(r.unitPrice, TC.price)}
      </Cell>
      <Cell w={TC.disc} align="center" field={fd('discountPct')}>
        {num(r.discount, TC.disc)}
      </Cell>
      <Cell w={TC.amount} align="right" indent={INDENT} field={fd('noVat')}>
        {num(r.amount, TC.amount, true, clr.navy)}
      </Cell>
    </View>
  );
}

function BlankRow({ i, lastOverall }: { i: number; lastOverall: boolean }) {
  const clr = useClr();
  const { View } = usePrimitives();
  return <View field="addLine" style={rowFrame(i, lastOverall, ROW_MIN, clr)} />;
}

function TotalsRow({
  label,
  value,
  kind = 'normal',
  measure,
  field,
}: {
  label: string;
  value: string;
  kind?: 'normal' | 'bold' | 'small';
  measure: Measure;
  field?: string;
}) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  const lf = kind === 'bold' ? font(f(9), 700) : kind === 'small' ? font(f(8), 400, true) : font(f(9));
  const vf = kind === 'bold' ? font(f(10), 700) : lf;
  const color = kind === 'bold' ? clr.navy : kind === 'small' ? clr.light : clr.grey;
  const vw = COLW.J - PAD - INDENT;
  return (
    <View field={field} style={{ flexDirection: 'row', height: h(18), borderBottomWidth: 0.6, borderBottomColor: clr.line }}>
      <Cell w={COLW.G + COLW.H + COLW.I} align="right">
        <Text style={asStyle(lf, color)}>{label}</Text>
      </Cell>
      <Cell w={COLW.J} align="right" indent={INDENT}>
        <Text style={asStyle({ ...vf, size: fitFontSize(value, vw, vf, measure) }, color)}>{value}</Text>
      </Cell>
    </View>
  );
}

function BottomBlock({ m, L, measure }: { m: DocModel; L: ClassicLayout; measure: Measure }) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  const t = m.totals;
  const vw = COLW.J - PAD - INDENT;
  const dueFont = font(f(13), 700);
  const balFont = font(f(12), 700);
  const due = formatMoney(t.totalVatInclusive, { dashForZero: false });
  const bal = formatMoney(t.balanceDue, { dashForZero: false });

  return (
    <View style={{ height: L.bottomH }}>
      <View style={{ height: h(14) }} />
      <View style={{ flexDirection: 'row' }}>
        {/* Left (B:E): payment details, amount in words, notes */}
        <View style={{ width: LEFT_W }}>
          <SectionHeading w={LEFT_W} text="PAYMENT DETAILS" hgt={h(18)} field="seller.bank" />
          {(m.bank.length ? m.bank : [{ text: ' ', field: 'seller.bank' }]).map((b, i) => (
            <View key={i} field={b.field} style={{ height: h(18), justifyContent: 'center', paddingLeft: PAD }}>
              <Text style={asStyle(F_LINE, clr.grey)}>{b.text}</Text>
            </View>
          ))}
          <View field="number" style={{ height: h(30), justifyContent: 'center', paddingLeft: PAD }}>
            <Text style={asStyle(F_LINE, clr.grey)}>{m.reference}</Text>
          </View>
          {L.wordsLines.map((t, i) => (
            <View key={i} style={{ height: 12, justifyContent: 'center', paddingLeft: PAD }}>
              <Text style={asStyle(F_WORDS, clr.navy)}>{t}</Text>
            </View>
          ))}
          <View style={{ height: 4 }} />
          <SectionHeading w={LEFT_W} text="NOTES & TERMS" hgt={h(24)} field="notes" />
          <View field="notes" style={{ minHeight: h(44), paddingTop: 3, paddingLeft: PAD }}>
            {L.notesLines.map((t, i) => (
              <View key={i} style={{ height: 9, justifyContent: 'center' }}>
                <Text style={asStyle(F_NOTES, clr.grey)}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ width: COLW.F }} />

        {/* Right (G:J): totals */}
        <View style={{ width: RIGHT_W }}>
          <TotalsRow label="Subtotal" value={formatMoney(t.subtotal)} measure={measure} />
          <TotalsRow label="Discount" value={formatMoney(-t.discount)} measure={measure} field="discount" />
          <TotalsRow label="Total VAT Exclusive" value={formatMoney(t.totalVatExclusive)} kind="bold" measure={measure} />
          <TotalsRow label={m.vatLabel} value={formatMoney(t.vat)} kind="bold" measure={measure} field="vatRate" />
          {m.notSubjectToVat && (
            <View field="noVat" style={{ height: h(16), justifyContent: 'center', alignItems: 'flex-end', paddingRight: INDENT }}>
              <Text style={asStyle(font(f(8), 400, true), clr.light)}>{m.notSubjectToVat}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', height: h(30), backgroundColor: clr.navy }}>
            <Cell w={COLW.G + COLW.H + COLW.I} align="right">
              <Text style={asStyle(font(f(10), 700), clr.white)}>{`TOTAL VAT INCLUSIVE (${m.currency})`}</Text>
            </Cell>
            <Cell w={COLW.J} align="right" indent={INDENT}>
              <Text style={asStyle({ ...dueFont, size: fitFontSize(due, vw, dueFont, measure) }, clr.white)}>{due}</Text>
            </Cell>
          </View>
          <TotalsRow label="Less: amount paid" value={formatMoney(t.amountPaid)} measure={measure} field="payments" />
          <View
            style={{
              flexDirection: 'row',
              height: h(24),
              backgroundColor: clr.balance,
              borderBottomWidth: 1.2,
              borderBottomColor: clr.gold,
            }}
          >
            <Cell w={COLW.G + COLW.H + COLW.I} align="right">
              <Text style={asStyle(font(f(10), 700), clr.navy)}>BALANCE DUE</Text>
            </Cell>
            <Cell w={COLW.J} align="right" indent={INDENT}>
              <Text style={asStyle({ ...balFont, size: fitFontSize(bal, vw, balFont, measure) }, clr.navy)}>{bal}</Text>
            </Cell>
          </View>
          {/* Row 44: signature space with a line underneath */}
          <View style={{ height: h(44), borderBottomWidth: 0.6, borderBottomColor: clr.light }} />
          <View style={{ height: h(16), justifyContent: 'center', alignItems: 'center' }}>
            <Text style={asStyle(font(f(8)), clr.light)}>{'Authorised signature & company stamp'}</Text>
          </View>
        </View>
      </View>
      <View style={{ height: h(18) }} />
      <View style={{ height: h(24), justifyContent: 'center', alignItems: 'center' }}>
        <Text style={asStyle(font(f(13), 400, true, FONT.georgia), clr.gold)}>Thank you for your business.</Text>
      </View>
    </View>
  );
}

function ContHeader({ m, page, pageCount }: { m: DocModel; page: PageSlice; pageCount: number }) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  return (
    <View style={{ height: CONT_H }}>
      <View style={{ height: h(14) }} />
      <View style={{ flexDirection: 'row', height: 26, alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...asStyle(font(f(9), 700), clr.navy), paddingLeft: PAD }}>{m.seller.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={asStyle(font(f(9), 700), clr.grey)}>{`Page ${page.index + 1} of ${pageCount}   `}</Text>
          <Text style={{ ...asStyle(font(f(14), 700, false, FONT.georgia), clr.navy), paddingRight: PAD }}>
            {`${m.title} ${m.number} (continued)`}
          </Text>
        </View>
      </View>
      <View style={{ height: h(4), backgroundColor: clr.gold }} />
      <View style={{ height: h(12) }} />
    </View>
  );
}

function Footer({ text, page, pageCount }: { text: string; page: PageSlice; pageCount: number }) {
  const clr = useClr();
  const { View, Text } = usePrimitives();
  const width = A4.width - 2 * M;
  return (
    <View style={{ position: 'absolute', left: M, bottom: M, width }}>
      <View style={{ height: h(22), backgroundColor: clr.navy, justifyContent: 'center', alignItems: 'center' }} field="seller">
        <Text style={asStyle(font(f(8)), clr.white)}>{text}</Text>
        {pageCount > 1 && (
          <View style={{ position: 'absolute', right: GUT, top: 0, width: 60, height: h(22), justifyContent: 'center', alignItems: 'flex-end' }}>
            <Text style={asStyle(font(f(8)), clr.white)}>{`${page.index + 1} / ${pageCount}`}</Text>
          </View>
        )}
      </View>
      <View style={{ height: h(4), backgroundColor: clr.gold }} />
    </View>
  );
}

/** Preview-only box shown where the logo goes until one is uploaded. */
export function LogoPlaceholderBox({ width, height }: { width: number; height: number }) {
  const { View, Text } = usePrimitives();
  return (
    <View
      field="logo"
      style={{
        width,
        height,
        backgroundColor: '#F3F5F9',
        borderTopWidth: 0.75,
        borderBottomWidth: 0.75,
        borderLeftWidth: 0.75,
        borderRightWidth: 0.75,
        borderTopColor: '#C3CAD6',
        borderBottomColor: '#C3CAD6',
        borderLeftColor: '#C3CAD6',
        borderRightColor: '#C3CAD6',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: FONT.arial, fontSize: 8, fontWeight: 700, color: '#9AA0A6' }}>YOUR LOGO</Text>
      <Text style={{ fontFamily: FONT.arial, fontSize: 6.5, color: '#9AA0A6', marginTop: 2 }}>Click to add in Settings</Text>
    </View>
  );
}

export function VoidMark() {
  const { View, Text } = usePrimitives();
  return (
    <View
      style={{
        position: 'absolute',
        top: A4.height / 2 - 70,
        left: 0,
        width: A4.width,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-30deg)',
        opacity: 0.14,
      }}
    >
      <Text style={{ fontFamily: FONT.arial, fontWeight: 700, fontSize: 120, color: '#B42318', letterSpacing: 8 }}>VOID</Text>
    </View>
  );
}
