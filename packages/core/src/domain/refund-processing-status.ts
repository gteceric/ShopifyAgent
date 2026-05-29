export const RefundProcessingStatus = {
  Succeeded: "succeeded",
  Pending: "pending",
  Failed: "failed",
  Unknown: "unknown",
} as const;

export type RefundProcessingStatus =
  (typeof RefundProcessingStatus)[keyof typeof RefundProcessingStatus];

export interface RefundProcessingStatusTransaction {
  status?: string | null;
}

export interface RefundProcessingKindTransaction
  extends RefundProcessingStatusTransaction {
  kind?: string | null;
}

function normalizeRefundTransactionStatus(status?: string | null): string {
  return status?.trim().toUpperCase() ?? "";
}

export function isPendingRefundTransactionStatus(
  status?: string | null,
): boolean {
  const normalizedStatus = normalizeRefundTransactionStatus(status);

  return ["PENDING", "AWAITING_RESPONSE", "PROCESSING"].includes(
    normalizedStatus,
  );
}

export function isFailedRefundTransactionStatus(
  status?: string | null,
): boolean {
  const normalizedStatus = normalizeRefundTransactionStatus(status);

  return ["FAILURE", "ERROR"].includes(normalizedStatus);
}

export function hasPendingRefundTransaction(
  transactions: RefundProcessingStatusTransaction[],
): boolean {
  return transactions.some((transaction) =>
    isPendingRefundTransactionStatus(transaction.status),
  );
}

export function hasPendingOrderRefundTransaction(
  transactions?: RefundProcessingKindTransaction[] | null,
): boolean {
  const refundTransactions =
    transactions?.filter((transaction) => transaction.kind === "REFUND") ?? [];

  return hasPendingRefundTransaction(refundTransactions);
}

export function deriveRefundProcessingStatusFromTransactions(
  transactions: RefundProcessingStatusTransaction[],
): RefundProcessingStatus {
  if (transactions.length === 0) {
    return RefundProcessingStatus.Unknown;
  }

  if (hasPendingRefundTransaction(transactions)) {
    return RefundProcessingStatus.Pending;
  }

  if (
    transactions.some((transaction) =>
      isFailedRefundTransactionStatus(transaction.status),
    )
  ) {
    return RefundProcessingStatus.Failed;
  }

  return RefundProcessingStatus.Succeeded;
}
