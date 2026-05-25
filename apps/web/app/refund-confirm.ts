import {
  createRefundContextAdapter,
  executeShopifyRefundAction,
  RefundActionValidationStatus,
  type ExecuteShopifyRefundActionDependencies,
  type RefundActionBlocker,
  type RefundActionMatchedLineItem,
  type ShopifyRefundActionResult,
} from "@shopify-agent/core";
import { loadMerchantRefundPolicyConfig } from "./dashboard-order-evaluation";
import {
  validateDashboardRefundAction,
  type DashboardRefundActionRequest,
  type DashboardRefundActionValidationDependencies,
} from "./refund-action-validation";

export interface RefundConfirmRequest extends DashboardRefundActionRequest {
  idempotencyKey: string;
  note?: string;
}

type RefundConfirmBlockedStatus =
  | typeof RefundActionValidationStatus.Blocked
  | typeof RefundActionValidationStatus.RequiresReview;

export interface RefundConfirmSuccessResult {
  ok: true;
  validationStatus: typeof RefundActionValidationStatus.Ready;
  matchedLineItems: RefundActionMatchedLineItem[];
  refund: ShopifyRefundActionResult;
}

export interface RefundConfirmFailureResult {
  ok: false;
  validationStatus?: RefundConfirmBlockedStatus;
  blockers?: RefundActionBlocker[];
  error?: string;
  refund?: ShopifyRefundActionResult;
}

export type RefundConfirmResult =
  | RefundConfirmSuccessResult
  | RefundConfirmFailureResult;

export interface ConfirmRefundDependencies
  extends DashboardRefundActionValidationDependencies {
  shopifyExecutionDependencies?: ExecuteShopifyRefundActionDependencies;
}

function parseIdempotencyKey(idempotencyKey: string): string {
  const trimmedIdempotencyKey = idempotencyKey.trim();

  if (!trimmedIdempotencyKey) {
    throw new Error("Missing refund confirmation idempotency key.");
  }

  return trimmedIdempotencyKey;
}

function getShopifyUserErrorMessage(
  refund: ShopifyRefundActionResult,
): string | undefined {
  if (refund.userErrors.length === 0) {
    return undefined;
  }

  return refund.userErrors.map((userError) => userError.message).join(" ");
}

export async function confirmRefund(
  input: RefundConfirmRequest,
  dependencies: ConfirmRefundDependencies,
): Promise<RefundConfirmResult> {
  try {
    const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
    const { validation } = await validateDashboardRefundAction(
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

    const refund = await executeShopifyRefundAction(
      {
        validation,
        idempotencyKey,
        note: input.note,
      },
      dependencies.shopifyExecutionDependencies,
    );

    if (refund.status === "failed" || refund.userErrors.length > 0) {
      return {
        ok: false,
        error:
          getShopifyUserErrorMessage(refund) ??
          "Shopify refund execution failed.",
        refund,
      };
    }

    return {
      ok: true,
      validationStatus: validation.status,
      matchedLineItems: validation.matchedLineItems,
      refund,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Refund confirmation failed.",
    };
  }
}

export async function confirmRefundForDashboard(
  input: RefundConfirmRequest,
): Promise<RefundConfirmResult> {
  const config = await loadMerchantRefundPolicyConfig();
  const dependencies: ConfirmRefundDependencies = {
    adapter: createRefundContextAdapter(),
    config,
  };

  return confirmRefund(input, dependencies);
}
