import { existsSync } from 'node:fs';
import {
  cleanup,
  patchPackageJsonForPlugin,
  readJson,
  runCommandAsync,
  tmpProjPath,
} from '@nx/plugin/testing';
import { execSync } from 'child_process';
import { dirname } from 'node:path';
import { getPackageManagerCommand } from '@nx/devkit';

function runNxNewCommand() {
  const localTmpDir = dirname(tmpProjPath());

  return execSync(
    `npx nx new proj --nx-workspace-root=${localTmpDir} --no-interactive --skip-install --collection=@nx/workspace --npmScope=proj --preset=empty`,
    {
      cwd: localTmpDir,
    },
  );
}

function runPackageManagerInstall(silent: boolean = true) {
  const pmc = getPackageManagerCommand('npm');
  const install = execSync(pmc.install, {
    cwd: tmpProjPath(),
    ...(silent ? { stdio: ['ignore', 'ignore', 'ignore'] } : {}),
  });

  return install ? install.toString() : '';
}

/**
 * E2E tests for @nx-aws-plugin/nx-aws-cache
 *
 * These tests verify that the plugin:
 * - Uses the official Nx plugin API (plugins array in nx.json)
 * - Does NOT use deprecated tasksRunnerOptions
 * - Requires Nx >= 20
 */
describe('aws-cache e2e', () => {
  beforeAll(() => {
    existsSync(tmpProjPath());
    cleanup();
    runNxNewCommand();
    patchPackageJsonForPlugin('@nx-aws-plugin/nx-aws-cache', 'dist/packages/nx-aws-cache');
    runPackageManagerInstall();
  });

  afterAll(() => {
    runCommandAsync('npx nx reset');
  });

  it('should init nx-aws-cache with plugin configuration using the official plugin API', async () => {
    await runCommandAsync(
      `npx nx generate @nx-aws-plugin/nx-aws-cache:init --awsRegion=eu-central-1 --awsBucket=bucket-name/cache-folder`,
    );

    const nxJson = readJson('nx.json');

    // Verify plugin is configured in plugins array
    expect(nxJson.plugins).toBeDefined();
    expect(Array.isArray(nxJson.plugins)).toBe(true);

    const plugin = (nxJson.plugins as Array<unknown>).find(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        'plugin' in p &&
        (p as { plugin: string }).plugin === '@nx-aws-plugin/nx-aws-cache',
    );

    expect(plugin).toBeDefined();
    expect(plugin).toMatchObject({
      plugin: '@nx-aws-plugin/nx-aws-cache',
      options: {
        awsRegion: 'eu-central-1',
        awsBucket: 'bucket-name/cache-folder',
      },
    });

    // Verify deprecated tasksRunnerOptions is NOT used (plugin uses official plugin API)
    if (nxJson.tasksRunnerOptions?.default) {
      expect(nxJson.tasksRunnerOptions.default.runner).not.toEqual('@nx-aws-plugin/nx-aws-cache');
    }

    // Verify the plugin is NOT configured in tasksRunnerOptions (deprecated approach)
    expect(nxJson.tasksRunnerOptions?.default?.runner).not.toBe('@nx-aws-plugin/nx-aws-cache');
  }, 120000);

  it('should init nx-aws-cache with no options using the plugin API', async () => {
    await runCommandAsync(`npx nx generate @nx-aws-plugin/nx-aws-cache:init`);

    const nxJson = readJson('nx.json');

    // Verify plugin is configured in plugins array
    expect(nxJson.plugins).toBeDefined();
    expect(Array.isArray(nxJson.plugins)).toBe(true);

    const plugin = (nxJson.plugins as Array<unknown>).find(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        'plugin' in p &&
        (p as { plugin: string }).plugin === '@nx-aws-plugin/nx-aws-cache',
    );

    expect(plugin).toBeDefined();
    expect(plugin).toMatchObject({
      plugin: '@nx-aws-plugin/nx-aws-cache',
    });

    // Verify plugin is configured in plugins array (not tasksRunnerOptions)
    const pluginObj = plugin as { plugin: string; options?: Record<string, unknown> };
    expect(pluginObj.plugin).toBe('@nx-aws-plugin/nx-aws-cache');

    // Verify deprecated tasksRunnerOptions is NOT used
    expect(nxJson.tasksRunnerOptions?.default?.runner).not.toBe('@nx-aws-plugin/nx-aws-cache');
  }, 120000);
});
