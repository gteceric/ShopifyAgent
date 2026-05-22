"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardItemEvaluationViewModel } from "./mock-orders";
import { RefundPreviewLineItemRow } from "./refund-preview-line-item-row";
import { previewRefundAction } from "./refund-preview-action";
import type { RefundPreviewResult } from "./refund-preview";

interface RefundPreviewPanelProps {
  orderId: string;
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

export function RefundPreviewPanel({
  orderId,
  itemEvaluations,
}: RefundPreviewPanelProps) {
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
  const [isPending, startTransition] = useTransition();
  const selectedItems = eligibleItems.filter((item) =>
    selectedLineItemIds.has(item.lineItemId),
  );
  const canPreview = selectedItems.length > 0 && !isPending;
  const previewAmountLabel = previewResult
    ? getPreviewAmountLabel(previewResult)
    : null;
  const blockerMessages = previewResult
    ? getBlockerMessages(previewResult)
    : [];

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
  }, [eligibleItems, orderId]);

  function toggleLineItem(lineItemId: string): void {
    setPreviewResult(null);
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

    setPreviewResult(null);
    setQuantities((currentValue) => ({
      ...currentValue,
      [lineItemId]: nextQuantity,
    }));
  }

  function previewSelectedRefund(): void {
    startTransition(async () => {
      const result = await previewRefundAction({
        orderId,
        lineItems: selectedItems.map((item) => ({
          lineItemId: item.lineItemId,
          quantity: quantities[item.lineItemId] ?? 1,
        })),
      });

      setPreviewResult(result);
    });
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
                        preview qty: {previewLineItem?.quantity ?? "not returned"}
                      </span>
                    </div>
                  );
                })}
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
    </section>
  );
}
