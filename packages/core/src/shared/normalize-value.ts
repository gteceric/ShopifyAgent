export function normalizeRequiredString(
  value: string | null | undefined,
  fieldName: string,
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

export function normalizeOptionalString(
  value: string | null | undefined,
): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue || undefined;
}

export function normalizePositiveInteger(
  value: number,
  fieldName: string,
): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return value;
}
