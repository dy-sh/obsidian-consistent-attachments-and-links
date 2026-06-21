import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['node_modules', 'dist'];
const BIG_TIMEOUT_IN_MILLISECONDS = 30_000;
const ANDROID_TIMEOUT_IN_MILLISECONDS = 60_000;
const HOOK_TIMEOUT_MULTIPLIER = 4;

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
            'obsidian-dev-utils/setup/async-operation-tracking-vitest-setup'
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
          testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
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
          testTimeout: ANDROID_TIMEOUT_IN_MILLISECONDS
        }
      }
    ]
  }
});
