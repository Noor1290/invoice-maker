import { useMemo } from 'react';
import type { DocModel } from './model';
import { A4, usePrimitives, type Style } from './primitives';
import { fitFontSize, wrapText, type FontSpec, type Measure } from './measure';
import { paginate, type PageSlice } from './paginate';
import { FONT } from './fonts';
import { formatMoney } from '@/lib/money';
import { LogoPlaceholderBox, VoidMark } from './classic';
import { useClr } from './theme';

/**
 * Configurable layout shared by the "Minimal" and "Compact" built-in templates.
 */
interface Theme {
  margin: number;
  body: string;
  title: { family: string; weight: 400 | 600 | 700; size: number; italic?: boolean };
  thanks: { family: string; size: number };
  size: { body: number; small: number; head: number; label: number; name: number; total: number };
  rowMin: number;
  descLineH: number;
  partyLineH: number;
  totalsRowH: number;
  logoH: number;
  topBar: number;
  headerFill: boolean;
  banded: boolean;
  dueBar: boolean;
  footerBar: boolean;
  gap: number;
}

// #, Description, Qty, Unit Price, Disc. %, Amount (VAT exclusive)
const COL_WEIGHTS = [16, 220, 34, 64, 40, 80];

const THEMES: Record<'minimal' | 'compact', Theme> = {
  minimal: {
    margin: 48,
    body: FONT.inter,
    title: { family: FONT.playfair, weight: 600, size: 22 },
    thanks: { family: FONT.playfair, size: 10.5 },
    size: { body: 8.5, small: 7, head: 6.8, label: 6.8, name: 10, total: 11.5 },
    rowMin: 20,
    descLineH: 11,
    partyLineH: 12,
    totalsRowH: 16,
    logoH: 40,
    topBar: 0,
    headerFill: false,
    banded: false,
    dueBar: false,
    footerBar: false,
    gap: 20,
  },
  compact: {
    margin: 24,
    body: FONT.arial,
    title: { family: FONT.georgia, weight: 700, size: 16 },
    thanks: { family: FONT.georgia, size: 9.5 },
    size: { body: 7.5, small: 6.5, head: 6.5, label: 7, name: 8.5, total: 10 },
    rowMin: 13,
    descLineH: 8.8,
    partyLineH: 10,
    totalsRowH: 12.5,
    logoH: 46,
    topBar: 4,
    headerFill: true,
    banded: true,
    dueBar: true,
    footerBar: true,
    gap: 10,
  },
};

const PAD = 3;

function fnt(t: Theme, size: number, weight: 400 | 600 | 700 = 400, italic = false, family = t.body): FontSpec {
  return { family, size, weight, italic };
}
function st(fs: FontSpec, color: string): Style {
  return { fontFamily: fs.family, fontSize: fs.size, fontWeight: fs.weight, fontStyle: fs.italic ? 'italic' : 'normal', color };
}

interface StdLayout {
  pages: PageSlice[];
  cols: number[];
  width: number;
  rowLines: string[][];
  rowHeights: number[];
  from: string[];
  to: string[];
  notes: string[];
  words: string[];
  partiesH: number;
  bottomH: number;
  headerH: number;
  footerH: number;
}

