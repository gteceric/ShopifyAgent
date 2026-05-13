import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "./refund-policy.types.js";
import type {
  RefundPolicyCategoryWindowOverride,
  RefundPolicyConfig,
  RefundPolicyExceptionRule,
  RefundContext,
  RefundContextOrder,
  RefundPolicyLineItemEvaluation,
  RefundPolicyLineItemEvidence,
  RefundContextLineItem,
  RefundPolicyEvidencePolicyContext,
  RefundPolicyResult,
  RefundPolicyOrderEvidence,
  EvaluatedRefundPolicyOrder,
  RefundReason,
} from "./refund-policy.types.js";

// item level data
interface RefundPolicyItemContext {
  order: RefundContextOrder;
  effectiveAgeDays: number; // order age adjusted by any line-item age override
  effectiveFinancialStatus: FinancialStatus; // derived from order financial status plus this item's refund state
  fulfillmentStatus: FulfillmentStatus; // Shopify-backed fulfillment status normalized by the adapter
  hasReturnableFulfillment: boolean; // from Shopify returnable fulfillments
  alreadyRefunded: boolean; // derived from Shopify order/item refund state
  finalSale: boolean; // from Shopify line item custom attributes
  itemCategories: string[]; // normalized Shopify product category data
}

interface RefundPolicyRuleEvaluationContext {
  itemContext: RefundPolicyItemContext; // normalized facts used for the policy decision
  refundWindowDays: number; // configured default fulfilled-order refund window
  effectiveRefundWindowDays: number; // refund window after category overrides
  cancelWindowDays: number; // configured default pre-fulfillment cancel window
  effectiveCancelWindowDays: number; // cancel window after category overrides
  highValueOrderThreshold?: number; // configured threshold when finite
  matchedCategoryWindowCategories: string[]; // category overrides matched during evaluation
  matchedExceptionRuleTag?: string; // merchant exception tag matched during evaluation
}

interface RefundPolicyEvaluationResult {
  ruleContext: RefundPolicyRuleEvaluationContext; // derived context used by the rules
  decision: RefundDecision; // policy outcome
  reasons: RefundReason[]; // human-readable policy reasons
}

const DEFAULT_POLICY: Required<RefundPolicyConfig> = {
  refundWindowDays: 30,
  cancelWindowDays: 30,
  highValueOrderThreshold: Number.POSITIVE_INFINITY,
  categoryWindowOverrides: [],
  exceptionRules: [],
  finalSaleUnfulfilledDecision: RefundDecision.Ineligible,
  unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
  alreadyRefundedDecision: RefundDecision.Ineligible,
};

const REFUND_POLICY_REASON_COPY = {
  mixedItemEligibilityReviewRequired:
    "Refund request has mixed item eligibility, so a human should review the partial refund path.",
  manualReviewRequired: "Refund request is flagged for manual review.",
  partialFulfillmentReviewRequired:
    "Refund subject is partially fulfilled, so it requires human review before a refund decision is approved.",
  highValueOrderReviewRequired:
    "Order total meets the merchant's high-value review threshold, so it requires human review before a refund decision is approved.",
  alreadyRefundedReview:
    "Refund subject has already been refunded and requires manual review.",
  alreadyRefunded: "Refund subject has already been refunded.",
  finalSaleUnavailableForRefund: "Refund subject is marked final sale.",
  finalSaleUnfulfilledAllowed:
    "Refund subject is marked final sale, but merchant policy allows cancellation before shipment.",
  preFulfillmentFinalSaleReviewRequired:
    "Refund subject is marked final sale and unfulfilled, so it requires human review before a cancellation refund is approved.",
  vipOverrideFinalSale:
    "VIP override allows a refund even though the refund subject is final sale.",
  returnableFulfillmentsUnavailable:
    "No returnable fulfillment was found for this refund subject.",
  vipOverrideWithoutReturnableFulfillments:
    "VIP override allows a refund without returnable fulfillments.",
  cancelableBeforeFulfillment:
    "Refund subject has not been fulfilled yet, so it can be canceled before shipment.",
  unfulfilledOutsideWindowAllowed:
    "Refund subject has not been fulfilled yet, and merchant policy allows cancellation outside the standard cancellation window.",
  returnableFulfillmentsAvailable:
    "Refund subject has a returnable fulfillment available.",
} as const;

