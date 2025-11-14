import { parseJson } from '@nx/devkit';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpProjPath } from './create-project-utils';

export function createFile(f: string, content = ''): void {
  const p = tmpProjPath(f);
  writeFileSync(p, '');
  if (content) {
    updateFile(f, content);
  }
}

export function updateFile(f: string, content: string | ((content: string) => string)): void {
  mkdirSync(dirname(tmpProjPath(f)), { recursive: true });
  if (typeof content === 'string') {
    writeFileSync(tmpProjPath(f), content);
  } else {
    writeFileSync(tmpProjPath(f), content(readFileSync(tmpProjPath(f)).toString()));
  }
}

export function checkFilesExist(...expectedFiles: string[]) {
  expectedFiles.forEach((f) => {
    const ff = f.startsWith('/') ? f : tmpProjPath(f);
    if (!exists(ff)) {
      throw new Error(`File '${ff}' does not exist`);
    }
  });
}

export function updateJson<T extends object = any, U extends object = T>(
  f: string,
  updater: (value: T) => U,
) {
  updateFile(f, (s) => {
    const json = JSON.parse(s);
    return JSON.stringify(updater(json), null, 2);
  });
}

export function readJson<T extends object = any>(f: string): T {
  const content = readFile(f);
  return parseJson<T>(content);
}

export function readFile(f: string) {
  const ff = f.startsWith('/') ? f : tmpProjPath(f);
  return readFileSync(ff, 'utf-8');
}

export function directoryExists(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function exists(filePath: string): boolean {
  return directoryExists(filePath) || fileExists(filePath);
}
