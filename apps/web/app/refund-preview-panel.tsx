"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DashboardItemEvaluationViewModel } from "./mock-orders";
import { confirmRefundAction } from "./refund-confirm-action";
import type { RefundConfirmResult } from "./refund-confirm";
import { RefundPreviewLineItemRow } from "./refund-preview-line-item-row";
import { previewRefundAction } from "./refund-preview-action";
import type {
  RefundPreviewRequest,
  RefundPreviewResult,
} from "./refund-preview";

interface RefundPreviewPanelProps {
  orderId: string;
  shopDomain: string | null;
  itemEvaluations: DashboardItemEvaluationViewModel[];
}

type QuantityByLineItemId = Record<string, number>;

function formatMoney(amount: string, currencyCode: string): string {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currencyCode}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(numericAmount);
}

function getPreviewAmountLabel(result: RefundPreviewResult): string | null {
  if (!result.ok) {
    return null;
  }

  const money = result.preview.amount.presentmentMoney;

  return formatMoney(money.amount, money.currencyCode);
}

function getBlockerMessages(result: RefundPreviewResult): string[] {
  if (result.ok) {
    return [];
  }

  if (result.error) {
    return [result.error];
  }

  return result.blockers?.map((blocker) => blocker.message) ?? [];
}

function getConfirmMessages(result: RefundConfirmResult): string[] {
  if (result.ok) {
    return [];
  }

  if (result.error) {
    return [result.error];
  }

  return result.blockers?.map((blocker) => blocker.message) ?? [];
}

function getRefundTotalLabel(result: RefundConfirmResult): string | null {
  if (!result.ok) {
    return null;
  }

  const transactionAmount = result.refund.refundTransactions?.find(
    (transaction) => Number(transaction.amount.amount) > 0,
  )?.amount;
  const displayAmount = transactionAmount ?? result.refund.totalRefunded;

  if (!displayAmount) {
    return null;
  }

  return formatMoney(
    displayAmount.amount,
    displayAmount.currencyCode,
  );
}

function getOrderIdSuffix(orderId: string): string {
  return orderId.split("/").at(-1) ?? orderId;
}

function createRefundConfirmIdempotencyKey(orderId: string): string {
  const randomValue =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `dashboard-refund-${getOrderIdSuffix(orderId)}-${randomValue}`;
}