function financialStatusReviewRequiredMessage(
  effectiveFinancialStatus: FinancialStatus,
): string {
  return `Refund subject financial status is ${effectiveFinancialStatus}, so it requires human review before a refund decision is approved.`;
}

function highValueOrderReviewRequiredMessage(
  orderTotalAmount: number,
  highValueOrderThreshold: number,
): string {
  return `Order total is ${orderTotalAmount.toFixed(2)}, which meets or exceeds the ${highValueOrderThreshold.toFixed(2)} high-value review threshold.`;
}

function withinRefundWindowMessage(refundWindowDays: number): string {
  return `Refund subject is within the ${refundWindowDays}-day refund window.`;
}

function outsideRefundWindowMessage(refundWindowDays: number): string {
  return `Refund subject is outside the ${refundWindowDays}-day refund window.`;
}

function withinCancelWindowMessage(cancelWindowDays: number): string {
  return `Refund subject is within the ${cancelWindowDays}-day cancellation window.`;
}

function outsideCancelWindowMessage(cancelWindowDays: number): string {
  return `Refund subject is outside the ${cancelWindowDays}-day cancellation window.`;
}

function vipOverrideOutsideRefundWindowMessage(
  refundWindowDays: number,
): string {
  return `VIP override allows a refund outside the ${refundWindowDays}-day refund window.`;
}

function preFulfillmentCancellationReviewRequiredMessage(
  cancelWindowDays: number,
): string {
  return `Refund subject is unfulfilled but older than the ${cancelWindowDays}-day cancellation window and requires human review.`;
}

function findMatchingCategoryOverrides(
  itemCategories: string[],
  overrides: RefundPolicyCategoryWindowOverride[],
): RefundPolicyCategoryWindowOverride[] {
  const normalizedCategoryValues = itemCategories.map((category) =>
    category.toLowerCase(),
  );
  const normalizedCategories = new Set(normalizedCategoryValues);

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
  tags: string[],
  exceptionRules: RefundPolicyExceptionRule[],
): RefundPolicyExceptionRule | undefined {
  const normalizedTagValues = tags.map((tag) => tag.toLowerCase());
  const normalizedTags = new Set(normalizedTagValues);

  return exceptionRules.find((rule) =>
    normalizedTags.has(rule.tag.trim().toLowerCase()),
  );
}

function makeReason(code: RefundReasonCode, message: string): RefundReason {
  return { code, message };
}

function createEffectivePolicyConfig(
  config: RefundPolicyConfig = DEFAULT_POLICY,
): Required<RefundPolicyConfig> {
  return {
    ...DEFAULT_POLICY,
    ...config,
  };
}

// RefundPolicyRuleEvaluationContext is derived during rule evaluation:
// effective windows, matched rules, and evaluated item facts.
function createRuleEvaluationContext(
  itemContext: RefundPolicyItemContext,
  config: Required<RefundPolicyConfig>,
): RefundPolicyRuleEvaluationContext {
  const isHighValueOrderThresholdFinite = Number.isFinite(
    config.highValueOrderThreshold,
  );
  const matchingCategoryOverrides = findMatchingCategoryOverrides(
    itemContext.itemCategories,
    config.categoryWindowOverrides,
  );
  const effectiveRefundWindowDays = resolveEffectiveRefundWindowDays(
    config.refundWindowDays,
    matchingCategoryOverrides,
  );
  const effectiveCancelWindowDays = resolveEffectiveCancelWindowDays(
    config.cancelWindowDays,
    matchingCategoryOverrides,
  );
  const matchedCategoryWindowCategories = matchingCategoryOverrides.map(
    (override) => override.category,
  );
  return {
    itemContext,
    refundWindowDays: config.refundWindowDays,
    effectiveRefundWindowDays,
    cancelWindowDays: config.cancelWindowDays,
    effectiveCancelWindowDays,
    highValueOrderThreshold: isHighValueOrderThresholdFinite
      ? config.highValueOrderThreshold
      : undefined,
    matchedCategoryWindowCategories,
  };
}

