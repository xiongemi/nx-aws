import { cleanupProject, newProject, readJson, runCLI } from '../e2e-utils';

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
    // Create a fresh TS workspace for the plugin tests.
    newProject();
  });

  afterAll(() => cleanupProject());

  it('should init nx-aws-cache with plugin configuration using the official plugin API', () => {
    runCLI(
      `generate @nx-aws-plugin/nx-aws-cache:init --awsRegion=eu-central-1 --awsBucket=bucket-name/cache-folder --no-interactive`,
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
  }, 120_000);

  it('should init nx-aws-cache with no options using the plugin API', () => {
    runCLI(`generate @nx-aws-plugin/nx-aws-cache:init --no-interactive`);

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
    const pluginObj = plugin as {
      plugin: string;
      options?: Record<string, unknown>;
    };
    expect(pluginObj.plugin).toBe('@nx-aws-plugin/nx-aws-cache');

    // Verify deprecated tasksRunnerOptions is NOT used
    expect(nxJson.tasksRunnerOptions?.default?.runner).not.toBe('@nx-aws-plugin/nx-aws-cache');
  }, 120_000);
});
