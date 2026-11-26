import { PathCompatibilityPlatform } from '@mnaoumov/obsidian-lib/path-compatibility';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  applyForbiddenCharacterReplacements,
  getForbiddenCharacterReplacementsValidationMessage,
  parseForbiddenCharacterReplacements
} from './forbidden-character-replacements.ts';

const EXAMPLE_LINES = [':= -', '?=', '[=(', ']=)', '|=-'];

describe('parseForbiddenCharacterReplacements', () => {
  it('should keep everything after the separator verbatim, spaces and empty included', () => {
    expect([...parseForbiddenCharacterReplacements(EXAMPLE_LINES)]).toStrictEqual([
      [':', ' -'],
      ['?', ''],
      ['[', '('],
      [']', ')'],
      ['|', '-']
    ]);
  });

  it('should keep the replacement as is when it holds the separator itself', () => {
    expect(parseForbiddenCharacterReplacements([':=a=b']).get(':')).toBe('a=b');
  });

  it('should skip a malformed line and a repeated character', () => {
    expect([...parseForbiddenCharacterReplacements(['', ':', ':-', ':=1', ':=2'])]).toStrictEqual([[':', '1']]);
  });
});

describe('getForbiddenCharacterReplacementsValidationMessage', () => {
  it('should accept the examples and an empty list', () => {
    expect(getForbiddenCharacterReplacementsValidationMessage(EXAMPLE_LINES)).toBe('');
    expect(getForbiddenCharacterReplacementsValidationMessage([])).toBe('');
  });

  it('should refuse a line with no separator after its character', () => {
    expect(getForbiddenCharacterReplacementsValidationMessage([': -'])).toContain('": -" is not a <character>=<replacement> line');
  });

  it('should refuse a character every platform allows', () => {
    expect(getForbiddenCharacterReplacementsValidationMessage(['a=b'])).toContain('"a" is allowed in a file name on every platform');
  });

  it('should refuse a character given twice', () => {
    expect(getForbiddenCharacterReplacementsValidationMessage([':=-', ':=_'])).toBe('":" has more than one replacement.');
  });

  it('should refuse a replacement some platform cannot hold', () => {
    expect(getForbiddenCharacterReplacementsValidationMessage(['?=*'])).toContain('"?=*": The replacement must not contain "*"');
  });
});

describe('applyForbiddenCharacterReplacements', () => {
  const replacements = parseForbiddenCharacterReplacements(EXAMPLE_LINES);

  it('should replace every mapped character the enabled platforms forbid, and leave the rest', () => {
    expect(applyForbiddenCharacterReplacements({ name: 'a:b?c[d]e|f*g', platforms: [PathCompatibilityPlatform.Windows], replacements }))
      .toBe('a -bc(d)e-f*g');
  });

  it('should leave a character no enabled platform forbids', () => {
    // Linux accepts `?`, while `:` is refused there too and Obsidian's links refuse `[`, `]` and `|` under every profile.
    expect(applyForbiddenCharacterReplacements({ name: 'a:b?c[d]e|f', platforms: [PathCompatibilityPlatform.Linux], replacements }))
      .toBe('a -b?c(d)e-f');
  });

  it('should leave a name\'s other violations to the repair', () => {
    // A reserved name and a trailing dot are violations too, but not characters this replaces.
    expect(applyForbiddenCharacterReplacements({ name: 'CON:x.', platforms: [PathCompatibilityPlatform.Windows], replacements }))
      .toBe('CON -x.');
  });

  it('should change nothing with no platform enabled or no replacement given', () => {
    expect(applyForbiddenCharacterReplacements({ name: 'a:b', platforms: [], replacements })).toBe('a:b');
    expect(applyForbiddenCharacterReplacements({ name: 'a:b', platforms: [PathCompatibilityPlatform.Windows], replacements: new Map() })).toBe('a:b');
    expect(applyForbiddenCharacterReplacements({ name: '', platforms: [PathCompatibilityPlatform.Windows], replacements })).toBe('');
  });
});