function evaluateRefundPolicyItemContext(
  itemContext: RefundPolicyItemContext,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyEvaluationResult {
  const order = itemContext.order;
  const effectiveConfig = createEffectivePolicyConfig(config);
  const ruleContext = createRuleEvaluationContext(itemContext, effectiveConfig);
  const flags = order.flags;
  const tags = order.tags;
  const effectiveRefundWindowDays = ruleContext.effectiveRefundWindowDays;
  const effectiveCancelWindowDays = ruleContext.effectiveCancelWindowDays;
  const isUnfulfilledRefundSubject =
    itemContext.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const isPartiallyFulfilledRefundSubject =
    itemContext.fulfillmentStatus === FulfillmentStatus.Partial;
  const isHighValueOrderThresholdFinite = Number.isFinite(
    effectiveConfig.highValueOrderThreshold,
  );
  const requiresHighValueReview =
    isHighValueOrderThresholdFinite &&
    order.totalAmount >= effectiveConfig.highValueOrderThreshold;
  const requiresFinancialStatusReview =
    itemContext.effectiveFinancialStatus === FinancialStatus.Pending ||
    itemContext.effectiveFinancialStatus === FinancialStatus.PartiallyPaid ||
    itemContext.effectiveFinancialStatus === FinancialStatus.Voided ||
    itemContext.effectiveFinancialStatus === FinancialStatus.Unknown;
  const isUnfulfilledFinalSaleRefundSubject =
    isUnfulfilledRefundSubject && itemContext.finalSale && !flags.vipOverride;
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
      ruleContext,
    };
  }

  if (requiresHighValueReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.HighValueOrderReviewRequired,
        highValueOrderReviewRequiredMessage(
          order.totalAmount,
          effectiveConfig.highValueOrderThreshold,
        ),
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      ruleContext,
    };
  }

  if (requiresFinancialStatusReview) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.FinancialStatusReviewRequired,
        financialStatusReviewRequiredMessage(
          itemContext.effectiveFinancialStatus,
        ),
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      ruleContext,
    };
  }

  if (isPartiallyFulfilledRefundSubject) {
    reviewReasons.push(
      makeReason(
        RefundReasonCode.PartialFulfillmentReviewRequired,
        REFUND_POLICY_REASON_COPY.partialFulfillmentReviewRequired,
      ),
    );

    return {
      decision: RefundDecision.ManualReview,
      reasons: reviewReasons,
      ruleContext,
    };
  }

  if (itemContext.alreadyRefunded) {
    if (
      effectiveConfig.alreadyRefundedDecision === RefundDecision.ManualReview
    ) {
      reviewReasons.push(
        makeReason(
          RefundReasonCode.AlreadyFullyRefunded,
          REFUND_POLICY_REASON_COPY.alreadyRefundedReview,
        ),
      );

      return {
        decision: RefundDecision.ManualReview,
        reasons: reviewReasons,
        ruleContext,
      };
    }

    blockingReasons.push(
      makeReason(
        RefundReasonCode.AlreadyFullyRefunded,
        REFUND_POLICY_REASON_COPY.alreadyRefunded,
      ),
    );
  }

  if (isUnfulfilledFinalSaleRefundSubject) {
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
          ruleContext,
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
  } else if (itemContext.finalSale && !flags.vipOverride) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.FinalSaleUnavailableForRefund,
        REFUND_POLICY_REASON_COPY.finalSaleUnavailableForRefund,
      ),
    );
  } else if (itemContext.finalSale && flags.vipOverride) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideFinalSale,
      ),
    );
  }

  if (
    isUnfulfilledRefundSubject &&
    itemContext.effectiveAgeDays > effectiveCancelWindowDays &&
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
          ruleContext,
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
          ruleContext,
        };
    }
  }

  if (
    !isUnfulfilledRefundSubject &&
    itemContext.effectiveAgeDays > effectiveRefundWindowDays &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.OutsideRefundWindow,
        outsideRefundWindowMessage(effectiveRefundWindowDays),
      ),
    );
  } else if (
    !isUnfulfilledRefundSubject &&
    itemContext.effectiveAgeDays > effectiveRefundWindowDays &&
    flags.vipOverride
  ) {
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        vipOverrideOutsideRefundWindowMessage(effectiveRefundWindowDays),
      ),
    );
  }

  if (
    !isUnfulfilledRefundSubject &&
    !itemContext.hasReturnableFulfillment &&
    !flags.vipOverride
  ) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.ReturnableFulfillmentsUnavailable,
        REFUND_POLICY_REASON_COPY.returnableFulfillmentsUnavailable,
      ),
    );
  } else if (
    !isUnfulfilledRefundSubject &&
    !itemContext.hasReturnableFulfillment &&
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
    const matchingExceptionRule = findMatchingExceptionRule(
      tags,
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
        ruleContext: {
          ...ruleContext,
          matchedExceptionRuleTag: matchingExceptionRule.tag,
        },
      };
    }
  }

  if (blockingReasons.length > 0) {
    return {
      decision: RefundDecision.Ineligible,
      reasons: blockingReasons,
      ruleContext,
    };
  }

  return {
    decision: RefundDecision.Eligible,
    reasons:
      overrideReasons.length > 0
        ? overrideReasons.slice(0, 1)
        : isUnfulfilledRefundSubject
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
    ruleContext,
  };
}

