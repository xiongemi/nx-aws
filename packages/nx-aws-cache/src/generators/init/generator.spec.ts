import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readJson } from '@nx/devkit';

import generator from './generator';
import { InitGeneratorSchema } from './schema';

describe('init generator', () => {
  let appTree: Tree;
  const options: InitGeneratorSchema = {
    awsRegion: 'eu-central-1',
    awsBucket: 'bucket-name',
  };

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace();
  });

  it('should add @nx-aws-plugin/nx-aws-cache to nx.json plugins array', async () => {
    let nxJson = readJson(appTree, 'nx.json');
    // TasksRunnerOptions may not exist in empty workspace, check if it exists first
    if (nxJson.tasksRunnerOptions?.default) {
      expect(nxJson.tasksRunnerOptions.default.runner).toBe('nx/tasks-runners/default');
    }

    await generator(appTree, options);

    nxJson = readJson(appTree, 'nx.json');

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
        awsBucket: 'bucket-name',
      },
    });

    // Verify old tasksRunnerOptions is not set to the plugin
    if (nxJson.tasksRunnerOptions?.default) {
      expect(nxJson.tasksRunnerOptions.default.runner).not.toEqual('@nx-aws-plugin/nx-aws-cache');
    }
  });

  it('should add @nx-aws-plugin/nx-aws-cache with no aws options to nx.json plugins array', async () => {
    let nxJson = readJson(appTree, 'nx.json');
    // TasksRunnerOptions may not exist in empty workspace, check if it exists first
    if (nxJson.tasksRunnerOptions?.default) {
      expect(nxJson.tasksRunnerOptions.default.runner).toBe('nx/tasks-runners/default');
    }

    await generator(appTree, {});

    nxJson = readJson(appTree, 'nx.json');

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

    // Plugin should not have options if none were provided
    const pluginObj = plugin as { plugin: string; options?: Record<string, unknown> };
    // When no options are provided, the plugin config should not include an options property
    // (or options should be empty/undefined)
    expect(pluginObj.plugin).toBe('@nx-aws-plugin/nx-aws-cache');
    // Options may not exist at all, or if they do, awsRegion and awsBucket should not be set
    if (pluginObj.options) {
      expect(pluginObj.options.awsRegion).toBeUndefined();
      expect(pluginObj.options.awsBucket).toBeUndefined();
    }
  });
});
