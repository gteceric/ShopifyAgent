export function isExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return expiresAt !== null && expiresAt !== undefined && expiresAt <= now;
}

export function requireNotExpired(
  expiresAt: Date | null | undefined,
  now: Date,
  errorFactory: () => Error,
): void {
  if (isExpired(expiresAt, now)) {
    throw errorFactory();
  }
}
