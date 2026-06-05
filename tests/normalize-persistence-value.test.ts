import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOptionalDate,
  normalizeOptionalString,
  normalizeRequiredDate,
  normalizeRequiredString,
} from "../src/persistence/normalize-persistence-value.js";

test("normalizes required and optional persistence strings", () => {
  assert.equal(normalizeRequiredString(" value ", "field"), "value");
  assert.equal(normalizeOptionalString(" value "), "value");
  assert.equal(normalizeOptionalString("   "), null);
  assert.equal(normalizeOptionalString(undefined), null);

  assert.throws(
    () => normalizeRequiredString("   ", "field"),
    /field is required\./,
  );
});

test("normalizes required and optional persistence dates", () => {
  const expectedDate = new Date("2026-06-06T00:00:00.000Z");

  assert.deepEqual(
    normalizeRequiredDate("2026-06-06T00:00:00.000Z", "field"),
    expectedDate,
  );
  assert.deepEqual(
    normalizeOptionalDate("2026-06-06T00:00:00.000Z", "field"),
    expectedDate,
  );
  assert.equal(normalizeOptionalDate(null, "field"), null);
  assert.equal(normalizeOptionalDate(undefined, "field"), null);

  assert.throws(
    () => normalizeRequiredDate("not-a-date", "field"),
    /field must be a valid date\./,
  );
});
