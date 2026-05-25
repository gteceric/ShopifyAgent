import {
  createRefundContextAdapter,
  previewShopifyRefund,
  RefundActionValidationStatus,
  type PreviewShopifyRefundDependencies,
  type RefundActionBlocker,
  type RefundActionMatchedLineItem,
  type RefundContextPlatformAdapter,
  type RefundPolicyConfig,
  type ShopifyRefundPreview,
} from "@shopify-agent/core";
import { loadMerchantRefundPolicyConfig } from "./dashboard-order-evaluation";
import {
  validateDashboardRefundAction,
  type DashboardRefundActionRequest,
} from "./refund-action-validation";

export type RefundPreviewRequest = DashboardRefundActionRequest;

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
  shopifyPreviewDependencies?: PreviewShopifyRefundDependencies;
}

export async function previewRefund(
  input: RefundPreviewRequest,
  dependencies: PreviewRefundDependencies,
): Promise<RefundPreviewResult> {
  try {
    const { request, validation } = await validateDashboardRefundAction(
      input,
      dependencies,
    );

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
      dependencies.shopifyPreviewDependencies,
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
