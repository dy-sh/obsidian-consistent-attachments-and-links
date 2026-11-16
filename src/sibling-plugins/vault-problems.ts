/**
 * @file
 *
 * The plugin whose `Problems` view shows the consistency report's findings live, as the vault changes.
 *
 * `Vault Problems` reached parity with the report in its 1.x line: it checks the same categories through the same
 * `@mnaoumov/obsidian-lib` modules (`path-compatibility`, `misplaced-attachment`). The report stays for users
 * without it (owner's decision, 2026-11-10). When it is enabled, `Check vault consistency` still writes the report
 * and also points the user to that view.
 *
 * Only the two names this plugin reads are declared here, and nothing of its API: the pointer runs its command,
 * which needs no contract.
 */

/**
 * The id of that plugin, as listed in Obsidian's community plugin registry.
 */
export const VAULT_PROBLEMS_PLUGIN_ID = 'vault-problems';

/**
 * Its `Open Problems` command, which opens or reveals the `Problems` view.
 */
export const VAULT_PROBLEMS_OPEN_PROBLEMS_COMMAND_ID = `${VAULT_PROBLEMS_PLUGIN_ID}:open-problems`;

/**
 * Its display name, shown as code in the pointer.
 */
export const VAULT_PROBLEMS_PLUGIN_NAME = 'Vault Problems';
