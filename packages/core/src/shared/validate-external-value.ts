export function requireExternalString(
  value: unknown,
  errorFactory: () => Error,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw errorFactory();
  }

  return value;
}

export function requireExternalPositiveInteger(
  value: unknown,
  errorFactory: () => Error,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw errorFactory();
  }

  return value;
}