function layoutStd(t: Theme, m: DocModel, measure: Measure): StdLayout {
  const width = A4.width - 2 * t.margin;
  const sum = COL_WEIGHTS.reduce((a, b) => a + b, 0);
  const cols = COL_WEIGHTS.map((w) => (w / sum) * width);
  const body = fnt(t, t.size.body);
  const half = width / 2 - t.gap / 2;

  const rowLines = m.rows.map((r) => wrapText(r.description, cols[1] - 2 * PAD, body, measure));
  const rowHeights = rowLines.map((ls) => Math.max(t.rowMin, ls.length * t.descLineH + 6));
  const from = m.seller.lines.flatMap((l) => wrapText(l.text, half, body, measure));
  const to = m.client.lines.flatMap((l) => wrapText(l.text, half, body, measure));
  const notes = m.notes.trim() ? wrapText(m.notes.trim(), half, fnt(t, t.size.small, 400, true), measure) : [];
  const words = m.amountInWords ? wrapText(m.amountInWords, half, fnt(t, t.size.small + 0.5, 400, true), measure) : [];

  const partiesH = t.size.label * 2 + t.size.name * 1.6 + Math.max(from.length, to.length, 1) * t.partyLineH + t.gap;
  const leftH =
    t.size.label * 2.2 + Math.max(1, m.bank.length + 1) * t.partyLineH + words.length * (t.size.small + 4) + 6 + t.size.label * 2.2 + notes.length * (t.size.small + 2.5);
  const rightH = (m.notSubjectToVat ? 7 : 6) * t.totalsRowH + (t.dueBar ? 6 : 4) + 36 + 12;
  const bottomH = t.gap * 0.8 + Math.max(leftH, rightH) + 26;
  const headerH = t.topBar + Math.max(t.logoH, t.title.size * 1.4 + 14) + 12 + 30 + t.gap;
  const footerH = t.footerBar ? 16 : 20;

  const usable = A4.height - 2 * t.margin * (t.margin > 30 ? 0.75 : 1) - footerH;
  const pages = paginate({
    pageHeight: usable,
    firstTop: headerH + partiesH,
    contTop: t.topBar + 30,
    tableHeader: t.headerFill ? 20 : 18,
    rows: rowHeights,
    bottom: bottomH,
  });
  return { pages, cols, width, rowLines, rowHeights, from, to, notes, words, partiesH, bottomH, headerH, footerH };
}

