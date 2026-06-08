import type { CustomTypeOptionsBase } from 'obsidian-dev-utils/obsidian/i18n/custom-type-options';
import type { DefaultTranslationsBase } from 'obsidian-dev-utils/obsidian/i18n/default-translations';

import type { translationsMap } from './locales/translations-map.ts';

declare module 'i18next' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Need to extend CustomTypeOptionsBase.
  interface CustomTypeOptions extends CustomTypeOptionsBase<DefaultTranslationsBase & typeof translationsMap.en> {
  }
}
