import {
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeRequiredString,
} from "./normalize-value.js";

export function readOptionalStringEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return normalizeOptionalString(env[name]);
}

export function readRequiredStringEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return normalizeRequiredString(env[name], name);
}

export function readOptionalPositiveIntegerEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const value = readOptionalStringEnv(name, env);

  if (value === undefined) {
    return undefined;
  }

  return normalizePositiveInteger(Number(value), name);
}
