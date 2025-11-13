/**
 * Nx Plugin for AWS S3 Remote Cache
 *
 * This package is an Nx plugin that provides AWS S3 as a remote cache for Nx workspaces.
 * It uses the official Nx plugin API with preTasksExecution and postTasksExecution hooks.
 *
 * Configuration in nx.json:
 * {
 *   "plugins": [
 *     {
 *       "plugin": "@nx-aws-plugin/nx-aws-cache",
 *       "options": {
 *         "awsRegion": "eu-central-1",
 *         "awsBucket": "bucket-name",
 *         ...
 *       }
 *     }
 *   ]
 * }
 *
 * @see https://nx.dev/docs/extending-nx/intro
 * @see https://nx.dev/docs/reference/deprecated/custom-tasks-runner
 */

// Export plugin hooks - Nx will automatically discover and call these
// These hooks are part of the official Nx plugin API
export { preTasksExecution, postTasksExecution } from './tasks-runner/runner';

// Note: The tasks runner is kept internally for backward compatibility
// But should not be used directly. Use the plugin configuration instead.
