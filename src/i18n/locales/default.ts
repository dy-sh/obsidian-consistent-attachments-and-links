import type { DefaultTranslationsBase } from '@mnaoumov/obsidian-lib/i18n/default-translations';

import { en as obsidianLibEn } from '@mnaoumov/obsidian-lib/i18n/locales/en';

export const defaultTranslations = {
  ...obsidianLibEn,
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
      noPlatformsEnabled: 'No platforms are selected and \'Normalize Unicode names to NFC\' is off, so there is nothing to check. Enable at least one under \'Ensure path compatibility on\', or turn that setting on.',
      nothingToRepair: 'No paths found that need to be repaired',
      repaired: 'Repaired {{count}} path(s)',
      unicodeCollision: 'Did not normalize {{count}} name(s) to NFC: {{paths}}. The same folder on disk already holds a separate item with the NFC spelling of that name, so renaming would overwrite it. Rename or merge one of the two outside Obsidian.',
      unrepairable: 'Could not repair {{count}} path(s): {{paths}}. Every character of the name would have to be removed.'
    },
    progressBar: {
      message: 'Checking path compatibility {{iterationString}} - \'{{path}}\'.',
      title: 'Repairing incompatible paths...'
    },
    report: {
      cannotRepair: 'Cannot be repaired automatically: every character of the name would have to be removed.',
      noProblems: 'No problems found',
      title: 'Path compatibility',
      vaultRootWarning: 'The vault root path is {{realLength}} characters long, which is more than the configured maximum of {{maxLength}}. Every path check below is therefore stricter than this machine actually requires. Raise \'Maximum vault root path length\' to match.',
      wouldBecome: 'Would become: `{{newPath}}`'
    },
    violation: {
      bytes: 'bytes',
      characters: 'characters',
      forbiddenCharacter: 'Contains {{characters}}, which {{platform}} does not allow in a name.',
      nameTooLong: 'Name is {{length}} {{unit}} long, over the {{limit}} {{platform}} allows.',
      obsidianForbiddenCharacter: 'Contains {{characters}}, which Obsidian links do not work with. The file system stores the name fine.',
      pathTooLong: 'Path is {{length}} {{unit}} long, over the {{limit}} {{platform}} allows. That counts {{vaultRootLength}} for the vault root and 1 for the separator after it.',
      reservedName: 'Name is reserved on {{platform}}.',
      trailingCharacter: 'Name ends with a dot or a space, which {{platform}} does not allow.',
      unicodeNotNormalized: 'Name is stored on disk in decomposed Unicode form (NFD), not the composed form (NFC) Obsidian uses. Sync, git and backup tools see the two as different names. The repair keeps the name and stores it in NFC.'
    }
  },
  report: {
    truncated: '> [!NOTE]\n> Not listed: {{omittedCount}} more. Each section lists its first {{limit}}, so the report stays small enough to open. A list this long usually has one cause, such as an attachment folder setting that no existing attachment matches. Fix it and check again, or leave paths out with \'Exclude paths\'.'
  }
} as const satisfies DefaultTranslationsBase;
