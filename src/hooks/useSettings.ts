import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { AppSettings, CompanyProfile, NumberSequence } from '@/db/types';

/** undefined while loading, null when nothing is saved yet. */
export function useSettings(): AppSettings | null | undefined {
  return useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
}

export function useSequence(settings: AppSettings | null | undefined, id?: string): NumberSequence | undefined {
  if (!settings) return undefined;
  return settings.sequences.find((s) => s.id === (id ?? settings.defaultSequenceId));
}

/** Object URL for the company logo the user uploaded, or null when there is none. */
export function useLogoUrl(company: Pick<CompanyProfile, 'logo'> | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const logo = company?.logo;
  useEffect(() => {
    if (!logo) {
      setUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(logo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logo]);
  return url;
}

