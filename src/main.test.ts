import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

// eslint-disable-next-line import-x/no-rename-default -- The default export is the re-exported Plugin class.
import MainPlugin from './main.ts';
import { Plugin } from './plugin.ts';

vi.mock('./plugin.ts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Minimal stand-in for the Plugin class.
  Plugin: class {}
}));

describe('main', () => {
  it('should re-export the Plugin class as the default export', () => {
    expect(MainPlugin).toBe(Plugin);
  });
});
