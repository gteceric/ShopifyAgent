import { randomUUID } from "node:crypto";

import {
  checkRefundEligibility,
  createPolicyConfig,
  createShopifyAdminRefundContextAdapter,
  executeShopifyRefundAction,
  RefundActionValidationStatus,
  RefundDecision,
  validateRefundAction,
} from "@shopify-agent/core";
import type {
  CheckRefundEligibilityDeps,
  CheckRefundEligibilityInput,
  ExecuteShopifyRefundActionInput,
  RefundActionRequest,
  RefundPolicyLineItemEvaluation,
} from "@shopify-agent/core";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the real refund smoke test.`);
  }

  return value;
}

function readRequiredPositiveIntegerEnv(name: string): number {
  const rawValue = readRequiredEnv(name);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number.`);
  }

  return value;
}

function readOptionalNonNegativeIntegerEnv(
  name: string,
  defaultValue: number,
): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative whole number when set.`);
  }

  return value;
}

function requireRealRefundSmokeTestFlags(): void {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error("Real refund smoke test requires USE_REAL_SHOPIFY=true.");
  }

  if (process.env.ENABLE_REAL_REFUND_EXECUTION !== "true") {
    throw new Error(
      "Real refund smoke test requires ENABLE_REAL_REFUND_EXECUTION=true.",
    );
  }
}

function createSmokeRefundIdempotencyKey(orderId: string): string {
  return `refund-smoke:${orderId}:${randomUUID()}`;
}

function formatSmokeRefundItemEvaluations(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
) {
  return itemEvaluations.map((itemEvaluation, index) => {
    const evaluatedLineItem = itemEvaluation.evidence.evaluatedLineItem;

    return {
      index,
      lineItemId: evaluatedLineItem.lineItemId,
      title: evaluatedLineItem.title,
      decision: itemEvaluation.decision,
      returnableQuantity: evaluatedLineItem.returnableQuantity,
      hasReturnableFulfillment: evaluatedLineItem.hasReturnableFulfillment,
      fulfillmentLineItemId: evaluatedLineItem.fulfillmentLineItemId,
      reasons: itemEvaluation.reasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
      })),
    };
  });
}

function selectSmokeRefundLineItem(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
  quantity: number,
  selectedIndex: number,
): RefundPolicyLineItemEvaluation {
  const eligibleItems = itemEvaluations.filter((itemEvaluation) => {
    const evaluatedLineItem = itemEvaluation.evidence.evaluatedLineItem;

    return (
      itemEvaluation.decision === RefundDecision.Eligible &&
      evaluatedLineItem.returnableQuantity >= quantity
    );
  });
  const selectedItem = eligibleItems[selectedIndex];

  if (!selectedItem) {
    console.log("Refund smoke test item evaluations");
    console.log(
      JSON.stringify(formatSmokeRefundItemEvaluations(itemEvaluations), null, 2),
    );

    throw new Error(
      `No eligible smoke-test line item found at index ${selectedIndex}.`,
    );
  }

  return selectedItem;
}

async function main(): Promise<void> {
  requireRealRefundSmokeTestFlags();

  const orderId = readRequiredEnv("SMOKE_REFUND_ORDER_ID");
  const quantity = readRequiredPositiveIntegerEnv("SMOKE_REFUND_QUANTITY");
  const selectedItemIndex = readOptionalNonNegativeIntegerEnv(
    "SMOKE_REFUND_ITEM_INDEX",
    0,
  );
  const idempotencyKey = createSmokeRefundIdempotencyKey(orderId);
  const note = process.env.SMOKE_REFUND_NOTE?.trim();
  const adapter = createShopifyAdminRefundContextAdapter();
  const eligibilityInput: CheckRefundEligibilityInput = { orderId };
  const eligibilityDeps: CheckRefundEligibilityDeps = {
    config: createPolicyConfig(),
    adapter,
  };
  const eligibilityResult = await checkRefundEligibility(
    eligibilityInput,
    eligibilityDeps,
  );
  const selectedItemEvaluation = selectSmokeRefundLineItem(
    eligibilityResult.policyResult.itemEvaluations,
    quantity,
    selectedItemIndex,
  );
  const selectedLineItem =
    selectedItemEvaluation.evidence.evaluatedLineItem;
  const refundActionRequest: RefundActionRequest = {
    orderId,
    lineItems: [
      {
        lineItemId: selectedLineItem.lineItemId,
        quantity,
      },
    ],
  };
  const validation = validateRefundAction(
    refundActionRequest,
    eligibilityResult,
  );

  console.log("Refund smoke test eligibility decision");
  console.log(
    JSON.stringify(
      {
        orderId,
        selectedItemIndex,
        selectedLineItem: {
          lineItemId: selectedLineItem.lineItemId,
          title: selectedLineItem.title,
          returnableQuantity: selectedLineItem.returnableQuantity,
          decision: selectedItemEvaluation.decision,
        },
        quantity,
        decision: eligibilityResult.policyResult.decision,
        validationStatus: validation.status,
        blockers: validation.blockers,
      },
      null,
      2,
    ),
  );

  if (validation.status !== RefundActionValidationStatus.Ready) {
    throw new Error("Refund smoke test stopped because validation is not ready.");
  }

  const executionInput: ExecuteShopifyRefundActionInput = {
    validation,
    idempotencyKey,
    ...(note ? { note } : {}),
  };
  const result = await executeShopifyRefundAction(executionInput);

  console.log("Refund smoke test execution result");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error("Failed to run real Shopify refund smoke test.");
  console.error(error);
  process.exitCode = 1;
});
