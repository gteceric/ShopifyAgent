import assert from "node:assert/strict";
import test from "node:test";
import {
  readOptionalPositiveIntegerEnv,
  readOptionalStringEnv,
  readRequiredStringEnv,
} from "../src/shared/read-env.js";

test("reads required and optional string environment values", () => {
  const env = {
    REQUIRED_VALUE: " required ",
    OPTIONAL_VALUE: " optional ",
    BLANK_VALUE: "   ",
  };

  assert.equal(readRequiredStringEnv("REQUIRED_VALUE", env), "required");
  assert.equal(readOptionalStringEnv("OPTIONAL_VALUE", env), "optional");
  assert.equal(readOptionalStringEnv("BLANK_VALUE", env), undefined);
  assert.equal(readOptionalStringEnv("MISSING_VALUE", env), undefined);
  assert.throws(
    () => readRequiredStringEnv("BLANK_VALUE", env),
    /BLANK_VALUE is required\./,
  );
});

test("reads optional positive integer environment values", () => {
  const env = {
    VALID_VALUE: " 25 ",
    BLANK_VALUE: "   ",
    INVALID_VALUE: "0",
  };

  assert.equal(readOptionalPositiveIntegerEnv("VALID_VALUE", env), 25);
  assert.equal(readOptionalPositiveIntegerEnv("BLANK_VALUE", env), undefined);
  assert.equal(readOptionalPositiveIntegerEnv("MISSING_VALUE", env), undefined);
  assert.throws(
    () => readOptionalPositiveIntegerEnv("INVALID_VALUE", env),
    /INVALID_VALUE must be a positive integer\./,
  );
});
