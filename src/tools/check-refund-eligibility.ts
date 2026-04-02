import {
  DEFAULT_POLICY,
  evaluateRefundPolicy,
} from "../policy/refund-policy.js";
import type {
  RefundPolicyConfig,
  RefundPolicyInput,
  RefundPolicyResult,
} from "../policy/refund-policy.types.js";
import { loadRefundContext } from "../shopify/load-refund-context.js";

// Keep the tool input minimal for v1. This can grow later if the caller needs
// merchant context, request metadata, or line-item-level refund requests.
export interface CheckRefundEligibilityInput {
  orderId: string;
}

export interface CheckRefundEligibilityResult extends RefundPolicyResult {
  orderId: string;
}

export interface CheckRefundEligibilityDeps {
  config?: RefundPolicyConfig;
  loadContext?: (input: CheckRefundEligibilityInput) => Promise<RefundPolicyInput>;
}

export async function checkRefundEligibility(
  input: CheckRefundEligibilityInput,
  deps: CheckRefundEligibilityDeps = {},
): Promise<CheckRefundEligibilityResult> {
  const loadContext = deps.loadContext ?? loadRefundContext;
  const context = await loadContext(input);
  const result = evaluateRefundPolicy(context, deps.config ?? DEFAULT_POLICY);

  return {
    orderId: input.orderId,
    ...result,
  };
}
