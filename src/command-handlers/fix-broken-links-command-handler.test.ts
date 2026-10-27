import type { App } from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { openBrokenLinksView } from '../broken-links/broken-links-view.ts';
import { FixBrokenLinksCommandHandler } from './fix-broken-links-command-handler.ts';

vi.mock('../broken-links/broken-links-view.ts', () => ({
  openBrokenLinksView: vi.fn(() => noopAsync())
}));

interface CommandHandlerPrivate {
  readonly execute: () => Promise<void>;
}

describe('FixBrokenLinksCommandHandler', () => {
  it('should open the broken-links view on execute', async () => {
    const app = strictProxy<App>({});
    const handler = new FixBrokenLinksCommandHandler(app);
    await castTo<CommandHandlerPrivate>(handler).execute();
    expect(vi.mocked(openBrokenLinksView)).toHaveBeenCalledWith(app);
  });
});
