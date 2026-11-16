import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { BUILT_IN_TEMPLATES } from '@/templates/registry';

export interface TemplateOption {
  id: string;
  name: string;
  kind: 'builtin' | 'docx';
}

/** Built-in templates plus the user's uploaded Word templates. */
export function useTemplateOptions(): TemplateOption[] {
  const uploaded = useLiveQuery(() => db.templates.where('kind').equals('docx').sortBy('createdAt'), []) ?? [];
  return [
    ...BUILT_IN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, kind: 'builtin' as const })),
    ...uploaded.map((t) => ({ id: t.id, name: `${t.name} (Word)`, kind: 'docx' as const })),
  ];
}
