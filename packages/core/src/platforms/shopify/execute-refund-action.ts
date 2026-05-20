import type { RefundActionValidation } from "../../application/validate-refund-action.js";
import {
  buildRefundTransactionInputsFromSuggestedRefund,
  buildShopifyRefundCreateGraphqlRequest,
  type BuildRefundTransactionInputsFromSuggestedRefundInput,
} from "./build-refund-create-request.js";
import {
  loadShopifySuggestedRefund,
  type LoadShopifySuggestedRefundDeps,
  type LoadShopifySuggestedRefundInput,
} from "./load-suggested-refund.js";
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

export interface ExecuteShopifyRefundActionDeps {
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
  if (refundTransactions.length === 0) {
    return ShopifyRefundActionExecutionStatus.Succeeded;
  }

  if (
    refundTransactions.some((transaction) =>
      ["FAILURE", "ERROR"].includes(transaction.status),
    )
  ) {
    return ShopifyRefundActionExecutionStatus.Failed;
  }

  if (
    refundTransactions.some((transaction) => transaction.status === "PENDING")
  ) {
    return ShopifyRefundActionExecutionStatus.Pending;
  }

  return ShopifyRefundActionExecutionStatus.Succeeded;
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
  deps: ExecuteShopifyRefundActionDeps,
): Promise<ShopifyRefundActionResult> {
  const suggestedRefundInput: LoadShopifySuggestedRefundInput = {
    orderId: input.validation.orderId,
    refundLineItems: input.validation.matchedLineItems.map((lineItem) => ({
      lineItemId: lineItem.lineItemId,
      quantity: lineItem.requestedQuantity,
    })),
  };
  const suggestedRefundDeps: LoadShopifySuggestedRefundDeps = {
    env: deps.env,
    fetchImpl: deps.fetchImpl,
  };
  const suggestedRefund = await loadShopifySuggestedRefund(
    suggestedRefundInput,
    suggestedRefundDeps,
  );
  const refundTransactionInput: BuildRefundTransactionInputsFromSuggestedRefundInput =
    {
      orderId: input.validation.orderId,
      suggestedRefund,
    };
  const refundTransactionInputs =
    buildRefundTransactionInputsFromSuggestedRefund(refundTransactionInput);
  const request = buildShopifyRefundCreateGraphqlRequest(input.validation, {
    idempotencyKey: input.idempotencyKey,
    refundTransactionInputs,
    note: input.note,
  });
  const shopifyAdminOptions: ShopifyAdminFetchOptions = {
    env: deps.env,
    fetchImpl: deps.fetchImpl,
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
  deps: ExecuteShopifyRefundActionDeps = {},
): Promise<ShopifyRefundActionResult> {
  if (shouldUseRealShopify(deps.env)) {
    if (!hasShopifyAdminConfig(deps.env)) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
      );
    }

    if (!isRealRefundExecutionEnabled(deps.env)) {
      throw new Error(
        "Real Shopify refund execution requires ENABLE_REAL_REFUND_EXECUTION=true.",
      );
    }

    return executeRealShopifyRefundAction(input, deps);
  }

  return executeMockShopifyRefundAction(input);
}
