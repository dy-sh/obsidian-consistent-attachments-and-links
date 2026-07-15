import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['node_modules', 'dist'];
const BIG_TIMEOUT_IN_MILLISECONDS = 30_000;
const ANDROID_TIMEOUT_IN_MILLISECONDS = 60_000;
const HOOK_TIMEOUT_MULTIPLIER = 4;
/*
 * The performance project bulk-deletes hundreds of notes through the real delete handler
 * and waits on the dev-utils operation queue to drain, so its setup (populate + Obsidian
 * startup index) and the at-scale test both need far more time than the regular
 * integration projects.
 */
const PERFORMANCE_TIMEOUT_IN_MILLISECONDS = 600_000;

export const config = defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.ts'
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    },
    exclude: ['node_modules', 'dist'],
    globals: false,
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    projects: [
      {
        resolve: {
          alias: {
            obsidian: 'obsidian-test-mocks/obsidian'
          }
        },
        test: {
          environment: 'jsdom',
          exclude: [...SHARED_EXCLUDE, 'src/**/*.integration.test.ts'],
          execArgv: ['--no-webstorage'],
          include: ['src/**/*.test.ts'],
          name: 'unit-tests',
          server: {
            deps: {
              inline: ['@obsidian-typings', 'obsidian-dev-utils']
            }
          },
          setupFiles: [
            'obsidian-test-mocks/vitest-setup',
            'obsidian-test-mocks/obsidian-typings/vitest-setup',
            'obsidian-dev-utils/vitest-setup'
          ]
        }
      },
      {
        test: {
          environment: 'node',
          fileParallelism: false,
          hookTimeout: BIG_TIMEOUT_IN_MILLISECONDS * HOOK_TIMEOUT_MULTIPLIER,
          include: ['src/**/*.no-app.integration.test.ts'],
          name: 'integration-tests:no-app',
          testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
        }
      },
      {
        test: {
          environment: 'node',
          fileParallelism: false,
          globalSetup: ['obsidian-integration-testing/vitest-global-setup'],
          hookTimeout: BIG_TIMEOUT_IN_MILLISECONDS * HOOK_TIMEOUT_MULTIPLIER,
          include: ['src/**/*.desktop.integration.test.ts'],
          name: 'integration-tests:desktop',
          setupFiles: ['obsidian-integration-testing/vitest-setup'],
          testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
        }
      },
      {
        test: {
          environment: 'node',
          environmentOptions: {
            obsidianTransport: {
              commandTimeoutInMilliseconds: PERFORMANCE_TIMEOUT_IN_MILLISECONDS,
              type: 'obsidian-cdp'
            }
          },
          fileParallelism: false,
          globalSetup: ['./scripts/vitest-global-setup-performance.ts'],
          hookTimeout: PERFORMANCE_TIMEOUT_IN_MILLISECONDS,
          include: ['src/**/*.desktop-performance.integration.test.ts'],
          name: 'integration-tests:desktop-performance',
          setupFiles: ['obsidian-integration-testing/vitest-setup'],
          testTimeout: PERFORMANCE_TIMEOUT_IN_MILLISECONDS
        }
      },
      {
        test: {
          environment: 'node',
          environmentOptions: {
            obsidianTransport: {
              appiumUrl: 'http://localhost:4723',
              avdName: 'obsidian_test',
              type: 'obsidian-android-appium'
            }
          },
          fileParallelism: false,
          globalSetup: ['obsidian-integration-testing/vitest-global-setup'],
          hookTimeout: ANDROID_TIMEOUT_IN_MILLISECONDS * HOOK_TIMEOUT_MULTIPLIER,
          include: ['src/**/*.android.integration.test.ts'],
          name: 'integration-tests:android',
          setupFiles: ['obsidian-integration-testing/vitest-setup'],
          testTimeout: ANDROID_TIMEOUT_IN_MILLISECONDS
        }
      }
    ]
  }
});
