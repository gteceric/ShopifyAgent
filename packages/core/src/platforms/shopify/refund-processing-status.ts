import {
  RefundProcessingStatus,
  type RefundProcessingStatus as RefundProcessingStatusValue,
} from "../../domain/refund-processing-status.js";

export interface ShopifyRefundProcessingStatusTransaction {
  status?: string | null;
}

export interface ShopifyRefundProcessingKindTransaction
  extends ShopifyRefundProcessingStatusTransaction {
  kind?: string | null;
}

function normalizeShopifyRefundTransactionStatus(
  status?: string | null,
): string {
  return status?.trim().toUpperCase() ?? "";
}

export function isPendingShopifyRefundTransactionStatus(
  status?: string | null,
): boolean {
  const normalizedStatus = normalizeShopifyRefundTransactionStatus(status);

  return ["PENDING", "AWAITING_RESPONSE", "PROCESSING"].includes(
    normalizedStatus,
  );
}

export function isFailedShopifyRefundTransactionStatus(
  status?: string | null,
): boolean {
  const normalizedStatus = normalizeShopifyRefundTransactionStatus(status);

  return ["FAILURE", "ERROR"].includes(normalizedStatus);
}

export function hasPendingShopifyRefundTransaction(
  transactions: ShopifyRefundProcessingStatusTransaction[],
): boolean {
  return transactions.some((transaction) =>
    isPendingShopifyRefundTransactionStatus(transaction.status),
  );
}

export function hasPendingShopifyOrderRefundTransaction(
  transactions?: ShopifyRefundProcessingKindTransaction[] | null,
): boolean {
  const refundTransactions =
    transactions?.filter((transaction) => transaction.kind === "REFUND") ?? [];

  return hasPendingShopifyRefundTransaction(refundTransactions);
}

export function deriveShopifyRefundProcessingStatusFromTransactions(
  transactions: ShopifyRefundProcessingStatusTransaction[],
): RefundProcessingStatusValue {
  if (transactions.length === 0) {
    return RefundProcessingStatus.Unknown;
  }

  if (hasPendingShopifyRefundTransaction(transactions)) {
    return RefundProcessingStatus.Pending;
  }

  if (
    transactions.some((transaction) =>
      isFailedShopifyRefundTransactionStatus(transaction.status),
    )
  ) {
    return RefundProcessingStatus.Failed;
  }

  return RefundProcessingStatus.Succeeded;
}
