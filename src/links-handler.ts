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

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

interface LinksHandlerCheckConsistencyParams {
  readonly badEmbeds: ConsistencyCheckResult;
  readonly badFrontmatterLinks: ConsistencyCheckResult;
  readonly badLinks: ConsistencyCheckResult;
  readonly note: TFile;
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
    const { badEmbeds, badFrontmatterLinks, badLinks, note } = params;
    if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.app, note.path);
    if (!cache) {
      return;
    }
    const links = cache.links ?? [];
    const embeds = cache.embeds ?? [];
    const frontmatterLinks = cache.frontmatterLinks ?? [];

    for (const link of links) {
      if (!(await this.isValidLink(link, note.path))) {
        badLinks.add(note.path, link);
      }
    }

    for (const embed of embeds) {
      if (!(await this.isValidLink(embed, note.path))) {
        badEmbeds.add(note.path, embed);
      }
    }

    for (const frontmatterLink of frontmatterLinks) {
      if (!(await this.isValidLink(frontmatterLink, note.path))) {
        badFrontmatterLinks.add(note.path, frontmatterLink);
      }
    }
  }

  private async isValidLink(link: Reference, notePath: string): Promise<boolean> {
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
      return false;
    }

    if (!subpath) {
      return true;
    }

    const extension = file.extension.toLocaleLowerCase();

    if (extension === 'pdf') {
      return subpath.startsWith('#page=');
    }

    if (extension !== MARKDOWN_FILE_EXTENSION) {
      return false;
    }

    const cache = await getCacheSafe(this.app, file);

    if (!cache) {
      return false;
    }

    return !!resolveSubpath(cache, subpath);
  }
}
