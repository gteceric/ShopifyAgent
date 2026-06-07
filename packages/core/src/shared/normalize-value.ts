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
