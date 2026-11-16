import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Hash, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import type { AppSettings, NumberingLogEntry, NumberSequence } from '@/db/types';
import { db } from '@/db/db';
import { deleteSequence, newSequence, updateSettings } from '@/db/settingsRepo';
import { formatNext } from '@/lib/numbering';
import { SequenceEditor } from './SequenceEditor';

export function NumberingSettings({ settings }: { settings: AppSettings }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<NumberSequence | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Invoice numbering</CardTitle>
            <CardDescription className="mt-1">
              Numbers can be in any format. Every number is checked against all saved invoices, so a number can never be used twice.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setCreating(newSequence({ name: 'Credit notes', docType: 'credit_note', prefix: 'CN-' }))}
            disabled={!!creating}
          >
            <Plus /> Add sequence
          </Button>
        </CardHeader>
        <ul className="divide-y divide-line">
          {settings.sequences.map((seq) => (
            <li key={seq.id} className="px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy">
                  <Hash className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-sans text-[15px] font-semibold text-ink">{seq.name}</h3>
                    <Badge tone={seq.docType === 'credit_note' ? 'gold' : 'navy'}>
                      {seq.docType === 'credit_note' ? 'Credit notes' : 'Invoices'}
                    </Badge>
                    {settings.defaultSequenceId === seq.id && <Badge tone="success">Default</Badge>}
                    {seq.mode === 'manual' && <Badge>Manual</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    Next: <span className="font-medium text-navy">{formatNext(seq)}</span>
                  </p>
                </div>
                {editing !== seq.id && (
                  <div className="flex gap-1">
                    {settings.defaultSequenceId !== seq.id && seq.docType === 'invoice' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void updateSettings((s) => (s.defaultSequenceId = seq.id))}
                      >
                        Make default
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditing(seq.id)}>
                      <Pencil /> Edit
                    </Button>
                    {settings.defaultSequenceId !== seq.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${seq.name}`}
                        onClick={() =>
                          deleteSequence(seq.id).then(
                            () => toast.success('Sequence deleted.'),
                            (e: Error) => toast.error(e.message),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {editing === seq.id && (
                <div className="mt-5 border-t border-line pt-5">
                  <SequenceEditor sequence={seq} onDone={() => setEditing(null)} />
                </div>
              )}
            </li>
          ))}
          {creating && (
            <li className="bg-band/40 px-6 py-5">
              <h3 className="mb-4 font-sans text-[15px] font-semibold text-ink">New sequence</h3>
              <SequenceEditor sequence={creating} isNew onDone={() => setCreating(null)} />
            </li>
          )}
        </ul>
      </Card>

      <NumberingLog sequences={settings.sequences} />
    </div>
  );
}

const LOG_LABEL: Record<NumberingLogEntry['type'], { label: string; tone: 'neutral' | 'warning' | 'navy' | 'gold' }> = {
  skip: { label: 'Skipped', tone: 'warning' },
  manual: { label: 'Manual number', tone: 'gold' },
  jump: { label: 'Counter changed', tone: 'navy' },
  release: { label: 'Renumbered', tone: 'neutral' },
  deleted_draft: { label: 'Deleted draft', tone: 'warning' },
  sequence_created: { label: 'Started', tone: 'navy' },
  import: { label: 'Import', tone: 'neutral' },
};

function NumberingLog({ sequences }: { sequences: NumberSequence[] }) {
  const entries = useLiveQuery(() => db.numberingLog.orderBy('at').reverse().limit(300).toArray(), []);
  const seqName = (id: string) => sequences.find((s) => s.id === id)?.name ?? '-';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Numbering log</CardTitle>
        <CardDescription>Every skipped number, manual number and counter change, with the reason given.</CardDescription>
      </CardHeader>
      {entries && entries.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-6 py-2.5 font-medium">When</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Sequence</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Event</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Details</th>
                <th scope="col" className="px-6 py-2.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries?.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-6 py-3 text-muted tabular">
                    {new Date(e.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{seqName(e.sequenceId)}</td>
                  <td className="px-3 py-3">
                    <Badge tone={LOG_LABEL[e.type].tone}>{LOG_LABEL[e.type].label}</Badge>
                  </td>
                  <td className="px-3 py-3 text-ink">{e.detail}</td>
                  <td className="px-6 py-3 text-muted">{e.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