// Item A: ineligible, already refunded
// Item B: eligible, still refundable
// Overall: manual_review because mixed
function getLineItemFinancialStatus(
  orderFinancialStatus: FinancialStatus,
  lineItemAlreadyRefunded: boolean,
): FinancialStatus {
  if (
    orderFinancialStatus === FinancialStatus.Refunded ||
    lineItemAlreadyRefunded
  ) {
    return FinancialStatus.Refunded;
  }

  if (orderFinancialStatus === FinancialStatus.PartiallyRefunded) {
    // lineItemAlreadyRefunded is false in this case.
    return FinancialStatus.Paid;
  }

  return orderFinancialStatus;
}

// Convert adapter-normalized order and line item facts into the shape used by
// the policy rules for one refund subject.
function createRefundPolicyItemContext(
  order: RefundContextOrder,
  lineItem: RefundContextLineItem,
): RefundPolicyItemContext {
  return {
    order,
    effectiveAgeDays: lineItem.ageDaysOverride ?? order.ageDays,
    effectiveFinancialStatus: getLineItemFinancialStatus(
      order.financialStatus,
      lineItem.alreadyRefunded,
    ),
    fulfillmentStatus: lineItem.fulfillmentStatus,
    hasReturnableFulfillment: lineItem.hasReturnableFulfillment,
    alreadyRefunded: lineItem.alreadyRefunded,
    finalSale: lineItem.finalSale,
    itemCategories: lineItem.category ? [lineItem.category] : [],
  };
}

function createLineItemEvidence(
  lineItem: RefundContextLineItem,
  result: RefundPolicyEvaluationResult,
): RefundPolicyLineItemEvidence {
  const itemContext = result.ruleContext.itemContext;
  const order = itemContext.order;

  return {
    order,
    policyContext: {
      refundWindowDays: result.ruleContext.refundWindowDays,
      effectiveRefundWindowDays: result.ruleContext.effectiveRefundWindowDays,
      cancelWindowDays: result.ruleContext.cancelWindowDays,
      effectiveCancelWindowDays: result.ruleContext.effectiveCancelWindowDays,
      highValueOrderThreshold: result.ruleContext.highValueOrderThreshold,
      matchedCategoryWindowCategories:
        result.ruleContext.matchedCategoryWindowCategories,
      matchedExceptionRuleTag: result.ruleContext.matchedExceptionRuleTag,
    },
    evaluatedLineItem: {
      lineItemId: lineItem.lineItemId,
      fulfillmentLineItemId: lineItem.fulfillmentLineItemId,
      title: lineItem.title,
      returnableQuantity: lineItem.returnableQuantity,
      ageDays: itemContext.effectiveAgeDays,
      effectiveFinancialStatus: itemContext.effectiveFinancialStatus,
      fulfillmentStatus: itemContext.fulfillmentStatus,
      hasReturnableFulfillment: itemContext.hasReturnableFulfillment,
      lineItemAlreadyRefunded: itemContext.alreadyRefunded,
      finalSale: itemContext.finalSale,
      category: itemContext.itemCategories[0],
    },
  };
}