export function RefundPreviewPanel({
  orderId,
  shopDomain,
  itemEvaluations,
}: RefundPreviewPanelProps) {
  const router = useRouter();
  const eligibleItems = useMemo(
    () =>
      itemEvaluations.filter(
        (item) =>
          item.decision === "eligible" && item.returnableQuantity > 0,
      ),
    [itemEvaluations],
  );
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(
    () => new Set(eligibleItems[0] ? [eligibleItems[0].lineItemId] : []),
  );
  const [quantities, setQuantities] = useState<QuantityByLineItemId>(() =>
    Object.fromEntries(
      eligibleItems.map((item) => [item.lineItemId, 1]),
    ),
  );
  const [previewResult, setPreviewResult] =
    useState<RefundPreviewResult | null>(null);
  const [confirmResult, setConfirmResult] =
    useState<RefundConfirmResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmIdempotencyKeyRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedItems = eligibleItems.filter((item) =>
    selectedLineItemIds.has(item.lineItemId),
  );
  const hasConfirmedRefund = confirmResult?.ok === true;
  const canPreview =
    selectedItems.length > 0 && !isPending && !isConfirming;
  const canConfirm =
    previewResult?.ok === true &&
    !hasConfirmedRefund &&
    !isPending &&
    !isConfirming;
  const previewAmountLabel = previewResult
    ? getPreviewAmountLabel(previewResult)
    : null;
  const blockerMessages = previewResult
    ? getBlockerMessages(previewResult)
    : [];
  const confirmMessages = confirmResult
    ? getConfirmMessages(confirmResult)
    : [];
  const refundTotalLabel = confirmResult
    ? getRefundTotalLabel(confirmResult)
    : null;

  useEffect(() => {
    setSelectedLineItemIds(
      new Set(eligibleItems[0] ? [eligibleItems[0].lineItemId] : []),
    );
    setQuantities(
      Object.fromEntries(
        eligibleItems.map((item) => [item.lineItemId, 1]),
      ),
    );
    setPreviewResult(null);
    setConfirmResult(null);
    confirmIdempotencyKeyRef.current = null;
  }, [eligibleItems, orderId]);

  function clearRefundResults(): void {
    setPreviewResult(null);
    setConfirmResult(null);
    confirmIdempotencyKeyRef.current = null;
  }

  function getSelectedLineItemRequests(): RefundPreviewRequest["lineItems"] {
    return selectedItems.map((item) => ({
      lineItemId: item.lineItemId,
      quantity: quantities[item.lineItemId] ?? 1,
    }));
  }

  function toggleLineItem(lineItemId: string): void {
    clearRefundResults();
    setSelectedLineItemIds((currentValue) => {
      const nextValue = new Set(currentValue);

      if (nextValue.has(lineItemId)) {
        nextValue.delete(lineItemId);
      } else {
        nextValue.add(lineItemId);
      }

      return nextValue;
    });
  }

  function updateQuantity(
    lineItemId: string,
    rawValue: string,
    maxQuantity: number,
  ): void {
    const parsedValue = Number(rawValue);
    const nextQuantity =
      Number.isInteger(parsedValue) && parsedValue > 0
        ? Math.min(parsedValue, maxQuantity)
        : 1;

    clearRefundResults();
    setQuantities((currentValue) => ({
      ...currentValue,
      [lineItemId]: nextQuantity,
    }));
  }

  function previewSelectedRefund(): void {
    startTransition(async () => {
      setConfirmResult(null);
      const result = await previewRefundAction({
        orderId,
        shopDomain,
        lineItems: getSelectedLineItemRequests(),
      });

      setPreviewResult(result);
      confirmIdempotencyKeyRef.current = result.ok
        ? createRefundConfirmIdempotencyKey(orderId)
        : null;
    });
  }

  async function confirmSelectedRefund(): Promise<void> {
    if (!canConfirm) {
      return;
    }

    setIsConfirming(true);
    setConfirmResult(null);

    try {
      const idempotencyKey =
        confirmIdempotencyKeyRef.current ??
        createRefundConfirmIdempotencyKey(orderId);
      confirmIdempotencyKeyRef.current = idempotencyKey;
      const result = await confirmRefundAction({
        orderId,
        shopDomain,
        lineItems: getSelectedLineItemRequests(),
        idempotencyKey,
        note: "Refund confirmed from dashboard preview.",
      });

      setConfirmResult(result);
    } finally {
      setIsConfirming(false);
    }
  }

  if (itemEvaluations.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Refund Preview
        </p>
        <button
          type="button"
          onClick={previewSelectedRefund}
          disabled={!canPreview}
          className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
        >
          {isPending ? "Previewing..." : "Preview refund"}
        </button>
      </div>

      {eligibleItems.length === 0 ? (
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50/90 p-4 text-sm leading-6 text-stone-600">
          No eligible line items are available for refund preview.
        </div>
      ) : (
        <div className="grid gap-3">
          {eligibleItems.map((item) => {
            const isSelected = selectedLineItemIds.has(item.lineItemId);

            return (
              <RefundPreviewLineItemRow
                key={item.lineItemId}
                item={item}
                isSelected={isSelected}
                quantity={quantities[item.lineItemId] ?? 1}
                onToggle={toggleLineItem}
                onQuantityChange={updateQuantity}
              />
            );
          })}
        </div>
      )}

      {previewResult ? (
        <div
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            previewResult.ok
              ? "border-emerald-900/10 bg-emerald-50 text-emerald-950"
              : "border-red-900/10 bg-red-50 text-red-900"
          }`}
        >
          {previewResult.ok ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>Preview total</strong>
                <span className="text-base font-bold">
                  {previewAmountLabel}
                </span>
              </div>
              <div className="grid gap-2">
                {previewResult.matchedLineItems.map((item) => {
                  const previewLineItem =
                    previewResult.preview.refundLineItems.find(
                      (lineItem) => lineItem.lineItemId === item.lineItemId,
                    );
                  const previewLineItemAmountLabel =
                    previewLineItem
                      ? formatMoney(
                          previewLineItem.price.presentmentMoney.amount,
                          previewLineItem.price.presentmentMoney.currencyCode,
                        )
                      : null;

                  return (
                    <div
                      key={item.lineItemId}
                      className="rounded-xl border border-emerald-900/10 bg-white/70 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm">
                            {item.title ?? "Selected line item"}
                          </strong>
                          <span className="font-mono text-[11px] text-emerald-900/70">
                            {item.lineItemId}
                          </span>
                        </div>
                        {previewLineItemAmountLabel ? (
                          <span className="font-bold">
                            {previewLineItemAmountLabel}
                          </span>
                        ) : null}
                      </div>
                      <span className="mt-1 block text-xs text-emerald-900/75">
                        Selected qty: {item.requestedQuantity} · Shopify
                        preview qty:{" "}
                        {previewLineItem?.quantity ?? "not returned"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={confirmSelectedRefund}
                  disabled={!canConfirm}
                  className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-700"
                >
                  {isConfirming ? "Confirming..." : "Confirm refund"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              <strong>Preview unavailable</strong>
              {blockerMessages.map((message) => (
                <span key={message}>{message}</span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {confirmResult ? (
        <div
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            confirmResult.ok
              ? "border-emerald-900/10 bg-emerald-50 text-emerald-950"
              : "border-red-900/10 bg-red-50 text-red-900"
          }`}
        >
          {confirmResult.ok ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>
                  Refund{" "}
                  {confirmResult.refund.status === "pending"
                    ? "pending"
                    : "confirmed"}
                </strong>
                {refundTotalLabel ? (
                  <span className="text-base font-bold">
                    {refundTotalLabel}
                  </span>
                ) : null}
              </div>
              {confirmResult.refund.refundId ? (
                <span className="font-mono text-[11px] text-emerald-900/70">
                  {confirmResult.refund.refundId}
                </span>
              ) : null}
              <span>
                {confirmResult.refund.lineItems.length}{" "}
                {confirmResult.refund.lineItems.length === 1
                  ? "item"
                  : "items"}{" "}
                submitted to Shopify.
              </span>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-800"
                >
                  Refresh order status
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              <strong>Refund not confirmed</strong>
              {confirmMessages.map((message) => (
                <span key={message}>{message}</span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
