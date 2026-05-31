import {
  FinancialStatus,
  FulfillmentStatus,
  ManualReviewKind,
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
  ResolvedPolicyContext,
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
  fulfillmentStatus: FulfillmentStatus; // fulfillment status normalized by the adapter
  hasReturnableFulfillment: boolean; // whether the adapter found returnable fulfillment
  alreadyRefunded: boolean; // derived from normalized order/item refund state
  returnableQuantity: number; // quantity currently available through the returnable fulfillment path
  pendingRefundQuantity?: number; // quantity currently attached to an in-flight refund
  finalSale: boolean; // normalized final-sale status
  itemCategories: string[]; // normalized product category data
}

interface RefundPolicyEvaluationResult {
  itemContext: RefundPolicyItemContext; // normalized facts used for the policy decision
  policyContext: ResolvedPolicyContext; // resolved policy values used for this item
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
  refundPending:
    "Refund has already been initiated and is still pending.",
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
  unfulfilledOutsideWindowAllowed:
    "Refund subject has not been fulfilled yet, and merchant policy allows cancellation outside the standard cancellation window.",
} as const;

const HARD_MANUAL_REVIEW_REASON_CODES: RefundReasonCode[] = [
  RefundReasonCode.ManualReviewRequired,
  RefundReasonCode.FinancialStatusReviewRequired,
  RefundReasonCode.HighValueOrderReviewRequired,
  RefundReasonCode.PartialFulfillmentReviewRequired,
  RefundReasonCode.PreFulfillmentCancellationReviewRequired,
  RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
];

