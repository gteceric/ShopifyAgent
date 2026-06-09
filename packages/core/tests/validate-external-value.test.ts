import assert from "node:assert/strict";
import test from "node:test";
import {
  requireExternalPositiveInteger,
  requireExternalString,
} from "../src/shared/validate-external-value.js";

test("requires an external string while preserving its original value", () => {
  const errorFactory = () => new Error("external string is required");

  assert.equal(requireExternalString(" value ", errorFactory), " value ");
  assert.throws(
    () => requireExternalString("   ", errorFactory),
    /external string is required/,
  );
  assert.throws(
    () => requireExternalString(123, errorFactory),
    /external string is required/,
  );
});

test("requires an external positive integer", () => {
  const errorFactory = () => new Error("positive integer is required");

  assert.equal(requireExternalPositiveInteger(42, errorFactory), 42);
  assert.throws(
    () => requireExternalPositiveInteger(0, errorFactory),
    /positive integer is required/,
  );
  assert.throws(
    () => requireExternalPositiveInteger(1.5, errorFactory),
    /positive integer is required/,
  );
  assert.throws(
    () => requireExternalPositiveInteger("42", errorFactory),
    /positive integer is required/,
  );
});
