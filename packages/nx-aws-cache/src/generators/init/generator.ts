import { formatFiles, logger, Tree, updateJson, readJsonFile } from '@nx/devkit';

import { InitGeneratorSchema } from './schema';

function isCompatibleVersion(): boolean {
  try {
    const packageJson = readJsonFile('package.json');
    let version =
      packageJson.dependencies?.nx ??
      packageJson.devDependencies?.nx ??
      packageJson.dependencies?.['@nx/workspace'] ??
      packageJson.devDependencies?.['@nx/workspace'] ??
      packageJson.dependencies?.['@nrwl/workspace'] ??
      packageJson.devDependencies?.['@nrwl/workspace'];

    if (!version) {
      return false;
    }

    // Remove version prefix if present
    if (version.startsWith('^') || version.startsWith('~')) {
      version = version.substring(1);
    }

    const [major] = version.split('.');
    const majorNumber = Number.parseInt(major, 10);

    if (isNaN(majorNumber)) {
      return false;
    }

    // Support Nx 20 and above (plugin API introduced in Nx 20.4)
    // eslint-disable-next-line no-magic-numbers
    return majorNumber >= 20;
  } catch {
    // If we can't read package.json, assume incompatible
    return false;
  }
}

function updateNxJson(tree: Tree, options: InitGeneratorSchema): void {
  updateJson(tree, 'nx.json', (jsonContent) => {
    // Remove old tasksRunnerOptions if it exists (deprecated in Nx 20.4+)
    if (jsonContent.tasksRunnerOptions?.default?.runner === '@nx-aws-plugin/nx-aws-cache') {
      logger.warn(
        'Removing deprecated tasksRunnerOptions configuration. The plugin now uses the plugins array.',
      );
      delete jsonContent.tasksRunnerOptions.default;
      if (Object.keys(jsonContent.tasksRunnerOptions || {}).length === 0) {
        delete jsonContent.tasksRunnerOptions;
      }
    }

    // Initialize plugins array if it doesn't exist
    if (!jsonContent.plugins) {
      jsonContent.plugins = [];
    }

    // Check if plugin is already configured
    const pluginIndex = (jsonContent.plugins as Array<unknown>).findIndex(
      (plugin: unknown) =>
        typeof plugin === 'object' &&
        plugin !== null &&
        'plugin' in plugin &&
        (plugin as { plugin: string }).plugin === '@nx-aws-plugin/nx-aws-cache',
    );

    const pluginOptions: Record<string, unknown> = {};
    if (options.awsAccessKeyId) {
      pluginOptions.awsAccessKeyId = options.awsAccessKeyId;
    }
    if (options.awsSecretAccessKey) {
      pluginOptions.awsSecretAccessKey = options.awsSecretAccessKey;
    }
    if (options.awsProfile) {
      pluginOptions.awsProfile = options.awsProfile;
    }
    if (options.awsEndpoint) {
      pluginOptions.awsEndpoint = options.awsEndpoint;
    }
    if (options.awsRegion) {
      pluginOptions.awsRegion = options.awsRegion;
    }
    if (options.awsBucket) {
      pluginOptions.awsBucket = options.awsBucket;
    }
    if (options.awsForcePathStyle) {
      pluginOptions.awsForcePathStyle = options.awsForcePathStyle;
    }
    if (options.encryptionFileKey) {
      pluginOptions.encryptionFileKey = options.encryptionFileKey;
    }

    const pluginConfig = {
      plugin: '@nx-aws-plugin/nx-aws-cache',
      ...(Object.keys(pluginOptions).length > 0 ? { options: pluginOptions } : {}),
    };

    if (pluginIndex >= 0) {
      // Update existing plugin configuration
      const existingPlugin = (jsonContent.plugins as Array<unknown>)[pluginIndex] as {
        plugin: string;
        options?: Record<string, unknown>;
      };

      const updatedPlugin: { plugin: string; options?: Record<string, unknown> } = {
        ...existingPlugin,
        ...pluginConfig,
      };

      // Only merge options if there are new options to add
      if (Object.keys(pluginOptions).length > 0) {
        updatedPlugin.options = {
          ...existingPlugin.options,
          ...pluginOptions,
        };
      }

      (jsonContent.plugins as Array<unknown>)[pluginIndex] = updatedPlugin;
    } else {
      // Add new plugin configuration
      (jsonContent.plugins as Array<unknown>).push(pluginConfig);
    }

    return jsonContent;
  });
}

// eslint-disable-next-line func-names
export default async function (tree: Tree, options: InitGeneratorSchema) {
  if (!isCompatibleVersion()) {
    throw new Error(
      'This plugin requires Nx version 20 or later. Please upgrade your Nx workspace by running: npx nx migrate latest',
    );
  }

  updateNxJson(tree, options);

  await formatFiles(tree);
}
