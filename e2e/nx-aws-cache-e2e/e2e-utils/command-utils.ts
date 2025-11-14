import { execSync, ExecSyncOptions } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpProjPath } from './create-project-utils';
import { fileExists, readJson } from './file-utils';
import { logError, stripConsoleColors } from './log-utils';

export interface RunCmdOpts {
  silenceError?: boolean;
  env?: Record<string, string | undefined>;
  cwd?: string;
  silent?: boolean;
  verbose?: boolean;
  redirectStderr?: boolean;
}

export function runCommand(
  command: string,
  options?: Partial<ExecSyncOptions> & { failOnError?: boolean },
): string {
  const { failOnError, ...childProcessOptions } = options ?? {};
  try {
    const r = execSync(command, {
      cwd: tmpProjPath(),
      stdio: 'pipe',
      env: {
        ...process.env,
        FORCE_COLOR: 'false',
      },
      encoding: 'utf-8',
      ...childProcessOptions,
    });
    return r as string;
  } catch (e: any) {
    logError(`Original command: ${command}`, `${e.stdout}\n\n${e.stderr}`);
    if (!failOnError && (e.stdout || e.stderr)) {
      return e.stdout + e.stderr;
    }
    throw e;
  }
}

export function getPackageManagerCommand({
  path = tmpProjPath(),
  packageManager = detectPackageManager(path),
} = {}) {
  const isYarnWorkspace = fileExists(join(path, 'package.json'))
    ? readJson('package.json').workspaces
    : false;
  const isPnpmWorkspace = existsSync(join(path, 'pnpm-workspace.yaml'));

  return {
    npm: {
      run: (script: string, args: string) => `npm run ${script} -- ${args}`,
      runNx: `npx nx`,
      runNxSilent: `npx nx`,
      install: 'npm install',
      ciInstall: 'npm ci',
      addProd: `npm install`,
      addDev: `npm install -D`,
      list: 'npm ls --depth 10',
      exec: 'npx',
    },
    yarn: {
      run: (script: string, args: string) => `yarn ${script} ${args}`,
      runNx: `yarn nx`,
      runNxSilent: `yarn nx`,
      install: 'yarn',
      ciInstall: 'yarn --frozen-lockfile',
      addProd: isYarnWorkspace ? 'yarn add -W' : 'yarn add',
      addDev: isYarnWorkspace ? 'yarn add -DW' : 'yarn add -D',
      list: 'yarn list --pattern',
      exec: 'yarn',
    },
    pnpm: {
      run: (script: string, args: string) => `pnpm run ${script} -- ${args}`,
      runNx: `pnpm exec nx`,
      runNxSilent: `pnpm exec nx`,
      install: 'pnpm install --no-frozen-lockfile',
      ciInstall: 'pnpm install --frozen-lockfile',
      addProd: isPnpmWorkspace ? 'pnpm add -w' : 'pnpm add',
      addDev: isPnpmWorkspace ? 'pnpm add -Dw' : 'pnpm add -D',
      list: 'pnpm ls --depth 10',
      exec: 'pnpm exec',
    },
  }[packageManager.trim() as 'npm' | 'yarn' | 'pnpm'];
}

export function detectPackageManager(dir = ''): 'npm' | 'yarn' | 'pnpm' {
  return existsSync(join(dir, 'yarn.lock'))
    ? 'yarn'
    : existsSync(join(dir, 'pnpm-lock.yaml')) || existsSync(join(dir, 'pnpm-workspace.yaml'))
      ? 'pnpm'
      : 'npm';
}

export function runCLI(
  command: string,
  opts: RunCmdOpts = {
    silenceError: false,
    env: undefined,
    verbose: undefined,
    redirectStderr: undefined,
  },
): string {
  try {
    const pm = getPackageManagerCommand();
    const commandToRun = `${pm.runNxSilent} ${command} ${
      opts.verbose ? ' --verbose' : ''
    }${opts.redirectStderr ? ' 2>&1' : ''}`;
    const logs = execSync(commandToRun, {
      cwd: opts.cwd || tmpProjPath(),
      env: {
        ...process.env,
      },
      encoding: 'utf-8',
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
    });

    const r = stripConsoleColors(logs);

    return r;
  } catch (e: any) {
    if (opts.silenceError) {
      return stripConsoleColors(e.stdout + e.stderr);
    }
    logError(`Original command: ${command}`, `${e.stdout}\n\n${e.stderr}`);
    throw e;
  }
}
