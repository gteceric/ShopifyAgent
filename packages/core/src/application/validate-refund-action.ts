import { RefundDecision } from "../domain/refund-policy.types.js";
import type { RefundPolicyLineItemEvaluation } from "../domain/refund-policy.types.js";
import type { CheckRefundEligibilityResult } from "./check-refund-eligibility.js";

export const RefundActionValidationStatus = {
  Ready: "ready",
  Blocked: "blocked",
  RequiresReview: "requires_review",
} as const;

export type RefundActionValidationStatus =
  (typeof RefundActionValidationStatus)[keyof typeof RefundActionValidationStatus];

export const RefundActionBlockerCode = {
  OrderIdMismatch: "order_id_mismatch",
  EmptyLineItemRequest: "empty_line_item_request",
  DuplicateLineItemRequest: "duplicate_line_item_request",
  ManualReviewRequired: "manual_review_required",
  OrderIneligible: "order_ineligible",
  LineItemNotFound: "line_item_not_found",
  LineItemNotEligible: "line_item_not_eligible",
  QuantityMustBePositiveInteger: "quantity_must_be_positive_integer",
  QuantityExceedsReturnableQuantity: "quantity_exceeds_returnable_quantity",
  ReturnableFulfillmentUnavailable: "returnable_fulfillment_unavailable",
} as const;

export type RefundActionBlockerCode =
  (typeof RefundActionBlockerCode)[keyof typeof RefundActionBlockerCode];

export interface RefundActionLineItemRequest {
  lineItemId: string;
  quantity: number;
}

export interface RefundActionRequest {
  orderId: string;
  lineItems: RefundActionLineItemRequest[];
  reason?: string;
  requestedBy?: string;
}

export interface RefundActionBlocker {
  code: RefundActionBlockerCode;
  message: string;
  lineItemId?: string;
  requestedQuantity?: number;
  returnableQuantity?: number;
}

export interface RefundActionValidatedLineItem {
  lineItemId: string;
  fulfillmentLineItemId?: string;
  title?: string;
  requestedQuantity: number;
  returnableQuantity: number;
  decision: RefundDecision;
}

export interface RefundActionValidation {
  orderId: string;
  status: RefundActionValidationStatus;
  validatedLineItems: RefundActionValidatedLineItem[];
  blockers: RefundActionBlocker[];
}

function makeBlocker(
  code: RefundActionBlockerCode,
  message: string,
  details: Omit<RefundActionBlocker, "code" | "message"> = {},
): RefundActionBlocker {
  return {
    code,
    message,
    ...details,
  };
}

function getLineItemEvaluationById(
  eligibilityResult: CheckRefundEligibilityResult,
): Map<string, RefundPolicyLineItemEvaluation> {
  const itemEvaluationsById =
    new Map<string, RefundPolicyLineItemEvaluation>();

  for (const itemEvaluation of eligibilityResult.policyResult.itemEvaluations) {
    itemEvaluationsById.set(
      itemEvaluation.evidence.evaluatedLineItem.lineItemId,
      itemEvaluation,
    );
  }

  return itemEvaluationsById;
}

function resolveRefundActionValidationStatus(
  blockers: RefundActionBlocker[],
): RefundActionValidationStatus {
  const hasManualReviewBlocker = blockers.some(
    (blocker) =>
      blocker.code === RefundActionBlockerCode.ManualReviewRequired,
  );
  const hasNonReviewBlocker = blockers.some(
    (blocker) =>
      blocker.code !== RefundActionBlockerCode.ManualReviewRequired,
  );

  if (hasNonReviewBlocker) {
    return RefundActionValidationStatus.Blocked;
  }

  if (hasManualReviewBlocker) {
    return RefundActionValidationStatus.RequiresReview;
  }

  return RefundActionValidationStatus.Ready;
}

