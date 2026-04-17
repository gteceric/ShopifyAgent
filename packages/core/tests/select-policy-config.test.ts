import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_POLICY } from "../src/domain/refund-policy.js";
import { selectPolicyConfig } from "../src/domain/select-policy-config.js";

test("returns the default policy when no policy env vars are set", () => {
  const config = selectPolicyConfig({});

  assert.deepEqual(config, DEFAULT_POLICY);
});

test("uses env overrides for policy windows and high-value threshold", () => {
  const config = selectPolicyConfig({
    REFUND_WINDOW_DAYS: "45",
    CANCEL_WINDOW_DAYS: "14",
    HIGH_VALUE_ORDER_THRESHOLD: "500.5",
  });

  assert.equal(config.refundWindowDays, 45);
  assert.equal(config.cancelWindowDays, 14);
  assert.equal(config.highValueOrderThreshold, 500.5);
  assert.equal(
    config.alreadyFullyRefundedDecision,
    DEFAULT_POLICY.alreadyFullyRefundedDecision,
  );
});

test("throws when a policy env var is invalid", () => {
  assert.throws(
    () =>
      selectPolicyConfig({
        HIGH_VALUE_ORDER_THRESHOLD: "not-a-number",
      }),
    /HIGH_VALUE_ORDER_THRESHOLD must be a non-negative number when set\./,
  );
});
