import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, CloudAlert, CloudUpload, HardDrive, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/db/db';
import { updateSettings } from '@/db/settingsRepo';
import { createBackupJson, backupFileName, markBackedUp } from '@/db/backup';
import { downloadBlob } from '@/lib/filename';
import { cn } from '@/lib/utils';
import { reconnectFolder, useFolderStatus } from '@/sync/folderSyncBrowser';
import { formatDateTime } from '@/features/settings/BackupSettings';

const DAY = 86_400_000;

/** Small status icon in the header: green = up to date, amber = waiting, red = needs reconnecting. */
export function FolderStatusIcon() {
  const s = useFolderStatus();
  if (s.state === 'off') return null;
  const meta =
    s.state === 'ok'
      ? { Icon: CheckCircle2, cls: 'text-success', label: `Folder backup up to date (last saved ${formatDateTime(s.lastSavedAt)})` }
      : s.state === 'pending' || s.state === 'saving'
        ? { Icon: s.state === 'saving' ? Loader2 : CloudUpload, cls: 'text-warning', label: 'Saving to your backup folder shortly' }
        : { Icon: CloudAlert, cls: 'text-danger', label: s.message ?? 'Backup folder needs attention' };
  const { Icon } = meta;
  return (
    <Link
      to="/settings/backup"
      className={cn('inline-flex size-9 items-center justify-center rounded-md hover:bg-band', meta.cls)}
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon className={cn('size-5', s.state === 'saving' && 'animate-spin')} />
    </Link>
  );
}

function Banner({
  tone,
  icon,
  children,
  onDismiss,
}: {
  tone: 'info' | 'warning' | 'danger';
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'no-print border-b px-4 py-2.5 text-sm sm:px-6',
        tone === 'info' && 'border-navy/15 bg-navy-50 text-navy',
        tone === 'warning' && 'border-warning/25 bg-warning-50 text-[#7a2e0e]',
        tone === 'danger' && 'border-danger/25 bg-danger-50 text-danger',
      )}
    >
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <span className="shrink-0 [&_svg]:size-4">{icon}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function sessionFlag(key: string): [boolean, () => void] {
  let v = false;
  try {
    v = sessionStorage.getItem(key) === '1';
  } catch {
    /* storage unavailable */
  }
  return [
    v,
    () => {
      try {
        sessionStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    },
  ];
}

export function AppBanners() {
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const folder = useLiveQuery(() => db.local.get('folder'), []);
  const invoiceCount = useLiveQuery(() => db.invoices.count(), []);
  const status = useFolderStatus();
  const [reminderHidden, hideReminder] = sessionFlag('backup-reminder-hidden');
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!settings?.onboarded) return null;

  const banners: React.ReactNode[] = [];

  if (status.state === 'reconnect') {
    banners.push(
      <Banner key="reconnect" tone="danger" icon={<AlertTriangle />}>
        <span>Automatic saving to your backup folder is paused.</span>
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await reconnectFolder().catch(() => false);
            setBusy(false);
            if (ok) toast.success('Backup folder reconnected. Everything is saved.');
            else toast.error('Permission was not given. Click again and choose “Allow”.');
          }}
        >
          <RefreshCw /> Click to reconnect your backup folder
        </Button>
      </Banner>,
    );
  } else if (status.state === 'error') {
    banners.push(
      <Banner key="folder-error" tone="danger" icon={<AlertTriangle />}>
        <span>{status.message}</span>
        <Link to="/settings/backup" className="font-medium underline">
          Open backup settings
        </Link>
      </Banner>,
    );
  }

  if (!settings.storageNoticeSeen) {
    banners.push(
      <Banner
        key="notice"
        tone="info"
        icon={<HardDrive />}
        onDismiss={() =>
          void updateSettings((s) => {
            s.storageNoticeSeen = true;
          })
        }
      >
        <span>
          Your invoices are saved in this browser on this computer. Clearing browser data will delete them, so export a backup
          regularly.
        </span>
        <Link to="/settings/backup" className="font-medium underline">
          Backup options
        </Link>
      </Banner>,
    );
  }

  const lastBackup = Math.max(
    settings.lastBackupAt ? Date.parse(settings.lastBackupAt) : 0,
    folder?.enabled && folder.lastSavedAt ? Date.parse(folder.lastSavedAt) : 0,
  );
  const since = lastBackup || Date.parse(settings.createdAt);
  if (!reminderHidden && (invoiceCount ?? 0) > 0 && Date.now() - since > 30 * DAY && status.state !== 'reconnect') {
    banners.push(
      <Banner
        key="reminder"
        tone="warning"
        icon={<CloudUpload />}
        onDismiss={() => {
          hideReminder();
          force((n) => n + 1);
        }}
      >
        <span>{lastBackup ? `Your last backup was ${Math.floor((Date.now() - lastBackup) / DAY)} days ago.` : 'You haven’t made a backup yet.'}</span>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={async () => {
            downloadBlob(new Blob([await createBackupJson()], { type: 'application/json' }), backupFileName());
            await markBackedUp();
            toast.success('Backup downloaded.');
          }}
        >
          Export backup now
        </Button>
      </Banner>,
    );
  }

  return <>{banners}</>;
}
