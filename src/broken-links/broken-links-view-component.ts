import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { App } from 'obsidian';

import { Component } from 'obsidian';

import type { BrokenLinkFixer } from './broken-link-fixer.ts';

import {
  BROKEN_LINKS_VIEW_TYPE,
  BrokenLinksView
} from './broken-links-view.ts';

interface BrokenLinksViewComponentConstructorParams {
  readonly app: App;
  readonly brokenLinkFixer: BrokenLinkFixer;
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

/**
 * Registers the broken-links view for as long as the plugin's feature surface is up.
 *
 * Not `Plugin.registerView`: that registration lives as long as the PLUGIN, while this view belongs to the
 * surface, which goes down whenever `Advanced Rename and Delete Handler` goes away and comes back with it. A
 * plugin-scoped registration made from `onloadImpl` would be made a second time on the way back up, and Obsidian
 * throws on a view type registered twice, so nothing after it in `onloadImpl` would run. The cleanup mirrors
 * Obsidian's own, and also closes the open views: their Fix buttons must not act while the plugin is blocked.
 */
export class BrokenLinksViewComponent extends Component {
  private readonly app: App;
  private readonly brokenLinkFixer: BrokenLinkFixer;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  public constructor(params: BrokenLinksViewComponentConstructorParams) {
    super();
    this.app = params.app;
    this.brokenLinkFixer = params.brokenLinkFixer;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  public override onload(): void {
    const { app, brokenLinkFixer, pluginNoticeComponent } = this;
    app.viewRegistry.registerView(BROKEN_LINKS_VIEW_TYPE, (leaf) => new BrokenLinksView({ brokenLinkFixer, leaf, pluginNoticeComponent }));
    this.register(() => {
      app.viewRegistry.unregisterView(BROKEN_LINKS_VIEW_TYPE);
      app.workspace.detachLeavesOfType(BROKEN_LINKS_VIEW_TYPE);
    });
  }
}
