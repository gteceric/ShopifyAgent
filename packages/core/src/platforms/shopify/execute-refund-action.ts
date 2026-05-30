import type { RefundActionValidation } from "../../application/validate-refund-action.js";
import {
  RefundProcessingStatus,
} from "../../domain/refund-processing-status.js";
import { deriveShopifyRefundProcessingStatusFromTransactions } from "./refund-processing-status.js";
import {
  buildShopifyRefundCreateGraphqlRequest,
  resolveRefundTransactionInputs,
  type ResolveRefundTransactionInputsInput,
} from "./build-refund-create-request.js";
import {
  previewShopifyRefund,
  type PreviewShopifyRefundDependencies,
  type PreviewShopifyRefundInput,
} from "./preview-refund.js";
import {
  hasShopifyAdminConfig,
  shopifyAdminFetch,
} from "./shopify-admin.js";
import type { ShopifyAdminFetchOptions } from "./shopify-admin.js";

export const ShopifyRefundActionExecutionStatus = {
  Succeeded: "succeeded",
  Pending: "pending",
  Failed: "failed",
} as const;

export type ShopifyRefundActionExecutionStatus =
  (typeof ShopifyRefundActionExecutionStatus)[keyof typeof ShopifyRefundActionExecutionStatus];

export interface ExecuteShopifyRefundActionInput {
  validation: RefundActionValidation;
  idempotencyKey: string;
  note?: string;
}

export interface ExecuteShopifyRefundActionDependencies {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface ShopifyRefundActionExecutedLineItem {
  lineItemId: string;
  quantity: number;
  title?: string;
}

export interface ShopifyRefundActionUserError {
  field?: string[] | null;
  message: string;
}

export interface ShopifyRefundActionTransaction {
  id: string;
  kind: string;
  gateway: string;
  status: string;
  amount: {
    amount: string;
    currencyCode: string;
  };
}

export interface ShopifyRefundActionResult {
  orderId: string;
  status: ShopifyRefundActionExecutionStatus;
  idempotencyKey: string;
  source: "mock" | "shopify";
  refundId?: string;
  totalRefunded?: {
    amount: string;
    currencyCode: string;
  };
  lineItems: ShopifyRefundActionExecutedLineItem[];
  refundTransactions?: ShopifyRefundActionTransaction[];
  userErrors: ShopifyRefundActionUserError[];
}

interface ShopifyRefundCreateResponse {
  refundCreate: {
    refund?: {
      id: string;
      totalRefundedSet?: {
        presentmentMoney?: {
          amount?: string | null;
          currencyCode?: string | null;
        } | null;
      } | null;
      transactions?: {
        edges: Array<{
          node: {
            id: string;
            kind: string;
            gateway: string;
            status: string;
            amountSet: {
              presentmentMoney: {
                amount: string;
                currencyCode: string;
              };
            };
          };
        }>;
      } | null;
    } | null;
    order?: {
      id: string;
    } | null;
    userErrors: ShopifyRefundActionUserError[];
  };
}

function shouldUseRealShopify(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USE_REAL_SHOPIFY === "true";
}

function isRealRefundExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_REAL_REFUND_EXECUTION === "true";
}

function mapExecutedLineItems(
  validation: RefundActionValidation,
): ShopifyRefundActionExecutedLineItem[] {
  return validation.matchedLineItems.map((lineItem) => ({
    lineItemId: lineItem.lineItemId,
    quantity: lineItem.requestedQuantity,
    ...(lineItem.title ? { title: lineItem.title } : {}),
  }));
}

function executeMockShopifyRefundAction(
  input: ExecuteShopifyRefundActionInput,
): ShopifyRefundActionResult {
  const request = buildShopifyRefundCreateGraphqlRequest(input.validation, {
    idempotencyKey: input.idempotencyKey,
    note: input.note,
  });

  return {
    orderId: request.variables.input.orderId,
    status: ShopifyRefundActionExecutionStatus.Succeeded,
    idempotencyKey: request.variables.idempotencyKey,
    source: "mock",
    refundId: `mock://shopify/Refund/${encodeURIComponent(
      request.variables.idempotencyKey,
    )}`,
    lineItems: mapExecutedLineItems(input.validation),
    userErrors: [],
  };
}

function mapShopifyRefundTransactions(
  refund: NonNullable<ShopifyRefundCreateResponse["refundCreate"]["refund"]>,
): ShopifyRefundActionTransaction[] {
  return (
    refund.transactions?.edges.map(({ node }) => ({
      id: node.id,
      kind: node.kind,
      gateway: node.gateway,
      status: node.status,
      amount: {
        amount: node.amountSet.presentmentMoney.amount,
        currencyCode: node.amountSet.presentmentMoney.currencyCode,
      },
    })) ?? []
  );
}

