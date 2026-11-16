import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import type { AppSettings } from '@/db/types';
import { updateSettings } from '@/db/settingsRepo';
import { contrast, DEFAULT_THEME, isHexColor, paletteFor, type DocTheme } from '@/templates/theme';

function ColourField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-hex`} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1"
        />
        <Input
          id={`${id}-hex`}
          value={text}
          maxLength={7}
          spellCheck={false}
          className="w-28 font-mono uppercase"
          aria-invalid={!isHexColor(text)}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (isHexColor(v)) onChange(v.toUpperCase());
          }}
          onBlur={() => setText(value)}
        />
      </div>
      <p className="text-[12.5px] text-muted">{hint}</p>
    </div>
  );
}

/** Settings ▸ Company profile ▸ Theme colours: used by every invoice template. */
export function ThemeSettings({ settings }: { settings: AppSettings }) {
  const saved: DocTheme = { ...DEFAULT_THEME, ...(settings.company.theme ?? {}) };
  const [theme, setTheme] = useState<DocTheme>(saved);
  useEffect(() => setTheme({ ...DEFAULT_THEME, ...(settings.company.theme ?? {}) }), [settings.company.theme]);

  const dirty = theme.primary !== saved.primary || theme.accent !== saved.accent;
  const isDefault = theme.primary === DEFAULT_THEME.primary && theme.accent === DEFAULT_THEME.accent;
  const pal = paletteFor(theme);
  const whiteOnPrimary = contrast('#FFFFFF', theme.primary);

  const save = async (t: DocTheme) => {
    await updateSettings((s) => {
      s.company.theme = { primary: t.primary, accent: t.accent };
    });
    toast.success('Theme colours saved. Draft invoices use them straight away; issued invoices keep their colours.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme colours</CardTitle>
        <CardDescription>Used by all invoice templates. The default is navy and gold.</CardDescription>
      </CardHeader>
      <CardBody className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <ColourField
            id="theme-primary"
            label="Primary colour"
            hint="Top and footer bars, table header, title and totals bar."
            value={theme.primary}
            onChange={(primary) => setTheme((t) => ({ ...t, primary }))}
          />
          <ColourField
            id="theme-accent"
            label="Accent colour"
            hint="Dividers, section headings and the balance-due row."
            value={theme.accent}
            onChange={(accent) => setTheme((t) => ({ ...t, accent }))}
          />
        </div>

        {/* Live mini preview */}
        <div className="overflow-hidden rounded-lg border border-line bg-white" aria-label="Theme preview">
          <div className="h-1.5" style={{ background: pal.navy }} />
          <div className="flex items-end justify-between px-4 pt-3">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: pal.goldText }}>
              Bill to
            </span>
            <span className="font-serif text-xl font-bold" style={{ color: pal.navy }}>
              VAT INVOICE
            </span>
          </div>
          <div className="mx-4 mt-2 h-1" style={{ background: pal.gold }} />
          <div className="mx-4 mt-3 flex h-7 items-center px-2 text-[11px] font-bold text-white" style={{ background: pal.navy }}>
            DESCRIPTION
          </div>
          <div className="mx-4 h-6" style={{ background: pal.band }} />
          <div className="mx-4 mb-4 mt-2 ml-auto flex w-1/2 justify-between px-2 py-1.5 text-xs font-bold" style={{ background: pal.balance, color: pal.navy, borderBottom: `2px solid ${pal.gold}` }}>
            <span>BALANCE DUE</span>
            <span>30,272.00</span>
          </div>
        </div>

        {whiteOnPrimary < 4.5 && (
          <Callout tone="warning" icon={<AlertTriangle />}>
            White text on this primary colour is hard to read (contrast {whiteOnPrimary.toFixed(1)}:1; at least 4.5:1 is
            recommended). Choose a darker primary colour.
          </Callout>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            disabled={isDefault}
            onClick={() => {
              setTheme(DEFAULT_THEME);
              void save(DEFAULT_THEME);
            }}
          >
            <RotateCcw /> Reset to navy &amp; gold
          </Button>
          <Button disabled={!dirty} onClick={() => void save(theme)}>
            Save colours
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
