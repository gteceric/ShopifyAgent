import {
  DEFAULT_POLICY,
  evaluateRefundPolicy,
} from "../domain/refund-policy.js";
import {
  RefundDecision,
  RefundReasonCode,
} from "../domain/refund-policy.types.js";
import type {
  RefundPolicyConfig,
  RefundPolicyInput,
  RefundPolicyResult,
} from "../domain/refund-policy.types.js";
import type { RefundContextPlatformAdapter } from "./refund-context-adapter.js";
import { createShopifyRefundContextAdapter } from "../platforms/shopify/load-refund-context.js";

// Keep the tool input minimal for v1. This can grow later if the caller needs
// merchant context, request metadata, or line-item-level refund requests.
export interface CheckRefundEligibilityInput {
  orderId: string;
}

export const RecommendedRefundAction = {
  Approve: "approve",
  Deny: "deny",
  ManualReview: "manual_review",
} as const;

export type RecommendedRefundAction =
  (typeof RecommendedRefundAction)[keyof typeof RecommendedRefundAction];

export interface CheckRefundEligibilityResult extends RefundPolicyResult {
  orderId: string;
  // These are derived helper fields for AI and UI consumers. They do not change
  // the core refund-policy decision; they make common interpretations explicit.
  exceptionAvailable: boolean;
  escalationRequired: boolean;
  recommendedNextAction: RecommendedRefundAction;
}

export interface CheckRefundEligibilityDeps {
  config?: RefundPolicyConfig;
  adapter?: RefundContextPlatformAdapter;
  loadContext?: (
    input: CheckRefundEligibilityInput,
  ) => Promise<RefundPolicyInput>;
}

function hasVipOverrideApplied(result: RefundPolicyResult): boolean {
  return result.reasons.some(
    (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
  );
}

function getRecommendedNextAction(
  decision: RefundDecision,
): RecommendedRefundAction {
  switch (decision) {
    case RefundDecision.Eligible:
      return RecommendedRefundAction.Approve;
    case RefundDecision.Ineligible:
      return RecommendedRefundAction.Deny;
    case RefundDecision.ManualReview:
      return RecommendedRefundAction.ManualReview;
  }
}

export async function checkRefundEligibility(
  input: CheckRefundEligibilityInput,
  deps: CheckRefundEligibilityDeps = {},
): Promise<CheckRefundEligibilityResult> {
  const adapter = deps.adapter;
  const loadContext =
    deps.loadContext ??
    (adapter
      ? (request: CheckRefundEligibilityInput) =>
          adapter.loadRefundContext(request)
      : createShopifyRefundContextAdapter().loadRefundContext);
  const context = await loadContext(input);
  const result = evaluateRefundPolicy(context, deps.config ?? DEFAULT_POLICY);

  return {
    orderId: input.orderId,
    ...result,
    // Keep AI-facing guidance explicit so clients do less inference from the
    // raw decision, reasons, and evidence payload.
    exceptionAvailable: hasVipOverrideApplied(result),
    escalationRequired: result.decision === RefundDecision.ManualReview,
    recommendedNextAction: getRecommendedNextAction(result.decision),
  };
}
