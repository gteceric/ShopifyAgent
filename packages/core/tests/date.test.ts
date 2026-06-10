import assert from "node:assert/strict";
import test from "node:test";
import { isExpired, requireNotExpired } from "../src/shared/date.js";

test("detects whether an optional expiration date has passed", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");

  assert.equal(isExpired(new Date("2026-06-08T23:59:59.000Z"), now), true);
  assert.equal(isExpired(now, now), true);
  assert.equal(isExpired(new Date("2026-06-09T00:00:01.000Z"), now), false);
  assert.equal(isExpired(null, now), false);
  assert.equal(isExpired(undefined, now), false);
});

test("requires an optional expiration date not to be expired", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");

  assert.doesNotThrow(() =>
    requireNotExpired(new Date("2026-06-09T00:00:01.000Z"), now, () => {
      return new Error("Token expired.");
    }),
  );
  assert.doesNotThrow(() =>
    requireNotExpired(null, now, () => {
      return new Error("Token expired.");
    }),
  );
  assert.throws(
    () =>
      requireNotExpired(now, now, () => {
        return new Error("Token expired.");
      }),
    /Token expired\./,
  );
});
