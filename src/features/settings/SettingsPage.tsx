import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Building2, DatabaseBackup, Hash, SlidersHorizontal } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { useSettings } from '@/hooks/useSettings';
import { defaultSettings } from '@/db/defaults';
import { cn } from '@/lib/utils';
import { CompanySettings } from './CompanySettings';
import { DefaultsSettings } from './DefaultsSettings';
import { NumberingSettings } from './NumberingSettings';
import { ThemeSettings } from './ThemeSettings';
import { BackupSettings } from './BackupSettings';

const SECTIONS = [
  { id: 'company', label: 'Company profile', icon: Building2 },
  { id: 'defaults', label: 'Invoice defaults', icon: SlidersHorizontal },
  { id: 'numbering', label: 'Invoice numbering', icon: Hash },
  { id: 'backup', label: 'Data & backup', icon: DatabaseBackup },
] as const;

export function SettingsPage() {
  const { section } = useParams();
  const stored = useSettings();
  if (!section) return <Navigate to="/settings/company" replace />;
  if (stored === undefined) return null;
  const settings = stored ?? defaultSettings();

  return (
    <Page>
      <PageHeader title="Settings" description="Your business details, defaults and numbering. Saved in this browser." />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <NavLink
              key={id}
              to={`/settings/${id}`}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-white text-navy shadow-card ring-1 ring-line' : 'text-muted hover:bg-white/60 hover:text-ink',
                )
              }
            >
              <Icon className="size-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'company' && (
            <div className="flex flex-col gap-6">
              <CompanySettings settings={settings} />
              <ThemeSettings settings={settings} />
            </div>
          )}
          {section === 'defaults' && <DefaultsSettings settings={settings} />}
          {section === 'numbering' && <NumberingSettings settings={settings} />}
          {section === 'backup' && <BackupSettings settings={settings} />}
        </div>
      </div>
    </Page>
  );
}