function evaluateLineItemRefundPolicy(
  order: RefundContextOrder,
  lineItem: RefundContextLineItem,
  config: RefundPolicyConfig,
): RefundPolicyLineItemEvaluation {
  const itemContext = createRefundPolicyItemContext(order, lineItem);
  const result = evaluateRefundPolicyItemContext(itemContext, config);
  const evidence = createLineItemEvidence(lineItem, result);

  return {
    decision: result.decision,
    reasons: result.reasons,
    evidence,
  };
}

function uniqueReasons(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): RefundReason[] {
  const seen = new Set<string>();
  const reasons: RefundReason[] = [];

  for (const itemEvaluation of itemEvaluations) {
    for (const reason of itemEvaluation.reasons) {
      const reasonKey = `${reason.code}:${reason.message}`;

      if (!seen.has(reasonKey)) {
        seen.add(reasonKey);
        reasons.push(reason);
      }
    }
  }

  return reasons;
}

function combineItemDecisions(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): RefundDecision {
  if (
    itemEvaluations.some(
      (itemEvaluation) =>
        itemEvaluation.decision === RefundDecision.ManualReview,
    )
  ) {
    return RefundDecision.ManualReview;
  }

  if (
    itemEvaluations.every(
      (itemEvaluation) => itemEvaluation.decision === RefundDecision.Eligible,
    )
  ) {
    return RefundDecision.Eligible;
  }

  if (
    itemEvaluations.every(
      (itemEvaluation) => itemEvaluation.decision === RefundDecision.Ineligible,
    )
  ) {
    return RefundDecision.Ineligible;
  }

  return RefundDecision.ManualReview;
}

function combineItemReasons(
  decision: RefundDecision,
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): RefundReason[] {
  const reasons = uniqueReasons(itemEvaluations);
  const itemDecisions = itemEvaluations.map(
    (itemEvaluation) => itemEvaluation.decision,
  );
  const hasMixedItemDecisions = new Set(itemDecisions).size > 1;

  if (decision === RefundDecision.ManualReview && hasMixedItemDecisions) {
    return [
      makeReason(
        RefundReasonCode.MixedItemEligibilityReviewRequired,
        REFUND_POLICY_REASON_COPY.mixedItemEligibilityReviewRequired,
      ),
      ...reasons,
    ];
  }

  return reasons;
}

// [fulfilled, fulfilled]       -> fulfilled
// [unfulfilled, unfulfilled]   -> unfulfilled
// [fulfilled, unfulfilled]     -> partial
// [fulfilled, partial]         -> partial
// [fulfilled, unknown]         -> unknown
// [unknown, unknown]           -> unknown
function summarizeFulfillmentStatus(
  lineItems: RefundContextLineItem[],
): FulfillmentStatus {
  const fulfillmentStatusValues = lineItems.map(
    (lineItem) => lineItem.fulfillmentStatus,
  );
  const fulfillmentStatuses = new Set(fulfillmentStatusValues);

  if (fulfillmentStatuses.size === 1) {
    return lineItems[0]!.fulfillmentStatus;
  }

  if (fulfillmentStatuses.has(FulfillmentStatus.Unknown)) {
    return FulfillmentStatus.Unknown;
  }

  return FulfillmentStatus.Partial;
}

