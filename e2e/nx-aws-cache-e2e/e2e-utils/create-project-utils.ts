import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import { getPackageManagerCommand, runCLI, RunCmdOpts } from './command-utils';
import { logError, logInfo } from './log-utils';

let projName: string;

export function tmpProjPath(path?: string): string {
  const base = join(tmpdir(), 'nx-e2e', 'nx-aws-cache');
  mkdirSync(base, { recursive: true });
  return path ? join(base, projName ?? 'proj', path) : join(base, projName ?? 'proj');
}

export function uniq(prefix: string): string {
  const randomSevenDigitNumber = Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(7, '0');
  return `${prefix}${randomSevenDigitNumber}`;
}

export function newProject({ name = uniq('proj') } = {}): string {
  const newProjectStart = performance.mark('new-project:start');
  try {
    const projScope = 'proj';
    const projectDirectory = tmpProjPath();
    mkdirSync(projectDirectory, { recursive: true });

    // Create a minimal Nx workspace using the local CLI
    const createWorkspaceStart = performance.mark('create-nx-workspace:start');
    const pm = getPackageManagerCommand({ path: projectDirectory });
    execSync(
      `${pm.exec} create-nx-workspace@latest ${projScope} --preset=ts --no-nxCloud --packageManager=npm --nxWorkspaceRoot=${projectDirectory}`,
      {
        cwd: projectDirectory,
        stdio: 'inherit',
      },
    );
    const createWorkspaceEnd = performance.mark('create-nx-workspace:end');
    const createNxWorkspaceMeasure = performance.measure(
      'create-nx-workspace',
      createWorkspaceStart.name,
      createWorkspaceEnd.name,
    );

    // Install the local plugin into the new workspace
    const packageInstallStart = performance.mark('packageInstall:start');
    const pkgJsonPath = join(projectDirectory, 'package.json');
    const pkgJson = readJsonFile(pkgJsonPath);
    pkgJson.devDependencies['@nx-aws-plugin/nx-aws-cache'] =
      'file:../../../dist/packages/nx-aws-cache';
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
    execSync(pm.install, {
      cwd: projectDirectory,
      stdio: 'inherit',
    });
    const packageInstallEnd = performance.mark('packageInstall:end');
    const packageInstallMeasure = performance.measure(
      'packageInstall',
      packageInstallStart.name,
      packageInstallEnd.name,
    );

    // Stop the daemon
    try {
      execSync(`${pm.runNx} reset`, {
        cwd: projectDirectory,
        stdio: 'inherit',
      });
    } catch {}

    projName = name;

    const newProjectEnd = performance.mark('new-project:end');
    const perfMeasure = performance.measure('newProject', newProjectStart.name, newProjectEnd.name);

    logInfo(
      'NX',
      `E2E created a project: ${projectDirectory} in ${perfMeasure.duration / 1000} seconds
create-nx-workspace: ${createNxWorkspaceMeasure.duration / 1000} seconds
packageInstall: ${packageInstallMeasure.duration / 1000} seconds`,
    );

    return projScope;
  } catch (e: any) {
    logError(`Failed to set up project for e2e tests.`, e.message ?? String(e));
    throw e;
  }
}

export function cleanupProject({ skipReset, ...opts }: RunCmdOpts & { skipReset?: boolean } = {}) {
  try {
    if (!skipReset) {
      runCLI('reset', opts);
    }
  } catch {}
  try {
    rmSync(tmpProjPath(), { recursive: true, force: true });
  } catch {}
}
