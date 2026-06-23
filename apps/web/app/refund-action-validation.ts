import {
  checkRefundEligibility,
  validateRefundAction,
  type CheckRefundEligibilityResult,
  type RefundActionLineItemRequest,
  type RefundActionValidation,
  type RefundContextPlatformAdapter,
  type RefundPolicyConfig,
} from "@shopify-agent/core";

export interface DashboardRefundActionRequest {
  orderId: string;
  shopDomain?: string | null;
  lineItems: RefundActionLineItemRequest[];
}

export interface DashboardRefundActionValidationDependencies {
  adapter: RefundContextPlatformAdapter;
  config: RefundPolicyConfig;
}

export interface DashboardRefundActionValidationResult {
  request: DashboardRefundActionRequest;
  eligibilityResult: CheckRefundEligibilityResult;
  validation: RefundActionValidation;
}

export function parseDashboardRefundActionRequest(
  input: DashboardRefundActionRequest,
): DashboardRefundActionRequest {
  const orderId = input.orderId.trim();
  const shopDomain = input.shopDomain?.trim() || null;
  const lineItems = input.lineItems.map((lineItem) => ({
    lineItemId: lineItem.lineItemId.trim(),
    quantity: lineItem.quantity,
  }));

  if (!orderId) {
    throw new Error("Missing orderId.");
  }

  if (lineItems.length === 0) {
    throw new Error("Select at least one line item.");
  }

  for (const lineItem of lineItems) {
    if (!lineItem.lineItemId) {
      throw new Error("Every selected line item needs a lineItemId.");
    }
  }

  return { orderId, shopDomain, lineItems };
}

export async function validateDashboardRefundAction(
  input: DashboardRefundActionRequest,
  dependencies: DashboardRefundActionValidationDependencies,
): Promise<DashboardRefundActionValidationResult> {
  const request = parseDashboardRefundActionRequest(input);
  const eligibilityInput = { orderId: request.orderId };
  const eligibilityDependencies = {
    adapter: dependencies.adapter,
    config: dependencies.config,
  };
  const eligibilityResult = await checkRefundEligibility(
    eligibilityInput,
    eligibilityDependencies,
  );
  const validation = validateRefundAction(request, eligibilityResult);

  return {
    request,
    eligibilityResult,
    validation,
  };
}
