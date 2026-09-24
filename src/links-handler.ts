import type { Reference } from 'obsidian';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  App,
  normalizePath,
  resolveSubpath,
  TFile
} from 'obsidian';
import {
  getFileOrNull,
  MARKDOWN_FILE_EXTENSION
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  generateMarkdownLink,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import {
  dirname,
  join
} from 'obsidian-dev-utils/path';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type {
  MisplacedAttachmentCheckResult,
  MisplacedAttachmentHandler
} from './misplaced-attachment-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

interface LinksHandlerCheckConsistencyParams {
  readonly badEmbeds: ConsistencyCheckResult;
  readonly badFrontmatterLinks: ConsistencyCheckResult;
  readonly badLinks: ConsistencyCheckResult;
  readonly misplacedAttachmentHandler: MisplacedAttachmentHandler;
  readonly misplacedAttachments: MisplacedAttachmentCheckResult;
  readonly note: TFile;
}

interface LinksHandlerCheckReferencesParams {
  readonly badReferences: ConsistencyCheckResult;
  readonly misplacedAttachmentHandler: MisplacedAttachmentHandler;
  readonly misplacedAttachments: MisplacedAttachmentCheckResult;
  readonly notePath: string;
  readonly references: readonly Reference[];
}

interface LinksHandlerConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class ConsistencyCheckResult extends Map<string, Reference[]> {
  public constructor(private readonly title: string) {
    super();
  }

  public add(notePath: string, link: Reference): void {
    if (!this.has(notePath)) {
      this.set(notePath, []);
    }
    const array = ensureNonNullable(this.get(notePath));
    array.push(link);
  }

  public override toString(app: App, reportPath: string): string {
    if (this.size > 0) {
      let $string = `# ${this.title} (${String(this.size)} files)\n`;
      for (const notePath of this.keys()) {
        const note = getFileOrNull({ app, pathOrFile: notePath });
        if (!note) {
          continue;
        }
        const linkString = generateMarkdownLink({
          app,
          sourcePathOrFile: reportPath,
          targetPathOrFile: note
        });
        $string += `${linkString}:\n`;
        for (const link of ensureNonNullable(this.get(notePath))) {
          if (isReferenceCache(link)) {
            $string += `- (line ${String(link.position.start.line + 1)}): \`${link.link}\`\n`;
          } else if (isFrontmatterLinkCache(link)) {
            $string += `- (key ${link.key}): \`${link.link}\`\n`;
          }
        }
        $string += '\n\n';
      }
      return $string;
    }
    return `# ${this.title}\nNo problems found\n\n`;
  }
}

export class LinksHandler {
  private readonly app: App;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: LinksHandlerConstructorParams) {
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async checkConsistency(params: LinksHandlerCheckConsistencyParams): Promise<void> {
    const {
      badEmbeds,
      badFrontmatterLinks,
      badLinks,
      misplacedAttachmentHandler,
      misplacedAttachments,
      note
    } = params;
    if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.app, note.path);
    if (!cache) {
      return;
    }

    for (
      const [references, badReferences] of [
        [cache.links ?? [], badLinks],
        [cache.embeds ?? [], badEmbeds],
        [cache.frontmatterLinks ?? [], badFrontmatterLinks]
      ] as const
    ) {
      await this.checkReferences({
        badReferences,
        misplacedAttachmentHandler,
        misplacedAttachments,
        notePath: note.path,
        references
      });
    }
  }

  /**
   * One pass per reference kind: a reference that does not resolve is a bad one and goes no further, and
   * everything that DID resolve is offered to the misplaced-attachment check. Keeping the two in one walk is
   * what makes "a reference already reported as a bad link is never reported twice" structural.
   */
  private async checkReferences(params: LinksHandlerCheckReferencesParams): Promise<void> {
    const {
      badReferences,
      misplacedAttachmentHandler,
      misplacedAttachments,
      notePath,
      references
    } = params;

    for (const reference of references) {
      const attachmentFile = await this.resolveValidReferenceTarget(reference, notePath);

      if (!attachmentFile) {
        badReferences.add(notePath, reference);
        continue;
      }

      await misplacedAttachmentHandler.check({
        attachmentFile,
        misplacedAttachments,
        notePath,
        reference
      });
    }
  }

  /**
   * The file a reference resolves to, or `null` when it resolves to nothing — which is this plugin's
   * definition of a bad link. The resolution is deliberately LITERAL: no extension inference, no vault-wide
   * name search, no fuzzy match, so it is stricter than Obsidian's own resolver. See the scope line in
   * `AGENTS.md`.
   */
  private async resolveValidReferenceTarget(link: Reference, notePath: string): Promise<null | TFile> {
    const { linkPath, subpath } = splitSubpath(link.link);

    let fullLinkPath: string;

    if (!linkPath) {
      fullLinkPath = notePath;
    } else if (linkPath.startsWith('/')) {
      fullLinkPath = normalizePath(linkPath);
    } else {
      fullLinkPath = join(dirname(notePath), linkPath);
    }

    const file = getFileOrNull({ app: this.app, pathOrFile: fullLinkPath });

    if (!file) {
      return null;
    }

    if (!subpath) {
      return file;
    }

    const extension = file.extension.toLocaleLowerCase();

    if (extension === 'pdf') {
      return subpath.startsWith('#page=') ? file : null;
    }

    if (extension !== MARKDOWN_FILE_EXTENSION) {
      return null;
    }

    const cache = await getCacheSafe(this.app, file);

    if (!cache) {
      return null;
    }

    return resolveSubpath(cache, subpath) ? file : null;
  }
}
