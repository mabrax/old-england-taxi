/** Accept UTC ISO timestamps with optional millisecond precision, without date rollover. */
export function isUtcTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (match === null) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
}