function deriveRefundActionExecutionStatus(
  refundTransactions: ShopifyRefundActionTransaction[],
): ShopifyRefundActionExecutionStatus {
  const refundProcessingStatus =
    deriveShopifyRefundProcessingStatusFromTransactions(refundTransactions);

  switch (refundProcessingStatus) {
    case RefundProcessingStatus.Pending:
      return ShopifyRefundActionExecutionStatus.Pending;

    case RefundProcessingStatus.Failed:
      return ShopifyRefundActionExecutionStatus.Failed;

    case RefundProcessingStatus.Succeeded:
    case RefundProcessingStatus.Unknown:
      return ShopifyRefundActionExecutionStatus.Succeeded;
  }
}

function mapShopifyRefundActionResult(
  input: ExecuteShopifyRefundActionInput,
  response: ShopifyRefundCreateResponse,
): ShopifyRefundActionResult {
  const payload = response.refundCreate;
  const refund = payload.refund ?? undefined;
  const refundedMoney = refund?.totalRefundedSet?.presentmentMoney;
  const refundTransactions = refund ? mapShopifyRefundTransactions(refund) : [];
  const executionStatus = deriveRefundActionExecutionStatus(refundTransactions);

  if (payload.userErrors.length > 0) {
    return {
      orderId: input.validation.orderId,
      status: ShopifyRefundActionExecutionStatus.Failed,
      idempotencyKey: input.idempotencyKey,
      source: "shopify",
      lineItems: mapExecutedLineItems(input.validation),
      userErrors: payload.userErrors,
    };
  }

  if (!refund) {
    return {
      orderId: input.validation.orderId,
      status: ShopifyRefundActionExecutionStatus.Failed,
      idempotencyKey: input.idempotencyKey,
      source: "shopify",
      lineItems: mapExecutedLineItems(input.validation),
      userErrors: [
        {
          message: "Shopify refundCreate did not return a refund.",
        },
      ],
    };
  }

  return {
    orderId: payload.order?.id ?? input.validation.orderId,
    status: executionStatus,
    idempotencyKey: input.idempotencyKey,
    source: "shopify",
    refundId: refund.id,
    ...(refundedMoney?.amount && refundedMoney.currencyCode
      ? {
          totalRefunded: {
            amount: refundedMoney.amount,
            currencyCode: refundedMoney.currencyCode,
          },
        }
      : {}),
    lineItems: mapExecutedLineItems(input.validation),
    ...(refundTransactions.length > 0 ? { refundTransactions } : {}),
    userErrors: [],
  };
}

async function executeRealShopifyRefundAction(
  input: ExecuteShopifyRefundActionInput,
  dependencies: ExecuteShopifyRefundActionDependencies,
): Promise<ShopifyRefundActionResult> {
  const refundPreviewInput: PreviewShopifyRefundInput = {
    orderId: input.validation.orderId,
    refundLineItems: input.validation.matchedLineItems.map((lineItem) => ({
      lineItemId: lineItem.lineItemId,
      quantity: lineItem.requestedQuantity,
    })),
  };
  const refundPreviewDependencies: PreviewShopifyRefundDependencies = {
    env: dependencies.env,
    fetchImpl: dependencies.fetchImpl,
  };
  const refundPreview = await previewShopifyRefund(
    refundPreviewInput,
    refundPreviewDependencies,
  );
  const refundTransactionInput: ResolveRefundTransactionInputsInput = {
    orderId: input.validation.orderId,
    refundPreview,
  };
  const refundTransactionInputs =
    resolveRefundTransactionInputs(refundTransactionInput);
  const request = buildShopifyRefundCreateGraphqlRequest(input.validation, {
    idempotencyKey: input.idempotencyKey,
    refundTransactionInputs,
    note: input.note,
  });
  const shopifyAdminOptions: ShopifyAdminFetchOptions = {
    env: dependencies.env,
    fetchImpl: dependencies.fetchImpl,
  };
  const response = await shopifyAdminFetch<ShopifyRefundCreateResponse>(
    request.query,
    request.variables,
    shopifyAdminOptions,
  );

  return mapShopifyRefundActionResult(input, response);
}

export async function executeShopifyRefundAction(
  input: ExecuteShopifyRefundActionInput,
  dependencies: ExecuteShopifyRefundActionDependencies = {},
): Promise<ShopifyRefundActionResult> {
  if (shouldUseRealShopify(dependencies.env)) {
    if (!hasShopifyAdminConfig(dependencies.env)) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
      );
    }

    if (!isRealRefundExecutionEnabled(dependencies.env)) {
      throw new Error(
        "Real Shopify refund execution requires ENABLE_REAL_REFUND_EXECUTION=true.",
      );
    }

    return executeRealShopifyRefundAction(input, dependencies);
  }

  return executeMockShopifyRefundAction(input);
}