export function makeStandardDoc(kind: 'minimal' | 'compact') {
  const t = THEMES[kind];
  const top = t.margin * (t.margin > 30 ? 0.75 : 1);

  function StdDoc({ model, measure }: { model: DocModel; measure: Measure }) {
    const clr = useClr();
    const L = useMemo(() => layoutStd(t, model, measure), [model, measure]);
    const { Page, View } = usePrimitives();
    return (
      <>
        {L.pages.map((pg) => (
          <Page key={pg.index} pageIndex={pg.index}>
            <View style={{ position: 'absolute', top, left: t.margin, width: L.width }}>
              {t.topBar > 0 && <View style={{ height: t.topBar, backgroundColor: clr.navy, marginBottom: 6 }} />}
              {pg.first ? <Header m={model} L={L} /> : <Cont m={model} pg={pg} n={L.pages.length} />}
              {(pg.end > pg.start || (pg.first && !L.rowHeights.length)) && <TableHead m={model} L={L} />}
              {Array.from({ length: pg.end - pg.start }, (_, k) => (
                <Row key={k} i={pg.start + k} m={model} L={L} measure={measure} last={pg.start + k === L.rowHeights.length - 1} />
              ))}
              {pg.last && <Bottom m={model} L={L} measure={measure} />}
            </View>
            <Footer m={model} L={L} pg={pg} n={L.pages.length} />
            {model.isVoid && <VoidMark />}
          </Page>
        ))}
      </>
    );
  }

  function Header({ m, L }: { m: DocModel; L: StdLayout }) {
    const clr = useClr();
    const { View, Text, Image } = usePrimitives();
    const lab = st(fnt(t, t.size.label, 600), clr.grey);
    const val = st(fnt(t, t.size.body + 0.5, 600), clr.ink);
    const meta: [string, string, string][] = [
      ['Invoice date', m.issueDate, 'issueDate'],
      ['Due date', m.dueDate, 'dueDate'],
      ['Terms', m.terms, 'termsDays'],
      ['Currency', m.currency, 'currency'],
    ];
    const half = L.width / 2 - t.gap / 2;
    return (
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', height: Math.max(t.logoH, t.title.size * 1.4 + 14) }}>
          <View field="seller" style={{ height: t.logoH, width: t.logoH * 3, alignItems: 'flex-start' }}>
            {m.logoUrl ? (
              <Image src={m.logoUrl} style={{ height: t.logoH, width: t.logoH * 1.5, objectFit: 'contain' }} />
            ) : (
              m.logoPlaceholder && <LogoPlaceholderBox width={t.logoH * 1.5} height={t.logoH} />
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={st(fnt(t, t.title.size, t.title.weight, false, t.title.family), clr.navy)}>
              {kind === 'minimal' ? (m.isCreditNote ? 'Credit Note' : 'VAT Invoice') : m.title}
            </Text>
            <View field="number" style={{ marginTop: 4 }}>
              <Text style={st(fnt(t, t.size.body + 1, 600), kind === 'minimal' ? clr.grey : clr.navy)}>{`No. ${m.number}`}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 12 }} />
        <View
          style={{
            flexDirection: 'row',
            height: 30,
            alignItems: 'center',
            borderTopWidth: t.headerFill ? 0 : 0.5,
            borderTopColor: clr.line,
            borderBottomWidth: t.headerFill ? 1.5 : 0.5,
            borderBottomColor: t.headerFill ? clr.gold : clr.line,
          }}
        >
          {meta.map(([l, v, f]) => (
            <View key={l} field={f} style={{ width: L.width / 4 }}>
              <Text style={{ ...lab, letterSpacing: 0.6 }}>{l.toUpperCase()}</Text>
              <Text style={{ ...val, marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: t.gap }} />
        <View style={{ flexDirection: 'row', height: L.partiesH }}>
          {(
            [
              ['FROM', m.seller.name, L.from, 'seller'],
              [m.isCreditNote ? 'CREDIT TO' : 'BILL TO', m.client.name, L.to, 'client.name'],
            ] as const
          ).map(([head, name, lines, field], k) => (
            <View key={head} field={field} style={{ width: half, marginLeft: k ? t.gap : 0 }}>
              <Text style={{ ...st(fnt(t, t.size.label, 700), kind === 'minimal' ? clr.grey : clr.goldText), letterSpacing: 0.8 }}>{head}</Text>
              <View style={{ height: t.size.label * 0.8 }} />
              <Text style={st(fnt(t, t.size.name, 700), clr.navy)}>{name || ' '}</Text>
              <View style={{ height: 2 }} />
              {lines.map((x, i) => (
                <View key={i} style={{ height: t.partyLineH, justifyContent: 'center' }}>
                  <Text style={st(fnt(t, t.size.body), clr.grey)}>{x}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  function Cont({ m, pg, n }: { m: DocModel; pg: PageSlice; n: number }) {
    const clr = useClr();
    const { View, Text } = usePrimitives();
    return (
      <View style={{ height: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={st(fnt(t, t.size.body, 700), clr.navy)}>{m.seller.name}</Text>
        <Text style={st(fnt(t, t.size.body, 600), clr.grey)}>{`${m.title} ${m.number} · page ${pg.index + 1} of ${n} (continued)`}</Text>
      </View>
    );
  }

  const ALIGN: ('left' | 'center' | 'right')[] = ['center', 'left', 'center', 'right', 'center', 'right'];

  function cellStyle(w: number, a: 'left' | 'center' | 'right'): Style {
    return {
      width: w,
      justifyContent: 'center',
      alignItems: a === 'left' ? 'flex-start' : a === 'right' ? 'flex-end' : 'center',
      paddingLeft: PAD,
      paddingRight: PAD,
    };
  }

  function TableHead({ m, L }: { m: DocModel; L: StdLayout }) {
    const clr = useClr();
    const { View, Text } = usePrimitives();
    const c = m.currency;
    const labels: [string, string?][] = [
      ['#'],
      ['DESCRIPTION'],
      ['QTY'],
      ['UNIT PRICE', `(${c})`],
      ['DISC. %'],
      ['AMOUNT (VAT', `EXCLUSIVE) (${c})`],
    ];
    const s = { ...st(fnt(t, t.size.head, 700), t.headerFill ? '#FFFFFF' : clr.grey), letterSpacing: t.headerFill ? 0 : 0.4 };
    return (
      <View
        style={{
          flexDirection: 'row',
          height: t.headerFill ? 20 : 18,
          backgroundColor: t.headerFill ? clr.navy : undefined,
          borderBottomWidth: t.headerFill ? 0 : 0.8,
          borderBottomColor: clr.navy,
        }}
      >
        {labels.map(([a, b], i) => (
          <View key={i} style={cellStyle(L.cols[i], ALIGN[i])}>
            <Text style={s}>{a}</Text>
            {b && <Text style={s}>{b}</Text>}
          </View>
        ))}
      </View>
    );
  }

  function Row({ i, m, L, measure, last }: { i: number; m: DocModel; L: StdLayout; measure: Measure; last: boolean }) {
    const clr = useClr();
    const { View, Text } = usePrimitives();
    const r = m.rows[i];
    const vals = [r.no, '', r.qty, r.unitPrice, r.discount, r.amount];
    const fields = ['', 'description', 'qty', 'unitPrice', 'discountPct', 'noVat'];
    const body = fnt(t, t.size.body);
    return (
      <View
        style={{
          flexDirection: 'row',
          height: L.rowHeights[i],
          backgroundColor: t.banded && i % 2 === 1 ? clr.band : undefined,
          borderBottomWidth: last && t.headerFill ? 1 : 0.5,
          borderBottomColor: last && t.headerFill ? clr.navy : clr.line,
        }}
      >
        {vals.map((v, k) => (
          <View key={k} field={fields[k] ? `lines.${i}.${fields[k]}` : undefined} style={cellStyle(L.cols[k], ALIGN[k])}>
            {k === 1 ? (
              L.rowLines[i].map((x, j) => (
                <View key={j} style={{ height: t.descLineH, justifyContent: 'center' }}>
                  <Text style={st(body, clr.ink)}>{x}</Text>
                </View>
              ))
            ) : (
              <Text
                style={st(
                  { ...body, weight: k === 5 ? 700 : 400, size: fitFontSize(v, L.cols[k] - 2 * PAD, { ...body, weight: k === 5 ? 700 : 400 }, measure) },
                  k === 0 ? clr.light : k === 5 ? clr.navy : clr.ink,
                )}
              >
                {v}
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  function Bottom({ m, L, measure }: { m: DocModel; L: StdLayout; measure: Measure }) {
    const clr = useClr();
    const { View, Text } = usePrimitives();
    const tt = m.totals;
    const half = L.width / 2 - t.gap / 2;
    const rightW = L.width * 0.42;
    const valW = L.cols[5];
    const labW = rightW - valW;
    const lab = st(fnt(t, t.size.label, 700), kind === 'minimal' ? clr.grey : clr.goldText);
    const body = fnt(t, t.size.body);

    const TRow = ({ label, value, kind: k = 'n', field }: { label: string; value: string; kind?: 'n' | 'b' | 's'; field?: string }) => {
      const fs = k === 'b' ? fnt(t, t.size.body, 700) : k === 's' ? fnt(t, t.size.small, 400, true) : body;
      const color = k === 'b' ? clr.navy : k === 's' ? clr.light : clr.grey;
      return (
        <View field={field} style={{ flexDirection: 'row', height: t.totalsRowH, borderBottomWidth: 0.5, borderBottomColor: clr.line }}>
          <View style={cellStyle(labW, 'right')}>
            <Text style={st(fs, color)}>{label}</Text>
          </View>
          <View style={cellStyle(valW, 'right')}>
            <Text style={st({ ...fs, size: fitFontSize(value, valW - 2 * PAD, fs, measure) }, color)}>{value}</Text>
          </View>
        </View>
      );
    };
    const dueFs = fnt(t, t.size.total, 700);
    const due = formatMoney(tt.totalVatInclusive, { dashForZero: false });
    const bal = formatMoney(tt.balanceDue, { dashForZero: false });

    return (
      <View style={{ height: L.bottomH }}>
        <View style={{ height: t.gap * 0.8 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: half }}>
            <View field="seller.bank">
              <Text style={{ ...lab, letterSpacing: 0.8 }}>PAYMENT DETAILS</Text>
            </View>
            <View style={{ height: t.size.label * 1.2 }} />
            {m.bank.map((b, i) => (
              <View key={i} field="seller.bank" style={{ height: t.partyLineH, justifyContent: 'center' }}>
                <Text style={st(body, clr.grey)}>{b.text}</Text>
              </View>
            ))}
            <View field="number" style={{ height: t.partyLineH, justifyContent: 'center' }}>
              <Text style={st(fnt(t, t.size.body, 600), clr.ink)}>{m.reference}</Text>
            </View>
            <View style={{ height: 4 }} />
            {L.words.map((w, i) => (
              <View key={i} style={{ height: t.size.small + 4, justifyContent: 'center' }}>
                <Text style={st(fnt(t, t.size.small + 0.5, 400, true), clr.navy)}>{w}</Text>
              </View>
            ))}
            <View style={{ height: 6 }} />
            <View field="notes">
              <Text style={{ ...lab, letterSpacing: 0.8 }}>{'NOTES & TERMS'}</Text>
            </View>
            <View style={{ height: t.size.label * 1.2 }} />
            <View field="notes">
              {L.notes.map((x, i) => (
                <View key={i} style={{ height: t.size.small + 2.5, justifyContent: 'center' }}>
                  <Text style={st(fnt(t, t.size.small, 400, true), clr.grey)}>{x}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ width: rightW }}>
            <TRow label="Subtotal" value={formatMoney(tt.subtotal)} />
            <TRow label="Discount" value={formatMoney(-tt.discount)} />
            <TRow label="Total VAT Exclusive" value={formatMoney(tt.totalVatExclusive)} kind="b" />
            <TRow label={m.vatLabel} value={formatMoney(tt.vat)} kind="b" field="vatRate" />
            {m.notSubjectToVat && (
              <View field="noVat" style={{ height: t.totalsRowH, justifyContent: 'center', alignItems: 'flex-end', paddingRight: PAD }}>
                <Text style={st(fnt(t, t.size.small, 400, true), clr.light)}>{m.notSubjectToVat}</Text>
              </View>
            )}
            <View
              style={{
                flexDirection: 'row',
                height: t.totalsRowH + (t.dueBar ? 6 : 4),
                backgroundColor: t.dueBar ? clr.navy : undefined,
                borderTopWidth: t.dueBar ? 0 : 1,
                borderTopColor: clr.navy,
              }}
            >
              <View style={cellStyle(labW, 'right')}>
                <Text style={st(fnt(t, t.size.body + 1, 700), t.dueBar ? '#FFFFFF' : clr.navy)}>{`TOTAL VAT INCLUSIVE (${m.currency})`}</Text>
              </View>
              <View style={cellStyle(valW, 'right')}>
                <Text style={st({ ...dueFs, size: fitFontSize(due, valW - 2 * PAD, dueFs, measure) }, t.dueBar ? '#FFFFFF' : clr.navy)}>{due}</Text>
              </View>
            </View>
            <TRow label="Less: amount paid" value={formatMoney(tt.amountPaid)} field="payments" />
            <View
              style={{
                flexDirection: 'row',
                height: t.totalsRowH + 2,
                backgroundColor: t.dueBar ? clr.balance : undefined,
                borderBottomWidth: 1.2,
                borderBottomColor: clr.gold,
              }}
            >
              <View style={cellStyle(labW, 'right')}>
                <Text style={st(fnt(t, t.size.body, 700), clr.navy)}>BALANCE DUE</Text>
              </View>
              <View style={cellStyle(valW, 'right')}>
                <Text style={st({ ...fnt(t, t.size.body + 1, 700), size: fitFontSize(bal, valW - 2 * PAD, fnt(t, t.size.body + 1, 700), measure) }, clr.navy)}>{bal}</Text>
              </View>
            </View>
            <View style={{ height: 36, borderBottomWidth: 0.5, borderBottomColor: clr.light }} />
            <View style={{ height: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={st(fnt(t, t.size.small), clr.light)}>{'Authorised signature & company stamp'}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 26, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Text style={st(fnt(t, t.thanks.size, 400, true, t.thanks.family), clr.gold)}>Thank you for your business.</Text>
        </View>
      </View>
    );
  }

  function Footer({ m, L, pg, n }: { m: DocModel; L: StdLayout; pg: PageSlice; n: number }) {
    const clr = useClr();
    const { View, Text } = usePrimitives();
    const color = t.footerBar ? '#FFFFFF' : clr.light;
    return (
      <View
        field="seller"
        style={{
          position: 'absolute',
          left: t.margin,
          bottom: t.footerBar ? t.margin : t.margin * 0.6,
          width: L.width,
          height: L.footerH,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.footerBar ? clr.navy : undefined,
          borderTopWidth: t.footerBar ? 0 : 0.5,
          borderTopColor: clr.line,
          borderBottomWidth: t.footerBar ? 2 : 0,
          borderBottomColor: clr.gold,
        }}
      >
        <Text style={st(fnt(t, t.size.small), color)}>{m.footer}</Text>
        {n > 1 && (
          <View style={{ position: 'absolute', right: 6, top: 0, width: 60, height: L.footerH, justifyContent: 'center', alignItems: 'flex-end' }}>
            <Text style={st(fnt(t, t.size.small), color)}>{`${pg.index + 1} / ${n}`}</Text>
          </View>
        )}
      </View>
    );
  }

  return StdDoc;
}

export const MinimalDoc = makeStandardDoc('minimal');
export const CompactDoc = makeStandardDoc('compact');
