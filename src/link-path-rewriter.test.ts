import {
  describe,
  expect,
  it
} from 'vitest';

import {
  computeNewLinkPath,
  replaceLinkPath
} from './link-path-rewriter.ts';

describe('computeNewLinkPath', () => {
  it('should write a vault-absolute path when the old one started with a slash', () => {
    expect(computeNewLinkPath({ oldLinkPath: '/old/x.md', sourcePath: 'a/note.md', targetPath: 'new/x.md' })).toBe('/new/x.md');
  });

  it('should write a path relative to the note', () => {
    expect(computeNewLinkPath({ oldLinkPath: '../old/x.md', sourcePath: 'a/b/note.md', targetPath: 'a/c/x.md' })).toBe('../c/x.md');
    expect(computeNewLinkPath({ oldLinkPath: 'x.md', sourcePath: 'note.md', targetPath: 'c/x.md' })).toBe('c/x.md');
    expect(computeNewLinkPath({ oldLinkPath: 'x.md', sourcePath: 'a/note.md', targetPath: 'a/y.md' })).toBe('y.md');
    expect(computeNewLinkPath({ oldLinkPath: 'x.md', sourcePath: 'a/note.md', targetPath: 'a' })).toBe('../a');
  });

  it('should keep a leading ./ only where the new path does not climb', () => {
    expect(computeNewLinkPath({ oldLinkPath: './x.md', sourcePath: 'a/note.md', targetPath: 'a/b/x.md' })).toBe('./b/x.md');
    expect(computeNewLinkPath({ oldLinkPath: './x.md', sourcePath: 'a/note.md', targetPath: 'c/x.md' })).toBe('../c/x.md');
  });
});

describe('replaceLinkPath', () => {
  it('should replace only the path of a wikilink, keeping its subpath and alias', () => {
    expect(replaceLinkPath('[[old/x.md#Heading|Alias]]', 'new/x.md')).toBe('[[new/x.md#Heading|Alias]]');
    expect(replaceLinkPath('![[old/x.png|100]]', 'new dir/x.png')).toBe('![[new dir/x.png|100]]');
  });

  it('should replace only the path of a markdown link, keeping its text, subpath and title', () => {
    expect(replaceLinkPath('[Text](old/x.md#Heading "Title")', 'new/x.md')).toBe('[Text](new/x.md#Heading "Title")');
    expect(replaceLinkPath('![](old/x.png)', 'new/x.png')).toBe('![](new/x.png)');
  });

  it('should skip brackets and escapes in the link text', () => {
    expect(replaceLinkPath(String.raw`[a [b] \] c](old.md)`, 'new.md')).toBe(String.raw`[a [b] \] c](new.md)`);
  });

  it('should replace a destination that runs to the end of the text', () => {
    expect(replaceLinkPath('[x](old.md', 'new.md')).toBe('[x](new.md');
    expect(replaceLinkPath('[x](<old.md', 'new.md')).toBe('[x](<new.md');
  });

  it('should keep an angle-bracketed destination unencoded', () => {
    expect(replaceLinkPath('[x](<old dir/x.md#h>)', 'new dir/x.md')).toBe('[x](<new dir/x.md#h>)');
    expect(replaceLinkPath('[x](<old.md>)', 'new.md')).toBe('[x](<new.md>)');
  });

  it('should encode only what ends a destination when the old one was not percent-encoded', () => {
    expect(replaceLinkPath('[x](old.md)', 'нов (1)/50% #2.md')).toBe('[x](нов%20%281%29/50%25%20%232.md)');
  });

  it('should percent-encode fully when the old destination was', () => {
    expect(replaceLinkPath('[x](old%20dir/x.md)', 'нов dir/x.md')).toBe('[x](%D0%BD%D0%BE%D0%B2%20dir/x.md)');
  });

  it('should replace a bare path, keeping its subpath', () => {
    expect(replaceLinkPath('old.md#h', 'new.md')).toBe('new.md#h');
    expect(replaceLinkPath('old.md', 'new.md')).toBe('new.md');
  });

  it('should treat text that only looks like a markdown link as a bare path', () => {
    expect(replaceLinkPath('[x] old.md', 'new.md')).toBe('new.md');
    expect(replaceLinkPath('[x', 'new.md')).toBe('new.md');
  });
});
