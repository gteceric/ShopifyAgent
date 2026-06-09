import assert from "node:assert/strict";
import test from "node:test";
import { getErrorMessage } from "../src/shared/error.js";

test("gets messages from Error instances and unknown thrown values", () => {
  assert.equal(getErrorMessage(new Error("request failed")), "request failed");
  assert.equal(getErrorMessage("request failed"), "request failed");
  assert.equal(getErrorMessage(503), "503");
});
