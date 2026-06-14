const isNodeTestRun = process.env.NODE_ENV === "test";
const noop = () => {};

// keep logger silent during testing
export const logger: Pick<Console, "error" | "info" | "warn"> = isNodeTestRun
  ? { error: noop, info: noop, warn: noop }
  : console;
