export const RefundDecision = {
  Eligible: "eligible",
  Ineligible: "ineligible",
  ManualReview: "manual_review",
} as const;

export type RefundDecision =
  (typeof RefundDecision)[keyof typeof RefundDecision];

export type RefundPolicyExceptionDecision =
  | typeof RefundDecision.Eligible
  | typeof RefundDecision.ManualReview;

export type RefundPolicyAlreadyRefundedDecision =
  | typeof RefundDecision.Ineligible
  | typeof RefundDecision.ManualReview;

export const RefundReasonCode = {
  MixedItemEligibilityReviewRequired: "mixed_item_eligibility_review_required",
  ManualReviewRequired: "manual_review_required",
  MerchantExceptionRuleApplied: "merchant_exception_rule_applied",
  FinancialStatusReviewRequired: "financial_status_review_required",
  HighValueOrderReviewRequired: "high_value_order_review_required",
  PartialFulfillmentReviewRequired: "partial_fulfillment_review_required",
  WithinCancelWindow: "within_cancel_window",
  OutsideCancelWindow: "outside_cancel_window",
  PreFulfillmentCancellationReviewRequired:
    "pre_fulfillment_cancellation_review_required",
  PreFulfillmentFinalSaleReviewRequired:
    "pre_fulfillment_final_sale_review_required",
  UnfulfilledOutsideWindowAllowed: "unfulfilled_outside_window_allowed",
  FinalSaleUnfulfilledAllowed: "final_sale_unfulfilled_allowed",
  AlreadyFullyRefunded: "already_fully_refunded",
  FinalSaleUnavailableForRefund: "final_sale_unavailable_for_refund",
  VipOverrideApplied: "vip_override_applied",
  OutsideRefundWindow: "outside_refund_window",
  WithinRefundWindow: "within_refund_window",
  CancelableBeforeFulfillment: "cancelable_before_fulfillment",
  ReturnableFulfillmentsUnavailable: "returnable_fulfillments_unavailable",
  ReturnableFulfillmentsAvailable: "returnable_fulfillments_available",
} as const;

export type RefundReasonCode =
  (typeof RefundReasonCode)[keyof typeof RefundReasonCode];

export const FinancialStatus = {
  Paid: "paid",
  PartiallyPaid: "partially_paid",
  PartiallyRefunded: "partially_refunded",
  Refunded: "refunded",
  Pending: "pending",
  Voided: "voided",
  Unknown: "unknown",
} as const;

export type FinancialStatus =
  (typeof FinancialStatus)[keyof typeof FinancialStatus];

export const FulfillmentStatus = {
  Unfulfilled: "unfulfilled",
  Partial: "partial",
  Fulfilled: "fulfilled",
  Restocked: "restocked",
  Unknown: "unknown",
} as const;

export type FulfillmentStatus =
  (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

export interface RefundPolicyCategoryWindowOverride {
  category: string;
  refundWindowDays?: number;
  cancelWindowDays?: number;
}

export interface RefundPolicyExceptionRule {
  tag: string;
  decision: RefundPolicyExceptionDecision;
  message: string;
}

// Policy settings are code-defined for now, but this type is meant to become
// the persisted merchant-configurable policy contract later.
export interface RefundPolicyConfig {
  refundWindowDays: number;
  cancelWindowDays?: number;
  highValueOrderThreshold?: number;
  categoryWindowOverrides?: RefundPolicyCategoryWindowOverride[];
  exceptionRules?: RefundPolicyExceptionRule[];
  finalSaleUnfulfilledDecision?: RefundDecision;
  unfulfilledOutsideWindowDecision?: RefundDecision;
  alreadyRefundedDecision: RefundPolicyAlreadyRefundedDecision;
}

export interface RefundPolicyFlags {
  fraudHold?: boolean;
  manualReview?: boolean;
  vipOverride?: boolean;
}

export type NormalizedRefundPolicyFlags = Required<RefundPolicyFlags>;

export interface RefundContext {
  order: RefundContextOrder;
  lineItems: RefundContextLineItem[];
}

export interface RefundContextLineItem {
  lineItemId: string;
  fulfillmentLineItemId?: string;
  title?: string;
  returnableQuantity: number;
  orderAgeDays?: number;
  category?: string;
  fulfillmentStatus: FulfillmentStatus;
  hasReturnableFulfillment: boolean;
  alreadyRefunded: boolean;
  finalSale: boolean;
}

// RefundContext contains normalized facts from Shopify / adapter.
export interface RefundContextOrder {
  id: string;
  name: string;
  createdAt: string;
  ageDays: number;
  totalAmount: number;
  financialStatus: FinancialStatus;
  tags: string[];
  flags: NormalizedRefundPolicyFlags;
}

export interface RefundReason {
  code: RefundReasonCode;
  message: string;
}

export interface RefundPolicyEvidencePolicyContext {
  refundWindowDays: number;
  effectiveRefundWindowDays: number;
  cancelWindowDays: number;
  effectiveCancelWindowDays: number;
  highValueOrderThreshold?: number;
  matchedCategoryWindowCategories: string[];
  matchedExceptionRuleTag?: string;
}

export interface EvaluatedRefundPolicyOrder {
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  hasReturnableFulfillments: boolean;
  alreadyFullyRefunded: boolean;
  finalSale: boolean;
  itemCategories: string[];
}

export interface EvaluatedRefundPolicyLineItem {
  lineItemId: string;
  fulfillmentLineItemId?: string;
  title?: string;
  returnableQuantity: number;
  ageDays: number;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  hasReturnableFulfillment: boolean;
  alreadyRefunded: boolean;
  finalSale: boolean;
  category?: string;
}

// order level
export interface RefundPolicySummaryEvidence {
  order: RefundContextOrder;
  policyContext: RefundPolicyEvidencePolicyContext;
  evaluatedOrder: EvaluatedRefundPolicyOrder;
}

// item level
export interface RefundPolicyLineItemEvidence {
  order: RefundContextOrder;
  policyContext: RefundPolicyEvidencePolicyContext;
  evaluatedLineItem: EvaluatedRefundPolicyLineItem;
}

export interface RefundPolicyLineItemEvaluation {
  lineItemId: string;
  fulfillmentLineItemId?: string;
  title?: string;
  returnableQuantity: number;
  decision: RefundDecision;
  reasons: RefundReason[];
  evidence: RefundPolicyLineItemEvidence;
}

export interface RefundPolicyResult {
  decision: RefundDecision;
  reasons: RefundReason[];
  evidence: RefundPolicySummaryEvidence;
  itemEvaluations: RefundPolicyLineItemEvaluation[];
}
