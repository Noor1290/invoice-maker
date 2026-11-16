import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Loader2, Settings2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';
import type { NumberSequence } from '@/db/types';
import { checkNumber, describeInvoiceRef, nextAvailableNumber, previewNumberEffect, type NumberCheck } from '@/db/invoiceRepo';
import { SequenceEditor } from '@/features/settings/SequenceEditor';
import type { SkipRange } from '@/lib/numbering';
import { cn } from '@/lib/utils';

export interface NumberStatus {
  /** Saving must not happen with this number (taken / retired / empty when required). */
  blocked: boolean;
  message?: string;
  skipReason?: string;
}

interface Props {
  invoiceId: string;
  value: string; // committed value (form state)
  onCommit: (v: string) => void;
  onLiveChange: (v: string) => void;
  onStatus: (s: NumberStatus) => void;
  sequence: NumberSequence | undefined;
  issueDate: string;
  locked: boolean;
  error?: string;
}

/**
 * Invoice No. with a live duplicate check against every saved invoice
 * (drafts, voided and deleted-draft numbers included). The value is committed
 * to the form on blur / Enter, so half-typed numbers never reach storage.
 */
export function NumberField({ invoiceId, value, onCommit, onLiveChange, onStatus, sequence, issueDate, locked, error }: Props) {
  const [text, setText] = useState(value);
  const [check, setCheck] = useState<NumberCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [skip, setSkip] = useState<SkipRange | null>(null);
  const [outside, setOutside] = useState(false);
  const [reason, setReason] = useState('');
  const [nextFree, setNextFree] = useState<string | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  // Live check (debounced)
  useEffect(() => {
    if (locked) return;
    let alive = true;
    setChecking(true);
    const t = setTimeout(async () => {
      const c = await checkNumber(text, invoiceId);
      const eff = sequence && text.trim() ? previewNumberEffect(sequence, text, issueDate) : null;
      const free = sequence ? (await nextAvailableNumber(sequence, issueDate, invoiceId)).number : null;
      if (!alive) return;
      setCheck(c);
      setSkip(eff?.skip ?? null);
      setOutside(!!eff && !eff.inSequence);
      setNextFree(free);
      setChecking(false);
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text, invoiceId, sequence, issueDate, locked]);

  const blocked = check?.state === 'taken' || check?.state === 'retired';
  useEffect(() => {
    onStatus({
      blocked,
      message: blocked
        ? check?.state === 'taken'
          ? `${check.conflict!.number} is already used on ${describeInvoiceRef(check.conflict!)}.`
          : `${check?.retired?.number} belonged to a deleted draft and is retired.`
        : undefined,
      skipReason: skip ? reason : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, check, skip, reason]);

  const commit = (v: string) => {
    if (v !== value) onCommit(v);
  };

  const useNext = () => {
    if (!nextFree) return;
    setText(nextFree);
    onLiveChange(nextFree);
    onCommit(nextFree);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="f-number">Invoice No.</Label>
        {!locked && sequence && (
          <Popover open={popOpen} onOpenChange={setPopOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-navy-50"
              >
                <Settings2 className="size-3.5" /> Numbering
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[80vh] w-[min(92vw,30rem)] overflow-y-auto">
              <p className="mb-3 font-serif text-lg text-navy">{sequence.name}</p>
              <SequenceEditor sequence={sequence} compact onDone={() => setPopOpen(false)} />
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="relative">
        <Input
          id="f-number"
          data-field="number"
          value={text}
          readOnly={locked}
          spellCheck={false}
          autoComplete="off"
          placeholder={sequence?.mode === 'manual' ? `e.g. ${nextFree ?? ''}` : ''}
          aria-invalid={blocked || !!error}
          aria-describedby="f-number-status"
          className={cn('pr-9 font-semibold tracking-wide text-navy', locked && 'bg-band')}
          onChange={(e) => {
            setText(e.target.value);
            onLiveChange(e.target.value);
          }}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit(text.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text.trim());
            }
          }}
        />
        {!locked && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
            {checking ? (
              <Loader2 className="size-4 animate-spin text-muted" />
            ) : blocked ? (
              <XCircle className="size-4 text-danger" />
            ) : check?.state === 'free' ? (
              <Check className="size-4 text-success" />
            ) : null}
          </span>
        )}
      </div>

      <div id="f-number-status" aria-live="polite" className="flex flex-col gap-1.5 text-[12.5px]">
        {!locked && check?.state === 'taken' && check.conflict && (
          <p role="alert" className="text-danger">
            <strong>{check.conflict.number}</strong> is already used on {describeInvoiceRef(check.conflict)} (
            <Link to={`/invoices/${check.conflict.id}`} className="underline underline-offset-2">
              open it
            </Link>
            ).
          </p>
        )}
        {!locked && check?.state === 'retired' && (
          <p role="alert" className="text-danger">
            <strong>{check.retired?.number}</strong> belonged to a deleted draft and is retired. Numbers are never reused.
          </p>
        )}
        {!locked && (blocked || (!text.trim() && nextFree)) && nextFree && (
          <Button variant="outline" size="sm" className="self-start" onClick={useNext}>
            Use next available: <span className="font-semibold text-navy">{nextFree}</span>
          </Button>
        )}
        {!locked && check?.state === 'free' && !skip && !outside && !check.nearMatches.length && (
          <p className="text-success">Available</p>
        )}
        {!locked && check && check.nearMatches.length > 0 && (
          <p className="flex gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Similar to <strong>{check.nearMatches[0].number}</strong> on {describeInvoiceRef(check.nearMatches[0])}. Make sure
              this isn't a duplicate.
            </span>
          </p>
        )}
        {!locked && !blocked && outside && sequence && (
          <p className="text-muted">
            One-off number outside the “{sequence.name}” format. The automatic counter won't change.
          </p>
        )}
        {!locked && !blocked && skip && (
          <div className="rounded-md border border-warning/25 bg-warning-50 p-2.5 text-[#7a2e0e]">
            <p className="flex gap-1.5 font-medium">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {skip.label}.
            </p>
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-xs">Reason (optional, saved in the numbering log)</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 bg-white text-[13px]" placeholder="e.g. Reserved for a contract" />
            </label>
          </div>
        )}
        {error && !blocked && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
