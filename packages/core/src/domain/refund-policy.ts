import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "./refund-policy.types.js";
import type {
  RefundPolicyCategoryWindowOverride,
  RefundPolicyConfig,
  RefundPolicyEvidence,
  RefundPolicyExceptionRule,
  RefundPolicyFlags,
  RefundPolicyInput,
  RefundPolicyResult,
  RefundReason,
} from "./refund-policy.types.js";

const DEFAULT_POLICY: Required<RefundPolicyConfig> = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  highValueOrderThreshold: Number.POSITIVE_INFINITY,
  categoryWindowOverrides: [],
  exceptionRules: [],
  finalSaleUnfulfilledDecision: RefundDecision.Ineligible,
  unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
  alreadyFullyRefundedDecision: RefundDecision.Ineligible,
};

const REFUND_POLICY_REASON_COPY = {
  manualReviewRequired: "Order is flagged for manual review.",
  partialFulfillmentReviewRequired:
    "Order is partially fulfilled, so it requires human review before a refund decision is approved.",
  partialRefundReviewRequired:
    "Order has already been partially refunded, so it requires human review before any additional refund is approved.",
  highValueOrderReviewRequired:
    "Order total meets the merchant's high-value review threshold, so it requires human review before a refund decision is approved.",
  alreadyFullyRefundedReview:
    "Order has already been fully refunded and requires manual review.",
  alreadyFullyRefunded: "Order has already been fully refunded.",
  finalSaleUnavailableForRefund:
    "All items on the order are marked final sale.",
  finalSaleUnfulfilledAllowed:
    "Order is marked final sale, but merchant policy allows cancellation before shipment.",
  preFulfillmentFinalSaleReviewRequired:
    "Order is marked final sale and unfulfilled, so it requires human review before a cancellation refund is approved.",
  vipOverrideFinalSale:
    "VIP override allows a refund even though all items are final sale.",
  returnableFulfillmentsUnavailable:
    "No returnable fulfillments were found for this order.",
  vipOverrideWithoutReturnableFulfillments:
    "VIP override allows a refund without returnable fulfillments.",
  cancelableBeforeFulfillment:
    "Order has not been fulfilled yet, so it can be canceled before shipment.",
  unfulfilledOutsideWindowAllowed:
    "Order has not been fulfilled yet, and merchant policy allows cancellation outside the standard cancellation window.",
  returnableFulfillmentsAvailable:
    "Order has returnable fulfillments available.",
} as const;

function financialStatusReviewRequiredMessage(
  financialStatus: FinancialStatus,
): string {
  return `Order financial status is ${financialStatus}, so it requires human review before a refund decision is approved.`;
}

function highValueOrderReviewRequiredMessage(
  orderTotalAmount: number,
  highValueOrderThreshold: number,
): string {
  return `Order total is ${orderTotalAmount.toFixed(2)}, which meets or exceeds the ${highValueOrderThreshold.toFixed(2)} high-value review threshold.`;
}

function withinRefundWindowMessage(refundWindowDays: number): string {
  return `Order is within the ${refundWindowDays}-day refund window.`;
}

function outsideRefundWindowMessage(refundWindowDays: number): string {
  return `Order is outside the ${refundWindowDays}-day refund window.`;
}

function withinCancelWindowMessage(cancelWindowDays: number): string {
  return `Order is within the ${cancelWindowDays}-day cancellation window.`;
}

function outsideCancelWindowMessage(cancelWindowDays: number): string {
  return `Order is outside the ${cancelWindowDays}-day cancellation window.`;
}

function vipOverrideOutsideRefundWindowMessage(
  refundWindowDays: number,
): string {
  return `VIP override allows a refund outside the ${refundWindowDays}-day refund window.`;
}

function preFulfillmentCancellationReviewRequiredMessage(
  cancelWindowDays: number,
): string {
  return `Order is unfulfilled but older than the ${cancelWindowDays}-day cancellation window and requires human review.`;
}

