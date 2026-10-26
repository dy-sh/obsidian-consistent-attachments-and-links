import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App as AppOriginal,
  WorkspaceLeaf as WorkspaceLeafOriginal
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  App,
  WorkspaceLeaf
} from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { BrokenLinkFixer } from './broken-link-fixer.ts';

import { BrokenLinksViewComponent } from './broken-links-view-component.ts';
import {
  BROKEN_LINKS_VIEW_TYPE,
  BrokenLinksView
} from './broken-links-view.ts';

describe('BrokenLinksViewComponent', () => {
  it('should register the view while loaded, and unregister it and close its tabs on unload, so it can load again', () => {
    const appMock = App.createConfigured__();
    const app = castTo<AppOriginal>(appMock);
    const registerView = vi.spyOn(app.viewRegistry, 'registerView');
    const unregisterView = vi.spyOn(app.viewRegistry, 'unregisterView');
    const detachLeavesOfType = vi.spyOn(app.workspace, 'detachLeavesOfType');
    const component = new BrokenLinksViewComponent({
      app,
      brokenLinkFixer: strictProxy<BrokenLinkFixer>({}),
      pluginNoticeComponent: strictProxy<PluginNoticeComponent>({})
    });

    component.load();
    const [type, viewCreator] = registerView.mock.calls[0] ?? [];
    expect(type).toBe(BROKEN_LINKS_VIEW_TYPE);
    const leaf: WorkspaceLeafOriginal = WorkspaceLeaf.create2__(appMock).asOriginalType3__();
    expect(viewCreator?.(leaf)).toBeInstanceOf(BrokenLinksView);

    component.unload();
    expect(unregisterView).toHaveBeenCalledWith(BROKEN_LINKS_VIEW_TYPE);
    expect(detachLeavesOfType).toHaveBeenCalledWith(BROKEN_LINKS_VIEW_TYPE);

    component.load();
    expect(registerView).toHaveBeenCalledTimes(2);
    component.unload();
  });
});
