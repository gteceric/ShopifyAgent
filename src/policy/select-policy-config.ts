import { DEFAULT_POLICY } from "./refund-policy.js";
import type { RefundPolicyConfig } from "./refund-policy.types.js";

function readOptionalNonNegativeIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): number | undefined {
  const rawValue = env[name]?.trim();

  if (!rawValue) {
    return undefined;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer when set.`);
  }

  return value;
}

function readOptionalNonNegativeNumberEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): number | undefined {
  const rawValue = env[name]?.trim();

  if (!rawValue) {
    return undefined;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number when set.`);
  }

  return value;
}

export function selectPolicyConfig(
  env: NodeJS.ProcessEnv = process.env,
): RefundPolicyConfig {
  const refundWindowDays = readOptionalNonNegativeIntegerEnv(
    env,
    "REFUND_WINDOW_DAYS",
  );
  const cancelWindowDays = readOptionalNonNegativeIntegerEnv(
    env,
    "CANCEL_WINDOW_DAYS",
  );
  const highValueOrderThreshold = readOptionalNonNegativeNumberEnv(
    env,
    "HIGH_VALUE_ORDER_THRESHOLD",
  );

  return {
    ...DEFAULT_POLICY,
    ...(refundWindowDays === undefined ? {} : { refundWindowDays }),
    ...(cancelWindowDays === undefined ? {} : { cancelWindowDays }),
    ...(highValueOrderThreshold === undefined
      ? {}
      : { highValueOrderThreshold }),
  };
}
