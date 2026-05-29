import test from "node:test";
import assert from "node:assert/strict";

import {
  RefundProcessingStatus,
  deriveRefundProcessingStatusFromTransactions,
  hasPendingOrderRefundTransaction,
  hasPendingRefundTransaction,
} from "../src/domain/refund-processing-status.js";

test("derives refund processing status from transaction statuses", () => {
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([]),
    RefundProcessingStatus.Unknown,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: "SUCCESS" }]),
    RefundProcessingStatus.Succeeded,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: "PENDING" }]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: " pending " }]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: "PROCESSING" }]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: "FAILURE" }]),
    RefundProcessingStatus.Failed,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([{ status: " error " }]),
    RefundProcessingStatus.Failed,
  );
  assert.equal(
    deriveRefundProcessingStatusFromTransactions([
      { status: "FAILURE" },
      { status: "PENDING" },
    ]),
    RefundProcessingStatus.Pending,
  );
});

test("detects pending refund transactions", () => {
  assert.equal(hasPendingRefundTransaction([]), false);
  assert.equal(hasPendingRefundTransaction([{ status: "SUCCESS" }]), false);
  assert.equal(hasPendingRefundTransaction([{ status: " processing " }]), true);
});

test("detects pending order refund transactions", () => {
  assert.equal(
    hasPendingOrderRefundTransaction([
      { kind: "SALE", status: "PENDING" },
      { kind: "REFUND", status: "SUCCESS" },
    ]),
    false,
  );
  assert.equal(
    hasPendingOrderRefundTransaction([
      { kind: "SALE", status: "PENDING" },
      { kind: "REFUND", status: " awaiting_response " },
    ]),
    true,
  );
});
