import { config as dotEnvConfig } from 'dotenv';

['.local.env', '.env.local', '.env'].forEach((file) => {
  dotEnvConfig({
    path: file,
  });
});

import { TaskStatus } from '@nx/workspace/src/tasks-runner/tasks-runner';
import { defaultTasksRunner, NxJsonConfiguration } from '@nx/devkit';

import { AwsNxCacheOptions } from './models/aws-nx-cache-options.model';
import { AwsCache } from './aws-cache';
import { Logger } from './logger';
import { MessageReporter } from './message-reporter';

// Store state across hooks
let currentRemoteCache: AwsCache | null = null;
let currentMessages: MessageReporter | null = null;

function getOptions(options: AwsNxCacheOptions) {
  return {
    awsAccessKeyId: process.env.NXCACHE_AWS_ACCESS_KEY_ID ?? options.awsAccessKeyId,
    awsSecretAccessKey: process.env.NXCACHE_AWS_SECRET_ACCESS_KEY ?? options.awsSecretAccessKey,
    awsProfile: process.env.NXCACHE_AWS_PROFILE ?? options.awsProfile,
    awsEndpoint: process.env.NXCACHE_AWS_ENDPOINT ?? options.awsEndpoint,
    awsRegion: process.env.NXCACHE_AWS_REGION ?? options.awsRegion,
    awsBucket: process.env.NXCACHE_AWS_BUCKET ?? options.awsBucket,
    awsForcePathStyle: process.env.NXCACHE_AWS_FORCE_PATH_STYLE
      ? process.env.NXCACHE_AWS_FORCE_PATH_STYLE === 'true'
      : options.awsForcePathStyle,
    encryptionFileKey:
      process.env.NX_CLOUD_ENCRYPTION_KEY ??
      process.env.NXCACHE_AWS_ENCRYPTION_KEY ??
      options.encryptionFileKey,
  };
}

export async function preTasksExecution(
  options: AwsNxCacheOptions,
  context: { nxJson: NxJsonConfiguration; workspaceRoot: string },
): Promise<void> {
  const logger = new Logger();

  // Validate environment
  if (process.env.NXCACHE_AWS_DISABLE === 'true') {
    if (!process.env.NX_SKIP_NX_CACHE) {
      logger.note('USING LOCAL CACHE (NXCACHE_AWS_DISABLE is set to true)');
      process.env.NX_SKIP_NX_CACHE = 'true';
    }
    return;
  }

  // Validate AWS options
  const awsOptions: AwsNxCacheOptions = getOptions(options);
  const awsCache = new AwsCache(awsOptions, new MessageReporter(logger));

  try {
    awsCache.checkConfig(awsOptions);
  } catch (err) {
    logger.warn((err as Error).message);
    logger.note('USING LOCAL CACHE');
    process.env.NX_SKIP_NX_CACHE = 'true';
    return;
  }

  // Initialize remote cache
  // Note: The remote cache will be provided via the tasks runner for backward compatibility
  // In the new plugin API, remote cache should be configured through other means
  if (!process.env.NX_SKIP_NX_CACHE) {
    logger.note('USING REMOTE CACHE');
    currentMessages = new MessageReporter(logger);
    currentRemoteCache = new AwsCache(awsOptions, currentMessages);
  }
}

export async function postTasksExecution(
  options: AwsNxCacheOptions,
  context: {
    nxJson: NxJsonConfiguration;
    workspaceRoot: string;
    taskResults: { [taskId: string]: TaskStatus };
  },
): Promise<void> {
  if (currentRemoteCache && currentMessages) {
    await currentRemoteCache.waitForStoreRequestsToComplete();
    currentMessages.printMessages();

    // Clean up state
    currentRemoteCache = null;
    currentMessages = null;
  }
}

// Keep the old export for backward compatibility during migration
// eslint-disable-next-line max-lines-per-function
export const tasksRunner = (
  tasks: Parameters<typeof defaultTasksRunner>[0],
  options: Parameters<typeof defaultTasksRunner>[1] & AwsNxCacheOptions,
  // eslint-disable-next-line no-magic-numbers
  context: Parameters<typeof defaultTasksRunner>[2],
) => {
  const awsOptions: AwsNxCacheOptions = getOptions(options);
  const logger = new Logger();

  try {
    if (process.env.NXCACHE_AWS_DISABLE === 'true') {
      if (!options.skipNxCache) {
        logger.note('USING LOCAL CACHE (NXCACHE_AWS_DISABLE is set to true)');
      }

      return defaultTasksRunner(tasks, options, context);
    }

    if (!options.skipNxCache) {
      logger.note('USING REMOTE CACHE');
    }

    const messages = new MessageReporter(logger);
    const remoteCache = new AwsCache(awsOptions, messages);

    const runner: Promise<{ [id: string]: TaskStatus }> = defaultTasksRunner(
      tasks,
      {
        ...options,
        remoteCache,
      },
      context,
    ) as Promise<{ [id: string]: TaskStatus }>;

    runner.finally(async () => {
      await remoteCache.waitForStoreRequestsToComplete();
      messages.printMessages();
    });

    return runner;
  } catch (err) {
    logger.warn((err as Error).message);
    logger.note('USING LOCAL CACHE');

    return defaultTasksRunner(tasks, options, context);
  }
};

export default tasksRunner;
