import type { CustomTypeOptionsBase } from 'obsidian-dev-utils/obsidian/i18n/custom-type-options-base';

import type { PluginTypes } from '../plugin-types.ts';

declare module 'i18next' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Need to extend CustomTypeOptionsBase.
  interface CustomTypeOptions extends CustomTypeOptionsBase<PluginTypes> {
  }
}
