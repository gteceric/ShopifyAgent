import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOptionalString,
  normalizeRequiredString,
} from "../src/shared/normalize-value.js";

test("normalizes required core strings", () => {
  assert.equal(normalizeRequiredString(" value ", "fieldName"), "value");
  assert.throws(
    () => normalizeRequiredString("   ", "fieldName"),
    /fieldName is required\./,
  );
  assert.throws(
    () => normalizeRequiredString(undefined, "fieldName"),
    /fieldName is required\./,
  );
});

test("normalizes optional core strings to string or undefined", () => {
  assert.equal(normalizeOptionalString(" value "), "value");
  assert.equal(normalizeOptionalString("   "), undefined);
  assert.equal(normalizeOptionalString(null), undefined);
  assert.equal(normalizeOptionalString(undefined), undefined);
});
