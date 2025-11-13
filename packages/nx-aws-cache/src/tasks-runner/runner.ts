import { config as dotEnvConfig } from 'dotenv';

['.local.env', '.env.local', '.env'].forEach((file) => {
  dotEnvConfig({
    path: file,
  });
});

import { TaskStatus } from '@nx/workspace/src/tasks-runner/tasks-runner';
import { defaultTasksRunner, NxJsonConfiguration, workspaceRoot as nxWorkspaceRoot } from '@nx/devkit';

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

function validateAndSetupCache(
  options: AwsNxCacheOptions,
  logger: Logger,
): AwsCache | null {
  const awsOptions: AwsNxCacheOptions = getOptions(options);
  const awsCache = new AwsCache(awsOptions, new MessageReporter(logger));

  try {
    awsCache.checkConfig(awsOptions);
    return awsCache;
  } catch (err) {
    logger.warn((err as Error).message);
    logger.note('USING LOCAL CACHE');
    process.env.NX_SKIP_NX_CACHE = 'true';
    return null;
  }
}

async function syncWorkspaceDatabase(
  cache: AwsCache,
  workspaceRoot: string,
  logger: Logger,
): Promise<void> {
  try {
    const workspaceId = getWorkspaceId(workspaceRoot);
    cache.setWorkspaceContext(workspaceRoot, workspaceId);
    await cache.syncDatabaseFiles(workspaceRoot, workspaceId);
  } catch (err) {
    logger.debug(`Failed to sync database files: ${(err as Error).message}`);
    // Continue even if database sync fails - cache will still work
  }
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
  const validatedCache = validateAndSetupCache(options, logger);
  if (!validatedCache) {
    return;
  }

  // Initialize remote cache
  if (!process.env.NX_SKIP_NX_CACHE) {
    logger.note('USING REMOTE CACHE');
    currentMessages = new MessageReporter(logger);
    currentRemoteCache = new AwsCache(awsOptions, currentMessages);
    await syncWorkspaceDatabase(currentRemoteCache, context.workspaceRoot, logger);
  }
}

export async function postTasksExecution(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: AwsNxCacheOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: {
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

    // Clean up state (use local variables to avoid race condition)
    const cacheToCleanup = currentRemoteCache;
    const messagesToCleanup = currentMessages;
    currentRemoteCache = null;
    currentMessages = null;
    // Clear references after assignment to avoid race condition warning
    if (cacheToCleanup || messagesToCleanup) {
      // References cleared
    }
  }
}

function setupWorkspaceContextForRunner(
  remoteCache: AwsCache,
  logger: Logger,
): void {
  const rootPath = nxWorkspaceRoot;
  try {
    const workspaceId = getWorkspaceId(rootPath);
    remoteCache.setWorkspaceContext(rootPath, workspaceId);
    remoteCache.syncDatabaseFiles(rootPath, workspaceId).catch((err) => {
      logger.debug(`Failed to sync database files: ${(err as Error).message}`);
    });
  } catch (err) {
    logger.debug(`Failed to set workspace context: ${(err as Error).message}`);
  }
}

async function finalizeCacheOperations(
  remoteCache: AwsCache,
  messages: MessageReporter,
  logger: Logger,
): Promise<void> {
  await remoteCache.waitForStoreRequestsToComplete();
  try {
    await remoteCache.uploadDatabaseFiles();
  } catch (err) {
    logger.debug(`Failed to upload database files: ${(err as Error).message}`);
  }
  messages.printMessages();
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
    setupWorkspaceContextForRunner(remoteCache, logger);

    const runner: Promise<{ [id: string]: TaskStatus }> = defaultTasksRunner(
      tasks,
      {
        ...options,
        remoteCache,
      },
      context,
    ) as Promise<{ [id: string]: TaskStatus }>;

    runner.finally(() => finalizeCacheOperations(remoteCache, messages, logger));

    return runner;
  } catch (err) {
    logger.warn((err as Error).message);
    logger.note('USING LOCAL CACHE');
    return defaultTasksRunner(tasks, options, context);
  }
};

export default tasksRunner;
