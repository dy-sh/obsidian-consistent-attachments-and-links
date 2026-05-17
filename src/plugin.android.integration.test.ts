import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

describe('Smoke test', () => {
  it('should load plugin on Android', () => {
    const vault = getTempVault();
    expect(vault.path).toBeTruthy();
  });
});
