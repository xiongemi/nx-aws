import { config as dotEnvConfig } from 'dotenv';

['.local.env', '.env.local', '.env'].forEach((file) => {
  dotEnvConfig({
    path: file,
  });
});

import { TaskStatus } from '@nx/workspace/src/tasks-runner/tasks-runner';
import { defaultTasksRunner, NxJsonConfiguration, workspaceRoot } from '@nx/devkit';

import { AwsNxCacheOptions } from './models/aws-nx-cache-options.model';
import { AwsCache } from './aws-cache';
import { Logger } from './logger';
import { MessageReporter } from './message-reporter';
import { getWorkspaceId } from './workspace-utils';

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
  if (!process.env.NX_SKIP_NX_CACHE) {
    logger.note('USING REMOTE CACHE');
    currentMessages = new MessageReporter(logger);
    currentRemoteCache = new AwsCache(awsOptions, currentMessages);

    // Get workspace ID and sync database files for Nx 20+ database-driven cache
    try {
      const workspaceId = getWorkspaceId(context.workspaceRoot);
      currentRemoteCache.setWorkspaceContext(context.workspaceRoot, workspaceId);

      // Sync database files from S3 before tasks run
      // This allows Nx to query the database for cache entries
      await currentRemoteCache.syncDatabaseFiles(context.workspaceRoot, workspaceId);
    } catch (err) {
      logger.debug(`Failed to sync database files: ${(err as Error).message}`);
      // Continue even if database sync fails - cache will still work
    }
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
    // Wait for all cache file uploads to complete
    await currentRemoteCache.waitForStoreRequestsToComplete();

    // Upload database files after all cache operations are complete
    // This ensures the database in S3 reflects all cache entries
    try {
      await currentRemoteCache.uploadDatabaseFiles();
    } catch (err) {
      const logger = new Logger();
      logger.debug(`Failed to upload database files: ${(err as Error).message}`);
      // Continue even if database upload fails
    }

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

    // Set workspace context and sync database files for Nx 20+ database-driven cache
    // Use workspaceRoot from @nx/devkit which provides the workspace root path
    const workspaceRootPath = workspaceRoot;
    try {
      const workspaceId = getWorkspaceId(workspaceRootPath);
      remoteCache.setWorkspaceContext(workspaceRootPath, workspaceId);

      // Sync database files from S3 before tasks run (fire and forget)
      // This allows Nx to query the database for cache entries
      remoteCache.syncDatabaseFiles(workspaceRootPath, workspaceId).catch((err) => {
        logger.debug(`Failed to sync database files: ${(err as Error).message}`);
      });
    } catch (err) {
      logger.debug(`Failed to set workspace context: ${(err as Error).message}`);
      // Continue even if workspace context setup fails - cache will still work
    }

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

      // Upload database files after all cache operations are complete
      try {
        await remoteCache.uploadDatabaseFiles();
      } catch (err) {
        logger.debug(`Failed to upload database files: ${(err as Error).message}`);
      }

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