function financialStatusReviewRequiredMessage(
  effectiveFinancialStatus: FinancialStatus,
): string {
  const statusLabel = effectiveFinancialStatus.replace(/_/g, " ");

  return `Refund subject financial status is ${statusLabel}, so it requires human review before a refund decision is approved.`;
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

// Resolve the configured policy windows that apply to one line item,
// including category-based overrides.
function resolveLineItemPolicyContext(
  itemContext: RefundPolicyItemContext,
  config: Required<RefundPolicyConfig>,
): ResolvedPolicyContext {
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

function makeEvaluationResult(
  itemContext: RefundPolicyItemContext,
  policyContext: ResolvedPolicyContext,
  decision: RefundDecision,
  reasons: RefundReason[],
): RefundPolicyEvaluationResult {
  return {
    decision,
    reasons,
    itemContext,
    policyContext,
  };
}

// These manual-review checks short-circuit before blocker, override, and
// merchant exception handling.
function getImmediateManualReviewReasons(
  itemContext: RefundPolicyItemContext,
  config: Required<RefundPolicyConfig>,
): RefundReason[] | undefined {
  const order = itemContext.order;
  const flags = order.flags;
  const requiresHighValueReview =
    Number.isFinite(config.highValueOrderThreshold) &&
    order.totalAmount >= config.highValueOrderThreshold;
  const requiresFinancialStatusReview =
    itemContext.effectiveFinancialStatus === FinancialStatus.PaymentPending ||
    itemContext.effectiveFinancialStatus === FinancialStatus.PartiallyPaid ||
    itemContext.effectiveFinancialStatus === FinancialStatus.Voided ||
    itemContext.effectiveFinancialStatus === FinancialStatus.Unknown;

  if (flags.fraudHold || flags.manualReview) {
    return [
      makeReason(
        RefundReasonCode.ManualReviewRequired,
        REFUND_POLICY_REASON_COPY.manualReviewRequired,
      ),
    ];
  }

  if (requiresHighValueReview) {
    return [
      makeReason(
        RefundReasonCode.HighValueOrderReviewRequired,
        highValueOrderReviewRequiredMessage(
          order.totalAmount,
          config.highValueOrderThreshold,
        ),
      ),
    ];
  }

  if (requiresFinancialStatusReview) {
    return [
      makeReason(
        RefundReasonCode.FinancialStatusReviewRequired,
        financialStatusReviewRequiredMessage(
          itemContext.effectiveFinancialStatus,
        ),
      ),
    ];
  }

  if (itemContext.fulfillmentStatus === FulfillmentStatus.Partial) {
    return [
      makeReason(
        RefundReasonCode.PartialFulfillmentReviewRequired,
        REFUND_POLICY_REASON_COPY.partialFulfillmentReviewRequired,
      ),
    ];
  }

  return undefined;
}

// Apply a merchant-configured exception only after blockers have been collected,
// so the result can show both the exception and the blockers it overrode.
function applyMerchantExceptionRule(
  itemContext: RefundPolicyItemContext,
  policyContext: ResolvedPolicyContext,
  config: Required<RefundPolicyConfig>,
  blockingReasons: RefundReason[],
): RefundPolicyEvaluationResult | undefined {
  if (blockingReasons.length === 0) {
    return undefined;
  }

  const matchingExceptionRule = findMatchingExceptionRule(
    itemContext.order.tags,
    config.exceptionRules,
  );

  if (!matchingExceptionRule) {
    return undefined;
  }

  const result = makeEvaluationResult(
    itemContext,
    {
      ...policyContext,
      matchedExceptionRuleTag: matchingExceptionRule.tag,
    },
    matchingExceptionRule.decision,
    [
      makeReason(
        RefundReasonCode.MerchantExceptionRuleApplied,
        matchingExceptionRule.message,
      ),
      ...blockingReasons,
    ],
  );
  return result;
}

// Called only after manual-review, blocking, exception, and window checks have
// passed. It chooses the final explanation for an eligible item.
function getFinalEligibleReasons(
  itemContext: RefundPolicyItemContext,
  policyContext: ResolvedPolicyContext,
  overrideReasons: RefundReason[],
): RefundReason[] {
  if (overrideReasons.length > 0) {
    return overrideReasons.slice(0, 1);
  }

  if (itemContext.fulfillmentStatus === FulfillmentStatus.Unfulfilled) {
    return [
      makeReason(
        RefundReasonCode.WithinCancelWindow,
        withinCancelWindowMessage(policyContext.effectiveCancelWindowDays),
      ),
    ];
  }

  return [
    makeReason(
      RefundReasonCode.WithinRefundWindow,
      withinRefundWindowMessage(policyContext.effectiveRefundWindowDays),
    ),
  ];
}

function evaluateRefundPolicyForItem(
  itemContext: RefundPolicyItemContext,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyEvaluationResult {
  const order = itemContext.order;
  const effectiveConfig = createEffectivePolicyConfig(config);
  const policyContext = resolveLineItemPolicyContext(
    itemContext,
    effectiveConfig,
  );
  const flags = order.flags;
  const effectiveRefundWindowDays = policyContext.effectiveRefundWindowDays;
  const effectiveCancelWindowDays = policyContext.effectiveCancelWindowDays;
  const isUnfulfilledRefundSubject =
    itemContext.fulfillmentStatus === FulfillmentStatus.Unfulfilled;
  const isUnfulfilledFinalSaleRefundSubject =
    isUnfulfilledRefundSubject && itemContext.finalSale && !flags.vipOverride;
  const blockingReasons: RefundReason[] = [];
  const overrideReasons: RefundReason[] = [];
  const immediateManualReviewReasons = getImmediateManualReviewReasons(
    itemContext,
    effectiveConfig,
  );

  // These review reasons stop evaluation before normal eligibility rules run.
  if (immediateManualReviewReasons) {
    const result = makeEvaluationResult(
      itemContext,
      policyContext,
      RefundDecision.ManualReview,
      immediateManualReviewReasons,
    );
    return result;
  }

  if (itemContext.effectiveFinancialStatus === FinancialStatus.RefundPending) {
    blockingReasons.push(
      makeReason(
        RefundReasonCode.RefundPending,
        REFUND_POLICY_REASON_COPY.refundPending,
      ),
    );
  }

  if (itemContext.alreadyRefunded) {
    // Merchant config decides whether already-refunded items require review
    // or are automatically ineligible.
    if (
      effectiveConfig.alreadyRefundedDecision === RefundDecision.ManualReview
    ) {
      const result = makeEvaluationResult(
        itemContext,
        policyContext,
        RefundDecision.ManualReview,
        [
          makeReason(
            RefundReasonCode.AlreadyFullyRefunded,
            REFUND_POLICY_REASON_COPY.alreadyRefundedReview,
          ),
        ],
      );
      return result;
    }

    blockingReasons.push(
      makeReason(
        RefundReasonCode.AlreadyFullyRefunded,
        REFUND_POLICY_REASON_COPY.alreadyRefunded,
      ),
    );
  }

  // Merchant config decides whether unfulfilled final-sale items can be canceled.
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
        return makeEvaluationResult(
          itemContext,
          policyContext,
          RefundDecision.ManualReview,
          [
            makeReason(
              RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
              REFUND_POLICY_REASON_COPY.preFulfillmentFinalSaleReviewRequired,
            ),
          ],
        );
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

  // Merchant config decides how to handle unfulfilled items outside the cancellation window.
  if (
    isUnfulfilledRefundSubject &&
    itemContext.effectiveAgeDays > effectiveCancelWindowDays &&
    !flags.vipOverride
  ) {
    switch (effectiveConfig.unfulfilledOutsideWindowDecision) {
      case RefundDecision.Eligible:
        return makeEvaluationResult(
          itemContext,
          policyContext,
          RefundDecision.Eligible,
          [
            makeReason(
              RefundReasonCode.UnfulfilledOutsideWindowAllowed,
              REFUND_POLICY_REASON_COPY.unfulfilledOutsideWindowAllowed,
            ),
            makeReason(
              RefundReasonCode.OutsideCancelWindow,
              outsideCancelWindowMessage(effectiveCancelWindowDays),
            ),
          ],
        );
      case RefundDecision.Ineligible:
        blockingReasons.push(
          makeReason(
            RefundReasonCode.OutsideCancelWindow,
            outsideCancelWindowMessage(effectiveCancelWindowDays),
          ),
        );
        break;
      case RefundDecision.ManualReview:
        return makeEvaluationResult(
          itemContext,
          policyContext,
          RefundDecision.ManualReview,
          [
            makeReason(
              RefundReasonCode.PreFulfillmentCancellationReviewRequired,
              preFulfillmentCancellationReviewRequiredMessage(
                effectiveCancelWindowDays,
              ),
            ),
          ],
        );
    }
  }

  if (
    !isUnfulfilledRefundSubject &&
    itemContext.effectiveAgeDays > effectiveRefundWindowDays &&
    !flags.vipOverride
  ) {
    // Fulfilled item outside refund window, without VIP override.
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
    // Fulfilled item outside refund window, with VIP override.
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
    // Fulfilled item has no returnable fulfillment, without VIP override.
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
    // Fulfilled item has no returnable fulfillment, with VIP override.
    // e.g. damaged item but return not required / lost package
    overrideReasons.push(
      makeReason(
        RefundReasonCode.VipOverrideApplied,
        REFUND_POLICY_REASON_COPY.vipOverrideWithoutReturnableFulfillments,
      ),
    );
  }

  const exceptionResult = applyMerchantExceptionRule(
    itemContext,
    policyContext,
    effectiveConfig,
    blockingReasons,
  );

  if (exceptionResult) {
    return exceptionResult;
  }

  // Merchant exceptions have already had a chance to override these blockers.
  // Any remaining blockers make the item ineligible.
  if (blockingReasons.length > 0) {
    return makeEvaluationResult(
      itemContext,
      policyContext,
      RefundDecision.Ineligible,
      blockingReasons,
    );
  }

  return makeEvaluationResult(
    itemContext,
    policyContext,
    RefundDecision.Eligible,
    getFinalEligibleReasons(itemContext, policyContext, overrideReasons),
  );
}

function deriveEffectiveLineItemFinancialStatus(
  orderFinancialStatus: FinancialStatus,
  lineItemAlreadyRefunded: boolean,
  lineItemReturnableQuantity: number,
  lineItemPendingRefundQuantity?: number,
): FinancialStatus {
  if (
    lineItemPendingRefundQuantity &&
    lineItemPendingRefundQuantity > 0 &&
    lineItemReturnableQuantity <= 0
  ) {
    return FinancialStatus.RefundPending;
  }

  if (lineItemAlreadyRefunded) {
    return FinancialStatus.Refunded;
  }

  // order level fallback
  switch (orderFinancialStatus) {
    case FinancialStatus.Refunded:
      return FinancialStatus.Refunded;
    case FinancialStatus.RefundPending:
      return FinancialStatus.RefundPending;
    case FinancialStatus.PartiallyRefunded:
      return FinancialStatus.Paid;
    default:
      return orderFinancialStatus;
  }
}

// Convert adapter-normalized order and line item facts into the shape used by
// the policy rules for one refund subject.
function createRefundPolicyItemContext(
  order: RefundContextOrder,
  lineItem: RefundContextLineItem,
): RefundPolicyItemContext {
  const effectiveFinancialStatus = deriveEffectiveLineItemFinancialStatus(
    order.financialStatus,
    lineItem.alreadyRefunded,
    lineItem.returnableQuantity,
    lineItem.pendingRefundQuantity,
  );
  return {
    order,
    effectiveAgeDays: lineItem.ageDaysOverride ?? order.ageDays,
    effectiveFinancialStatus,
    fulfillmentStatus: lineItem.fulfillmentStatus,
    hasReturnableFulfillment: lineItem.hasReturnableFulfillment,
    alreadyRefunded: lineItem.alreadyRefunded,
    returnableQuantity: lineItem.returnableQuantity,
    pendingRefundQuantity: lineItem.pendingRefundQuantity,
    finalSale: lineItem.finalSale,
    itemCategories: lineItem.category ? [lineItem.category] : [],
  };
}

function createLineItemEvidence(
  lineItem: RefundContextLineItem,
  result: RefundPolicyEvaluationResult,
): RefundPolicyLineItemEvidence {
  const itemContext = result.itemContext;
  const order = itemContext.order;

  return {
    order,
    policyContext: result.policyContext,
    evaluatedLineItem: {
      lineItemId: lineItem.lineItemId,
      title: lineItem.title,
      ...(lineItem.sku ? { sku: lineItem.sku } : {}),
      ...(lineItem.variantTitle ? { variantTitle: lineItem.variantTitle } : {}),
      ...(lineItem.variantOptions
        ? { variantOptions: lineItem.variantOptions }
        : {}),
      ...(lineItem.imageUrl ? { imageUrl: lineItem.imageUrl } : {}),
      ...(lineItem.imageAltText ? { imageAltText: lineItem.imageAltText } : {}),
      ...(lineItem.unitPrice ? { unitPrice: lineItem.unitPrice } : {}),
      returnableQuantity: lineItem.returnableQuantity,
      ...(lineItem.pendingRefundQuantity !== undefined
        ? { pendingRefundQuantity: lineItem.pendingRefundQuantity }
        : {}),
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
  const result = evaluateRefundPolicyForItem(itemContext, config);
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

function resolveManualReviewKind(
  decision: RefundDecision,
  reasons: RefundReason[],
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): ManualReviewKind | undefined {
  if (decision !== RefundDecision.ManualReview) {
    return undefined;
  }

  if (
    reasons.some((reason) =>
      HARD_MANUAL_REVIEW_REASON_CODES.includes(reason.code),
    )
  ) {
    return ManualReviewKind.HardReason;
  }

  const itemDecisions = itemEvaluations.map(
    (itemEvaluation) => itemEvaluation.decision,
  );
  const hasMixedItemDecisions = new Set(itemDecisions).size > 1;

  return hasMixedItemDecisions ? ManualReviewKind.MixedItem : undefined;
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

// Build the order-level summary from all line items.
function createEvaluatedOrder(
  input: RefundContext,
): EvaluatedRefundPolicyOrder {
  const lineItems = input.lineItems;
  const itemCategories = lineItems
    .map((lineItem) => lineItem.category)
    .filter((category): category is string => category !== undefined);

  // If the order financial status is Refunded, we treat every line item as
  // refunded for summary purposes. RefundPending stays distinct so the UI does
  // not present an in-flight refund as completed.
  const allLineItemsRefunded = lineItems.every(
    (lineItem) =>
      input.order.financialStatus === FinancialStatus.Refunded ||
      lineItem.alreadyRefunded,
  );
  const fulfillmentStatus = summarizeFulfillmentStatus(lineItems);
  const hasAnyReturnableFulfillment = lineItems.some(
    (lineItem) => lineItem.hasReturnableFulfillment,
  );
  const allLineItemsFinalSale = lineItems.every(
    (lineItem) => lineItem.finalSale,
  );

  return {
    effectiveFinancialStatus:
      input.order.financialStatus === FinancialStatus.RefundPending
        ? FinancialStatus.RefundPending
        : allLineItemsRefunded ||
            input.order.financialStatus === FinancialStatus.Refunded
          ? FinancialStatus.Refunded
          : input.order.financialStatus === FinancialStatus.PartiallyRefunded
            ? FinancialStatus.Paid
            : input.order.financialStatus,
    fulfillmentStatus,
    hasAnyReturnableFulfillment,
    allLineItemsRefunded,
    allLineItemsFinalSale,
    itemCategories,
  };
}

// Aggregate the resolved policy contexts from each line-item evaluation into
// the order-level policy context shown in final evidence
// (used to explain the final result)
function resolveOrderPolicyContext(
  config: Required<RefundPolicyConfig>,
  itemEvaluations: RefundPolicyLineItemEvaluation[],
): ResolvedPolicyContext {
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
    policyContext: resolveOrderPolicyContext(effectiveConfig, itemEvaluations),
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
  const manualReviewKind = resolveManualReviewKind(
    decision,
    reasons,
    itemEvaluations,
  );
  const evidence = createOrderEvidence(input, config, itemEvaluations);

  return {
    decision,
    ...(manualReviewKind ? { manualReviewKind } : {}),
    reasons,
    evidence,
    itemEvaluations,
  };
}

// RefundContext contains normalized facts from the platform adapter.
// ResolvedPolicyContext contains effective windows and matched policy rules.
// RefundPolicyResult is the final decision with reasons and evidence.
export function evaluateRefundPolicy(
  input: RefundContext,
  config: RefundPolicyConfig = DEFAULT_POLICY,
): RefundPolicyResult {
  return evaluateItemLevelRefundPolicy(input, config);
}

export { DEFAULT_POLICY };
