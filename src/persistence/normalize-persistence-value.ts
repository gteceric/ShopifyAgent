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
): string | null {
  const normalizedValue = value?.trim();

  return normalizedValue || null;
}

export function normalizeRequiredDate(
  value: Date | string,
  fieldName: string,
): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

export function normalizeOptionalDate(
  value: Date | string | null | undefined,
  fieldName: string,
): Date | null {
  return value === null || value === undefined
    ? null
    : normalizeRequiredDate(value, fieldName);
}
