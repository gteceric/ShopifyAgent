export function readTimeoutMs(
  value: string | undefined,
  defaultValue: number,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
