import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOptionalString,
  normalizePositiveInteger,
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

test("normalizes positive integers", () => {
  assert.equal(normalizePositiveInteger(25, "limit"), 25);
  assert.throws(
    () => normalizePositiveInteger(0, "limit"),
    /limit must be a positive integer\./,
  );
  assert.throws(
    () => normalizePositiveInteger(1.5, "limit"),
    /limit must be a positive integer\./,
  );
});
