import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import InspectModule from 'docxtemplater/js/inspect-module.js';
import { KNOWN_ITEM_TAGS, KNOWN_TAGS, LOOP_TAG, RECOMMENDED_TAGS, RENAMED_TAGS } from './tags';

/**
 * Uploaded Word templates: the user's own .docx with {tags}, filled by docxtemplater.
 * paragraphLoop: a {#items}…{/items} pair in a table row repeats the row.
 * linebreaks: multi-line values (addresses, notes) keep their line breaks.
 */

export interface TemplateInspection {
  tags: string[];
  itemTags: string[];
  hasItemsLoop: boolean;
  unknown: string[];
  renamed: { from: string; to: string }[];
  missing: string[];
  errors: string[];
}

type Bytes = ArrayBuffer | Uint8Array;

function open(bytes: Bytes, modules: unknown[] = []) {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    throw new Error('This file is not a valid .docx document.');
  }
  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: modules as never,
    // Unknown or empty tags print nothing instead of "undefined".
    nullGetter: () => '',
  });
}

interface DocxtemplaterError {
  properties?: { errors?: { properties?: { explanation?: string; xtag?: string; id?: string } }[]; explanation?: string };
  message: string;
}

function explain(e: unknown): string[] {
  const err = e as DocxtemplaterError;
  const list = err.properties?.errors;
  if (list?.length) {
    return list.map((x) => {
      const p = x.properties ?? {};
      if (p.id === 'unclosed_tag' || p.id === 'unopened_tag') return `A tag is not closed properly near “${p.xtag ?? ''}”. Check the { and } braces.`;
      if (p.id === 'unclosed_loop' || p.id === 'unopened_loop') return `The loop {#${p.xtag ?? ''}} … {/${p.xtag ?? ''}} is not opened and closed in the same place.`;
      return p.explanation ?? err.message;
    });
  }
  return [err.properties?.explanation ?? err.message];
}

/** List the tags in a template and check them against the known tags. */
export function inspectTemplate(bytes: Bytes): TemplateInspection {
  const inspect = new InspectModule();
  try {
    open(bytes, [inspect]);
  } catch (e) {
    if ((e as Error).message === 'This file is not a valid .docx document.') throw e;
    return { tags: [], itemTags: [], hasItemsLoop: false, unknown: [], renamed: [], missing: [], errors: explain(e) };
  }
  const all = inspect.getAllTags() as Record<string, Record<string, unknown>>;
  const tags = Object.keys(all).filter((t) => t !== LOOP_TAG);
  const hasItemsLoop = LOOP_TAG in all;
  const itemTags = hasItemsLoop ? Object.keys(all[LOOP_TAG] ?? {}) : [];

  const renamed: { from: string; to: string }[] = [];
  const unknown: string[] = [];
  for (const t of tags) {
    if (KNOWN_TAGS.has(t)) continue;
    if (RENAMED_TAGS[t]) renamed.push({ from: t, to: RENAMED_TAGS[t] });
    else unknown.push(`{${t}}`);
  }
  for (const t of itemTags) if (!KNOWN_ITEM_TAGS.has(t)) unknown.push(`{${t}} (inside the items loop)`);
  // Item tags used outside the loop are a common mistake.
  for (const t of tags) if (KNOWN_ITEM_TAGS.has(t) && !KNOWN_TAGS.has(t)) unknown.push(`{${t}} must be inside {#items}…{/items}`);

  const missing = RECOMMENDED_TAGS.filter((t) => !tags.includes(t)).map((t) => `{${t}}`);
  if (!hasItemsLoop) missing.push('{#items}…{/items}');
  return { tags, itemTags, hasItemsLoop, unknown: [...new Set(unknown)], renamed, missing, errors: [] };
}

/** Fill a template with tag values; returns the .docx bytes. */
export function fillTemplate(bytes: Bytes, data: Record<string, unknown>): Uint8Array {
  const doc = open(bytes);
  try {
    doc.render(data);
  } catch (e) {
    throw new Error(explain(e).join(' '));
  }
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
