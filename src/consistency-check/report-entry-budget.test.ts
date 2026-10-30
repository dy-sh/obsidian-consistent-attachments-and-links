import { initI18N } from '@mnaoumov/obsidian-lib/i18n/i18n';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { translationsMap } from '../i18n/locales/translations-map.ts';
import {
  MAX_REPORTED_ENTRIES_PER_SECTION,
  ReportEntryBudget
} from './report-entry-budget.ts';

describe('ReportEntryBudget', () => {
  beforeAll(async () => {
    await initI18N(translationsMap);
  });

  it('should list entries up to the limit and count the rest as left out', () => {
    const budget = new ReportEntryBudget(2);
    expect([budget.take(), budget.take(), budget.take()]).toEqual([true, true, false]);
    expect(budget.isExhausted).toBe(true);
    budget.omit(4);
    expect(budget.describeOmission()).toContain('Not listed: 5 more. Each section lists its first 2,');
  });

  it('should describe nothing when every entry was listed', () => {
    const budget = new ReportEntryBudget(2);
    budget.take();
    expect(budget.isExhausted).toBe(false);
    expect(budget.describeOmission()).toBe('');
  });

  it('should default to the section limit', () => {
    const budget = new ReportEntryBudget();
    for (let index = 0; index < MAX_REPORTED_ENTRIES_PER_SECTION; index++) {
      expect(budget.take()).toBe(true);
    }
    expect(budget.take()).toBe(false);
  });
});