// build order level summary based on all line items
function createEvaluatedOrder(
  input: RefundContext,
): EvaluatedRefundPolicyOrder {
  const lineItems = input.lineItems;
  const itemCategories = lineItems
    .map((lineItem) => lineItem.category)
    .filter((category): category is string => category !== undefined);

  // if the order financial status is Refunded, we treat every line item as refunded for summary purposes.
  const allLineItemsRefunded = lineItems.every(
    (lineItem) =>
      input.order.financialStatus === FinancialStatus.Refunded ||
      lineItem.alreadyRefunded,
  );
  const fulfillmentStatus = summarizeFulfillmentStatus(lineItems);
  const hasAnyReturnableFulfillment = lineItems.some(
    (lineItem) => lineItem.hasReturnableFulfillment,
  );
  const finalSale = lineItems.every((lineItem) => lineItem.finalSale);

  return {
    effectiveFinancialStatus:
      allLineItemsRefunded ||
      input.order.financialStatus === FinancialStatus.Refunded
        ? FinancialStatus.Refunded
        : input.order.financialStatus === FinancialStatus.PartiallyRefunded
          ? FinancialStatus.Paid
          : input.order.financialStatus,
    fulfillmentStatus,
    hasReturnableFulfillments: hasAnyReturnableFulfillment,
    allLineItemsRefunded,
    finalSale,
    itemCategories,
  };
}

// builds the order-level policy evidence from the already-computed line-item evaluations.
function createOrderEvidencePolicyContext(
  config: Required<RefundPolicyConfig>,
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): RefundPolicyEvidencePolicyContext {
  const itemPolicyContexts = itemEvaluations.map(
    (itemEvaluation) => itemEvaluation.evidence.policyContext,
  );
  const matchedCategoryWindowCategories = [
    ...new Set(
      itemPolicyContexts.flatMap(
        (policyContext) => policyContext.matchedCategoryWindowCategories,
      ),
    ),
  ];
  const matchedExceptionRuleTag = itemPolicyContexts.find(
    (policyContext) => policyContext.matchedExceptionRuleTag !== undefined,
  )?.matchedExceptionRuleTag;
  const isHighValueOrderThresholdFinite = Number.isFinite(
    config.highValueOrderThreshold,
  );

  return {
    refundWindowDays: config.refundWindowDays,
    effectiveRefundWindowDays: Math.min(
      ...itemPolicyContexts.map(
        (policyContext) => policyContext.effectiveRefundWindowDays,
      ),
    ),
    cancelWindowDays: config.cancelWindowDays,
    effectiveCancelWindowDays: Math.min(
      ...itemPolicyContexts.map(
        (policyContext) => policyContext.effectiveCancelWindowDays,
      ),
    ),
    highValueOrderThreshold: isHighValueOrderThresholdFinite
      ? config.highValueOrderThreshold
      : undefined,
    matchedCategoryWindowCategories,
    matchedExceptionRuleTag,
  };
}

function createOrderEvidence(
  input: RefundContext,
  config: RefundPolicyConfig,
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): RefundPolicyOrderEvidence {
  const effectiveConfig = createEffectivePolicyConfig(config);
  const evaluatedOrder = createEvaluatedOrder(input);

  return {
    order: input.order,
    policyContext: createOrderEvidencePolicyContext(
      effectiveConfig,
      itemEvaluations,
    ),
    evaluatedOrder,
  };
}

function evaluateItemLevelRefundPolicy(
  input: RefundContext,
  config: RefundPolicyConfig,
): RefundPolicyResult {
  if (input.lineItems.length === 0) {
    throw new Error(
      "Refund policy evaluation requires at least one line item.",
    );
  }

  const itemEvaluations = input.lineItems.map((lineItem) => {
    const itemEvaluation = evaluateLineItemRefundPolicy(
      input.order,
      lineItem,
      config,
    );

    return itemEvaluation;
  });
  const decision = combineItemDecisions(itemEvaluations);
  const reasons = combineItemReasons(decision, itemEvaluations);
  const evidence = createOrderEvidence(input, config, itemEvaluations);

  return {
    decision,
    reasons,
    evidence,
    itemEvaluations,
  };
}

// RefundContext contains normalized facts from Shopify / adapter.
// RefundPolicyRuleEvaluationContext is derived during rule evaluation:
// effective windows, matched rules, and evaluated item facts.
// RefundPolicyResult is the final decision with reasons and evidence.
export function evaluateRefundPolicy(
  input: RefundContext,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyResult {
  return evaluateItemLevelRefundPolicy(input, config);
}

export { DEFAULT_POLICY };
