import type { ComponentType } from 'react';
import type { DocModel } from './model';
import type { Measure } from './measure';
import { ClassicDoc } from './classic';
import { CompactDoc, MinimalDoc } from './standard';

export interface BuiltInTemplateInfo {
  id: string;
  name: string;
  description: string;
  Doc: ComponentType<{ model: DocModel; measure: Measure }>;
}

export const BUILT_IN_TEMPLATES: BuiltInTemplateInfo[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Bold header and footer bars in your theme colours, banded rows and a full totals block.',
    Doc: ClassicDoc,
  },
  { id: 'minimal', name: 'Minimal', description: 'White, thin lines and a small logo.', Doc: MinimalDoc },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Denser layout for long item lists. Continues over several pages with the header repeated.',
    Doc: CompactDoc,
  },
];

export function isBuiltInTemplateId(id: string | undefined): boolean {
  return BUILT_IN_TEMPLATES.some((t) => t.id === id);
}

/** Unknown ids (e.g. from older versions) fall back to Classic. */
export function getBuiltInTemplate(id: string | undefined): BuiltInTemplateInfo {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? BUILT_IN_TEMPLATES[0];
}