function normalizeStringArray(values?: string[]): string[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function findMatchingCategoryOverrides(
  itemCategories: string[],
  overrides: RefundPolicyCategoryWindowOverride[],
): RefundPolicyCategoryWindowOverride[] {
  const normalizedCategories = new Set(
    itemCategories.map((category) => category.toLowerCase()),
  );

  return overrides.filter((override) =>
    normalizedCategories.has(override.category.trim().toLowerCase()),
  );
}

function resolveEffectiveRefundWindowDays(
  defaultWindowDays: number,
  overrides: RefundPolicyCategoryWindowOverride[],
): number {
  const categoryWindowDays = overrides
    .map((override) => override.refundWindowDays)
    .filter((value): value is number => value !== undefined);

  return categoryWindowDays.length > 0
    ? Math.min(...categoryWindowDays)
    : defaultWindowDays;
}

function resolveEffectiveCancelWindowDays(
  defaultWindowDays: number,
  overrides: RefundPolicyCategoryWindowOverride[],
): number {
  const categoryWindowDays = overrides
    .map((override) => override.cancelWindowDays)
    .filter((value): value is number => value !== undefined);

  return categoryWindowDays.length > 0
    ? Math.min(...categoryWindowDays)
    : defaultWindowDays;
}

function findMatchingExceptionRule(
  policyTags: string[],
  exceptionRules: RefundPolicyExceptionRule[],
): RefundPolicyExceptionRule | undefined {
  const normalizedTags = new Set(policyTags.map((tag) => tag.toLowerCase()));

  return exceptionRules.find((rule) =>
    normalizedTags.has(rule.tag.trim().toLowerCase()),
  );
}

function normalizeFlags(
  flags?: RefundPolicyFlags,
): Required<RefundPolicyFlags> {
  return {
    fraudHold: flags?.fraudHold ?? false,
    manualReview: flags?.manualReview ?? false,
    vipOverride: flags?.vipOverride ?? false,
  };
}

function makeReason(code: RefundReasonCode, message: string): RefundReason {
  return { code, message };
}

export function evaluateRefundPolicy(
  input: RefundPolicyInput,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyResult {
  const effectiveConfig: Required<RefundPolicyConfig> = {
    ...DEFAULT_POLICY,
    ...config,
  };
  const flags = normalizeFlags(input.flags);
  const itemCategories = normalizeStringArray(input.itemCategories);
  const policyTags = normalizeStringArray(input.policyTags);
  const isUnfulfilledOrder =
    input.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const isPartiallyFulfilledOrder =
    input.fulfillmentStatus === FulfillmentStatus.Partial;
  const isPartiallyRefundedOrder =
    input.financialStatus === FinancialStatus.PartiallyRefunded;
  const isHighValueOrderThresholdFinite = Number.isFinite(
    effectiveConfig.highValueOrderThreshold,
  );
  const requiresHighValueReview =
    isHighValueOrderThresholdFinite &&
    input.orderTotalAmount >= effectiveConfig.highValueOrderThreshold;
  const requiresFinancialStatusReview =
    input.financialStatus === FinancialStatus.Pending ||
    input.financialStatus === FinancialStatus.PartiallyPaid ||
    input.financialStatus === FinancialStatus.Voided ||
    input.financialStatus === FinancialStatus.Unknown;
  const isUnfulfilledFinalSaleOrder =
    isUnfulfilledOrder && input.allItemsFinalSale && !flags.vipOverride;
  const matchingCategoryOverrides = findMatchingCategoryOverrides(
    itemCategories,
    effectiveConfig.categoryWindowOverrides,
  );
  const effectiveRefundWindowDays = resolveEffectiveRefundWindowDays(
    effectiveConfig.refundWindowDays,
    matchingCategoryOverrides,
  );
  const effectiveCancelWindowDays = resolveEffectiveCancelWindowDays(
    effectiveConfig.cancelWindowDays,
    matchingCategoryOverrides,
  );
  const matchedCategoryWindowCategories = matchingCategoryOverrides.map(
    (override) => override.category,
  );
  const evidence: RefundPolicyEvidence = {
    orderAgeDays: input.orderAgeDays,
    refundWindowDays: effectiveConfig.refundWindowDays,
    effectiveRefundWindowDays,
    cancelWindowDays: effectiveConfig.cancelWindowDays,
    effectiveCancelWindowDays,
    orderTotalAmount: input.orderTotalAmount,
    highValueOrderThreshold: isHighValueOrderThresholdFinite
      ? effectiveConfig.highValueOrderThreshold
      : undefined,
    financialStatus: input.financialStatus,
    fulfillmentStatus: input.fulfillmentStatus,
    hasReturnableFulfillments: input.hasReturnableFulfillments,
    alreadyFullyRefunded: input.alreadyFullyRefunded,
    allItemsFinalSale: input.allItemsFinalSale,
    itemCategories,
    policyTags,
    matchedCategoryWindowCategories,
    flags,
  };
  const reviewReasons: RefundReason[] = [];
  const blockingReasons: RefundReason[] = [];
  const overrideReasons: RefundReason[] = [];

  if (flags.fraudHold || flags.manualReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.ManualReviewRequired,
        REFUND_POLICY_REASON_COPY.manualReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (requiresHighValueReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.HighValueOrderReviewRequired,
        highValueOrderReviewRequiredMessage(
          input.orderTotalAmount,
          effectiveConfig.highValueOrderThreshold,
        ),
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (requiresFinancialStatusReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.FinancialStatusReviewRequired,
        financialStatusReviewRequiredMessage(input.financialStatus),
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (isPartiallyFulfilledOrder) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.PartialFulfillmentReviewRequired,
        REFUND_POLICY_REASON_COPY.partialFulfillmentReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (isPartiallyRefundedOrder) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.PartialRefundReviewRequired,
        REFUND_POLICY_REASON_COPY.partialRefundReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      evidence,
    };
  }

  if (input.alreadyFullyRefunded) {
    if (
      effectiveConfig.alreadyFullyRefundedDecision ===
      RefundDecision.ManualReview
    ) {
      reviewReasons.push(
        makeReason(
          RefundReasonCode.AlreadyFullyRefunded,
          REFUND_POLICY_REASON_COPY.alreadyFullyRefundedReview,
        ),
      );

      return {
        decision: RefundDecision.ManualReview,
        reasons: reviewReasons,
        evidence,
      };
    }

    blockingReasons.push(
      makeReason(
        RefundReasonCode.AlreadyFullyRefunded,
        REFUND_POLICY_REASON_COPY.alreadyFullyRefunded,
      ),
    );
  }

  if (isUnfulfilledFinalSaleOrder) {
    switch (effectiveConfig.finalSaleUnfulfilledDecision) {
      case RefundDecision.Eligible:
        overrideReasons.push(
          makeReason(
            RefundReasonCode.FinalSaleUnfulfilledAllowed,
            REFUND_POLICY_REASON_COPY.finalSaleUnfulfilledAllowed,
          ),
        );
        break;
      case RefundDecision.ManualReview:
        reviewReasons.push(
          makeReason(
            RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
            REFUND_POLICY_REASON_COPY.preFulfillmentFinalSaleReviewRequired,
          ),
        );

        return {
          decision: RefundDecision.ManualReview,
          reasons: reviewReasons,
          evidence,
        };
      case RefundDecision.Ineligible:
        blockingReasons.push(
          makeReason(
            RefundReasonCode.FinalSaleUnavailableForRefund,
            REFUND_POLICY_REASON_COPY.finalSaleUnavailableForRefund,
          ),
        );
        break;
    }
  } else if (input.allItemsFinalSale && !flags.vipOverride) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.FinalSaleUnavailableForRefund,
        REFUND_POLICY_REASON_COPY.finalSaleUnavailableForRefund,
      ),
    );
  } else if (input.allItemsFinalSale && flags.vipOverride) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideFinalSale,
      ),
    );
  }

  if (
    isUnfulfilledOrder &&
    input.orderAgeDays > effectiveCancelWindowDays &&
    !flags.vipOverride
  ) {
    switch (effectiveConfig.unfulfilledOutsideWindowDecision) {
      case RefundDecision.Eligible:
        return {
          decision: RefundDecision.Eligible,
          reasons: [
            makeReason(
              RefundReasonCode.UnfulfilledOutsideWindowAllowed,
              REFUND_POLICY_REASON_COPY.unfulfilledOutsideWindowAllowed,
            ),
            makeReason(
              RefundReasonCode.OutsideCancelWindow,
              outsideCancelWindowMessage(effectiveCancelWindowDays),
            ),
          ],
          evidence,
        };
      case RefundDecision.Ineligible:
        blockingReasons.push(
          makeReason(
            RefundReasonCode.OutsideCancelWindow,
            outsideCancelWindowMessage(effectiveCancelWindowDays),
          ),
        );
        break;
      case RefundDecision.ManualReview:
        reviewReasons.push(
          makeReason(
            RefundReasonCode.PreFulfillmentCancellationReviewRequired,
            preFulfillmentCancellationReviewRequiredMessage(
              effectiveCancelWindowDays,
            ),
          ),
        );

        return {
          decision: RefundDecision.ManualReview,
          reasons: reviewReasons,
          evidence,
        };
    }
  }

  if (
    !isUnfulfilledOrder &&
    input.orderAgeDays > effectiveRefundWindowDays &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.OutsideRefundWindow,
        outsideRefundWindowMessage(effectiveRefundWindowDays),
      ),
    );
  } else if (
    !isUnfulfilledOrder &&
    input.orderAgeDays > effectiveRefundWindowDays &&
    flags.vipOverride
  ) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        vipOverrideOutsideRefundWindowMessage(effectiveRefundWindowDays),
      ),
    );
  }

  if (blockingReasons.length > 0) {
    const matchingExceptionRule = findMatchingExceptionRule(
      policyTags,
      effectiveConfig.exceptionRules,
    );

    if (matchingExceptionRule) {
      const reasons = [
        makeReason(
          RefundReasonCode.MerchantExceptionRuleApplied,
          matchingExceptionRule.message,
        ),
        blockingReasons[0]!,
      ];

      return {
        decision: matchingExceptionRule.decision,
        reasons,
        evidence: {
          ...evidence,
          matchedExceptionRuleTag: matchingExceptionRule.tag,
        },
      };
    }
  }

  if (
    !isUnfulfilledOrder &&
    !input.hasReturnableFulfillments &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.ReturnableFulfillmentsUnavailable,
        REFUND_POLICY_REASON_COPY.returnableFulfillmentsUnavailable,
      ),
    );
  } else if (
    !isUnfulfilledOrder &&
    !input.hasReturnableFulfillments &&
    flags.vipOverride
  ) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideWithoutReturnableFulfillments,
      ),
    );
  }

  if (blockingReasons.length > 0) {
    return {
      decision: RefundDecision.Ineligible,
      reasons: blockingReasons,
      evidence,
    };
  }

  return {
    decision: RefundDecision.Eligible,
    reasons:
      overrideReasons.length > 0
        ? overrideReasons.slice(0, 1)
        : isUnfulfilledOrder
          ? [
              makeReason(
                RefundReasonCode.WithinCancelWindow,
                withinCancelWindowMessage(effectiveCancelWindowDays),
              ),
              makeReason(
                RefundReasonCode.CancelableBeforeFulfillment,
                REFUND_POLICY_REASON_COPY.cancelableBeforeFulfillment,
              ),
            ]
          : [
              makeReason(
                RefundReasonCode.WithinRefundWindow,
                withinRefundWindowMessage(effectiveRefundWindowDays),
              ),
              makeReason(
                RefundReasonCode.ReturnableFulfillmentsAvailable,
                REFUND_POLICY_REASON_COPY.returnableFulfillmentsAvailable,
              ),
            ],
    evidence,
  };
}

export { DEFAULT_POLICY };
