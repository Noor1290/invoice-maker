import * as React from 'react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** Extra content (e.g. a reason field). */
  body?: React.ReactNode;
}

/**
 * Promise-based confirm dialog:
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: 'Delete?' })) …
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(false)}>
      {state && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">{state.title}</DialogTitle>
            {state.description && <DialogDescription asChild><div>{state.description}</div></DialogDescription>}
          </DialogHeader>
          {state.body}
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return { confirm, dialog };
}
