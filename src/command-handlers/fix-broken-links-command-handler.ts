import type { App } from 'obsidian';

import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';

import { openBrokenLinksView } from '../broken-links-view.ts';

export class FixBrokenLinksCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly app: App) {
    super({
      icon: 'unlink',
      id: 'fix-broken-links',
      name: 'Fix broken links'
    });
  }

  protected override async execute(): Promise<void> {
    await openBrokenLinksView(this.app);
  }
}
