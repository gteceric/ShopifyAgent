const isNodeTestRun = process.env.NODE_ENV === "test";
const noop = () => {};

// keep logger silent during testing
export const logger: Pick<Console, "info" | "warn"> = isNodeTestRun
  ? { info: noop, warn: noop }
  : console;