// Validate the standard fulfilled line-item refund path before execution.
// This does not create a Shopify refund; it decides whether execution is allowed.
export function validateRefundAction(
  request: RefundActionRequest,
  eligibilityResult: CheckRefundEligibilityResult,
): RefundActionValidation {
  const blockers: RefundActionBlocker[] = [];
  const validatedLineItems: RefundActionValidatedLineItem[] = [];
  const itemEvaluationsById = getLineItemEvaluationById(eligibilityResult);
  const requestedLineItemIds = new Set<string>();

  if (request.orderId !== eligibilityResult.orderId) {
    blockers.push(
      makeBlocker(
        RefundActionBlockerCode.OrderIdMismatch,
        "Refund action request does not match the eligibility result order.",
      ),
    );
  }

  if (request.lineItems.length === 0) {
    blockers.push(
      makeBlocker(
        RefundActionBlockerCode.EmptyLineItemRequest,
        "Refund action requires at least one requested line item.",
      ),
    );
  }

  if (eligibilityResult.policyResult.decision === RefundDecision.ManualReview) {
    blockers.push(
      makeBlocker(
        RefundActionBlockerCode.ManualReviewRequired,
        "Refund action requires human review before execution.",
      ),
    );
  }

  if (eligibilityResult.policyResult.decision === RefundDecision.Ineligible) {
    blockers.push(
      makeBlocker(
        RefundActionBlockerCode.OrderIneligible,
        "Refund action is blocked because the order is ineligible.",
      ),
    );
  }

  for (const requestedLineItem of request.lineItems) {
    const itemEvaluation = itemEvaluationsById.get(
      requestedLineItem.lineItemId,
    );

    if (requestedLineItemIds.has(requestedLineItem.lineItemId)) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.DuplicateLineItemRequest,
          "Refund action contains the same line item more than once.",
          { lineItemId: requestedLineItem.lineItemId },
        ),
      );
    }

    requestedLineItemIds.add(requestedLineItem.lineItemId);

    if (
      !Number.isInteger(requestedLineItem.quantity) ||
      requestedLineItem.quantity <= 0
    ) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.QuantityMustBePositiveInteger,
          "Refund quantity must be a positive whole number.",
          {
            lineItemId: requestedLineItem.lineItemId,
            requestedQuantity: requestedLineItem.quantity,
          },
        ),
      );
    }

    if (!itemEvaluation) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.LineItemNotFound,
          "Requested line item was not found in the eligibility result.",
          { lineItemId: requestedLineItem.lineItemId },
        ),
      );
      continue;
    }

    const evaluatedLineItem = itemEvaluation.evidence.evaluatedLineItem;

    validatedLineItems.push({
      lineItemId: evaluatedLineItem.lineItemId,
      fulfillmentLineItemId: evaluatedLineItem.fulfillmentLineItemId,
      title: evaluatedLineItem.title,
      requestedQuantity: requestedLineItem.quantity,
      returnableQuantity: evaluatedLineItem.returnableQuantity,
      decision: itemEvaluation.decision,
    });

    if (itemEvaluation.decision !== RefundDecision.Eligible) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.LineItemNotEligible,
          "Requested line item is not eligible for automatic refund execution.",
          { lineItemId: requestedLineItem.lineItemId },
        ),
      );
    }

    if (requestedLineItem.quantity > evaluatedLineItem.returnableQuantity) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.QuantityExceedsReturnableQuantity,
          "Requested refund quantity exceeds the returnable quantity.",
          {
            lineItemId: requestedLineItem.lineItemId,
            requestedQuantity: requestedLineItem.quantity,
            returnableQuantity: evaluatedLineItem.returnableQuantity,
          },
        ),
      );
    }

    if (
      !evaluatedLineItem.hasReturnableFulfillment ||
      !evaluatedLineItem.fulfillmentLineItemId
    ) {
      blockers.push(
        makeBlocker(
          RefundActionBlockerCode.ReturnableFulfillmentUnavailable,
          "Requested line item has no returnable fulfillment for the standard refund path.",
          { lineItemId: requestedLineItem.lineItemId },
        ),
      );
    }
  }

  return {
    orderId: request.orderId,
    status: resolveRefundActionValidationStatus(blockers),
    validatedLineItems,
    blockers,
  };
}
