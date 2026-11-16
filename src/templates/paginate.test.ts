import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const base = { pageHeight: 800, firstTop: 300, contTop: 60, tableHeader: 20, bottom: 200 };

describe('paginate', () => {
  it('fits a short invoice on one page', () => {
    const pages = paginate({ ...base, rows: Array(5).fill(20) });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ first: true, last: true, start: 0, end: 5 });
  });

  it('continues long tables on later pages and ends with the totals', () => {
    const pages = paginate({ ...base, rows: Array(60).fill(20) });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.at(-1)!.last).toBe(true);
    // rows are contiguous and complete
    expect(pages[0].start).toBe(0);
    for (let k = 1; k < pages.length; k++) expect(pages[k].start).toBe(pages[k - 1].end);
    expect(pages.at(-1)!.end).toBe(60);
    // every page respects the height
    for (const pg of pages) {
      const used = (pg.first ? 300 : 60) + (pg.end > pg.start ? 20 : 0) + (pg.end - pg.start) * 20 + (pg.last ? 200 : 0);
      expect(used).toBeLessThanOrEqual(800);
    }
  });

  it('never leaves the totals alone when a row can come along', () => {
    // 24 rows fill page 1 exactly (300 + 20 + 24*20 = 800): totals must move with the last row
    const pages = paginate({ ...base, rows: Array(24).fill(20) });
    expect(pages).toHaveLength(2);
    expect(pages[1].end - pages[1].start).toBe(1);
  });
});
