import type { DefaultTranslationsBase } from 'obsidian-dev-utils/obsidian/i18n/default-translations';

import { en as obsidianDevUtilsEn } from 'obsidian-dev-utils/obsidian/i18n/locales/en';

export const defaultTranslations = {
  ...obsidianDevUtilsEn,
  misplacedAttachment: {
    report: {
      alsoUsedBy: ' (also used by {{notes}})',
      linksToExternal: '{{noteLink}} links to external {{attachmentLink}}',
      noProblems: 'No problems found',
      noteAttachmentFolder: 'This note\'s attachment folder is `{{properAttachmentFolderPath}}`',
      properNote: '{{noteLink}} (its proper note)',
      skipped: 'Not checked: \'Links to attachments outside the note\'s folder\' is set to \'Ignore\'.',
      title: 'Misplaced attachments'
    }
  },
  pathCompatibility: {
    notice: {
      noPlatformsEnabled: 'No platforms are selected, so there is nothing to check. Enable at least one under \'Ensure path compatibility on\'.',
      nothingToRepair: 'No paths found that need to be repaired',
      repaired: 'Repaired {{count}} path(s)',
      unrepairable: 'Could not repair {{count}} path(s): {{paths}}. Every character of the name would have to be removed.'
    },
    progressBar: {
      message: 'Checking path compatibility {{iterationString}} - \'{{path}}\'.',
      title: 'Consistent Attachments and Links: Repairing incompatible paths...'
    },
    report: {
      cannotRepair: 'Cannot be repaired automatically: every character of the name would have to be removed.',
      noProblems: 'No problems found',
      title: 'Path compatibility',
      vaultRootWarning: 'The vault root path is {{realLength}} characters long, which is more than the configured maximum of {{maxLength}}. Every path check below is therefore stricter than this machine actually requires. Raise \'Maximum vault root path length\' to match.',
      wouldBecome: 'Would become: `{{newPath}}`'
    },
    violation: {
      forbiddenCharacter: 'Contains a character {{platform}} does not allow in a name.',
      nameTooLong: 'Name is too long for {{platform}}.',
      pathTooLong: 'Path is too long for {{platform}}.',
      reservedName: 'Name is reserved on {{platform}}.',
      trailingCharacter: 'Name ends with a dot or a space, which {{platform}} does not allow.'
    }
  }
} as const satisfies DefaultTranslationsBase;
