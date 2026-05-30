import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveShopifyRefundProcessingStatusFromTransactions,
  hasPendingShopifyOrderRefundTransaction,
  hasPendingShopifyRefundTransaction,
} from "../src/platforms/shopify/refund-processing-status.js";
import { RefundProcessingStatus } from "../src/domain/refund-processing-status.js";

test("derives refund processing status from Shopify transaction statuses", () => {
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([]),
    RefundProcessingStatus.Unknown,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([{ status: "SUCCESS" }]),
    RefundProcessingStatus.Succeeded,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([{ status: "PENDING" }]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([
      { status: " pending " },
    ]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([
      { status: "PROCESSING" },
    ]),
    RefundProcessingStatus.Pending,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([{ status: "FAILURE" }]),
    RefundProcessingStatus.Failed,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([{ status: " error " }]),
    RefundProcessingStatus.Failed,
  );
  assert.equal(
    deriveShopifyRefundProcessingStatusFromTransactions([
      { status: "FAILURE" },
      { status: "PENDING" },
    ]),
    RefundProcessingStatus.Pending,
  );
});

test("detects pending Shopify refund transactions", () => {
  assert.equal(hasPendingShopifyRefundTransaction([]), false);
  assert.equal(
    hasPendingShopifyRefundTransaction([{ status: "SUCCESS" }]),
    false,
  );
  assert.equal(
    hasPendingShopifyRefundTransaction([{ status: " processing " }]),
    true,
  );
});

test("detects pending Shopify order refund transactions", () => {
  assert.equal(
    hasPendingShopifyOrderRefundTransaction([
      { kind: "SALE", status: "PENDING" },
      { kind: "REFUND", status: "SUCCESS" },
    ]),
    false,
  );
  assert.equal(
    hasPendingShopifyOrderRefundTransaction([
      { kind: "SALE", status: "PENDING" },
      { kind: "REFUND", status: " awaiting_response " },
    ]),
    true,
  );
});
