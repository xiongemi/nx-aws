export function stripConsoleColors(logs: string): string {
  return logs.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9]{1,3}(;[0-9]{1,2}){0,2}m/gu,
    '',
  );
}

export function logError(title: string, body: string) {
  console.error(title, body);
}

export function logInfo(title: string, body: string) {
  console.log(title, body);
}
