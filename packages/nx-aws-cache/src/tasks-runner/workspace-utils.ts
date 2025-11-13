import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { workspaceRoot as nxWorkspaceRoot } from '@nx/devkit';

/**
 * Gets the workspace ID for the current Nx workspace.
 * The workspace ID is used to identify the database file in .nx/workspace-data/
 *
 * @param workspaceRootPath - The root path of the workspace
 * @returns The workspace ID string
 * @throws Error if workspace ID cannot be determined
 */
export function getWorkspaceId(workspaceRootPath: string = nxWorkspaceRoot): string {
  const workspaceDataPath = join(workspaceRootPath, '.nx', 'workspace-data');

  if (!existsSync(workspaceDataPath)) {
    throw new Error(
      `Workspace data directory not found at ${workspaceDataPath}. Make sure you're running this in an Nx workspace.`,
    );
  }

  // Look for .db files in workspace-data directory
  // The workspace ID is the filename without the .db extension
  const files = readdirSync(workspaceDataPath);

  // Find .db files (excluding .db-wal and .db-shm)
  const dbFiles = files.filter(
    (file) => file.endsWith('.db') && !file.endsWith('.db-wal') && !file.endsWith('.db-shm'),
  );

  if (dbFiles.length === 0) {
    // If no .db file exists yet, Nx will create one on first run
    // We can derive a workspace ID from the workspace root path hash or use a default
    // For now, we'll use a hash of the workspace root path
    const crypto = require('crypto');
    const hashLength = 16;
    const hash = crypto
      .createHash('sha256')
      .update(workspaceRootPath)
      .digest('hex')
      .substring(0, hashLength);
    return hash;
  }

  if (dbFiles.length > 1) {
    // Multiple .db files found - this shouldn't happen, but if it does, use the most recent one
    const dbFilesWithStats = dbFiles.map((file) => {
      const filePath = join(workspaceDataPath, file);
      const stats = statSync(filePath);
      return { file, mtime: stats.mtime.getTime() };
    });

    dbFilesWithStats.sort((fileA, fileB) => fileB.mtime - fileA.mtime);
    const workspaceId = dbFilesWithStats[0].file.replace('.db', '');
    return workspaceId;
  }

  // Single .db file found - extract workspace ID
  const workspaceId = dbFiles[0].replace('.db', '');
  return workspaceId;
}

/**
 * Gets the path to the workspace data directory
 *
 * @param workspaceRootPath - The root path of the workspace
 * @returns The path to .nx/workspace-data/
 */
export function getWorkspaceDataPath(workspaceRootPath: string | undefined = nxWorkspaceRoot): string {
  return join(workspaceRootPath, '.nx', 'workspace-data');
}
