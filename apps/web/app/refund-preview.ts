import {
  checkRefundEligibility,
  createRefundContextAdapter,
  previewShopifyRefund,
  RefundActionValidationStatus,
  validateRefundAction,
  type CheckRefundEligibilityResult,
  type PreviewShopifyRefundDeps,
  type RefundActionBlocker,
  type RefundActionLineItemRequest,
  type RefundActionMatchedLineItem,
  type RefundContextPlatformAdapter,
  type RefundPolicyConfig,
  type ShopifyRefundPreview,
} from "@shopify-agent/core";
import { loadMerchantRefundPolicyConfig } from "./dashboard-order-evaluation";

export interface RefundPreviewRequest {
  orderId: string;
  lineItems: RefundActionLineItemRequest[];
}

type RefundPreviewBlockedStatus =
  | typeof RefundActionValidationStatus.Blocked
  | typeof RefundActionValidationStatus.RequiresReview;

export interface RefundPreviewSuccessResult {
  ok: true;
  validationStatus: typeof RefundActionValidationStatus.Ready;
  matchedLineItems: RefundActionMatchedLineItem[];
  preview: ShopifyRefundPreview;
}

export interface RefundPreviewFailureResult {
  ok: false;
  validationStatus?: RefundPreviewBlockedStatus;
  blockers?: RefundActionBlocker[];
  error?: string;
}

export type RefundPreviewResult =
  | RefundPreviewSuccessResult
  | RefundPreviewFailureResult;

export interface PreviewRefundDependencies {
  adapter: RefundContextPlatformAdapter;
  config: RefundPolicyConfig;
  shopifyPreviewDeps?: PreviewShopifyRefundDeps;
}

function parseRefundPreviewRequest(
  input: RefundPreviewRequest,
): RefundPreviewRequest {
  const orderId = input.orderId.trim();
  const lineItems = input.lineItems.map((lineItem) => ({
    lineItemId: lineItem.lineItemId.trim(),
    quantity: lineItem.quantity,
  }));

  if (!orderId) {
    throw new Error("Missing orderId.");
  }

  if (lineItems.length === 0) {
    throw new Error("Select at least one line item to preview.");
  }

  for (const lineItem of lineItems) {
    if (!lineItem.lineItemId) {
      throw new Error("Every selected line item needs a lineItemId.");
    }
  }

  return { orderId, lineItems };
}

export async function previewRefund(
  input: RefundPreviewRequest,
  dependencies: PreviewRefundDependencies,
): Promise<RefundPreviewResult> {
  try {
    const request = parseRefundPreviewRequest(input);
    const eligibilityInput = { orderId: request.orderId };
    const eligibilityDependencies = {
      adapter: dependencies.adapter,
      config: dependencies.config,
    };
    const eligibilityResult: CheckRefundEligibilityResult =
      await checkRefundEligibility(eligibilityInput, eligibilityDependencies);
    const validation = validateRefundAction(request, eligibilityResult);

    if (validation.status !== RefundActionValidationStatus.Ready) {
      return {
        ok: false,
        validationStatus: validation.status,
        blockers: validation.blockers,
      };
    }

    const preview = await previewShopifyRefund(
      {
        orderId: request.orderId,
        refundLineItems: validation.matchedLineItems.map((lineItem) => ({
          lineItemId: lineItem.lineItemId,
          quantity: lineItem.requestedQuantity,
        })),
      },
      dependencies.shopifyPreviewDeps,
    );

    return {
      ok: true,
      validationStatus: validation.status,
      matchedLineItems: validation.matchedLineItems,
      preview,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Refund preview failed.",
    };
  }
}

export async function previewRefundForDashboard(
  input: RefundPreviewRequest,
): Promise<RefundPreviewResult> {
  const config = await loadMerchantRefundPolicyConfig();
  const dependencies: PreviewRefundDependencies = {
    adapter: createRefundContextAdapter(),
    config,
  };

  return previewRefund(input, dependencies);
}
