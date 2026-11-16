export interface PaginateInput {
  /** Usable height per page (excludes the fixed footer). */
  pageHeight: number;
  /** Height of the full header on page 1 (everything above the table header). */
  firstTop: number;
  /** Height of the short "continued" header on later pages. */
  contTop: number;
  /** Table header (repeated on every page that has rows). */
  tableHeader: number;
  rows: number[];
  /** Totals / payment / notes block on the last page. */
  bottom: number;
}

export interface PageSlice {
  index: number;
  first: boolean;
  last: boolean;
  /** Row range [start, end). */
  start: number;
  end: number;
}

/**
 * Split table rows across A4 pages. The totals block is never left alone on a
 * page when it can be helped: the last row moves with it.
 */
export function paginate(p: PaginateInput): PageSlice[] {
  const pages: Omit<PageSlice, 'index' | 'last'>[] = [];
  const n = p.rows.length;
  let i = 0;
  let first = true;

  for (let guard = 0; guard < 1000; guard++) {
    const top = first ? p.firstTop : p.contTop;
    let avail = p.pageHeight - top - (i < n ? p.tableHeader : 0);
    const start = i;
    while (i < n && p.rows[i] <= avail) {
      avail -= p.rows[i];
      i++;
    }
    if (i === start && i < n) i++; // a single enormous row: place it anyway

    if (i === n) {
      if (avail >= p.bottom || start === n) {
        pages.push({ first, start, end: i });
        break;
      }
      // Totals don't fit under the last rows: carry the last row over with them.
      if (i - start > 1) i--;
      pages.push({ first, start, end: i });
      first = false;
      if (i === n) {
        pages.push({ first: false, start: n, end: n });
        break;
      }
      continue;
    }
    pages.push({ first, start, end: i });
    first = false;
  }

  return pages.map((pg, index) => ({ ...pg, index, last: index === pages.length - 1 }));
}
