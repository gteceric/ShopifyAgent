import type { DashboardItemEvaluationViewModel } from "./mock-orders";

interface RefundPreviewLineItemRowProps {
  item: DashboardItemEvaluationViewModel;
  isSelected: boolean;
  quantity: number;
  onToggle: (lineItemId: string) => void;
  onQuantityChange: (
    lineItemId: string,
    rawValue: string,
    maxQuantity: number,
  ) => void;
}

function getVariantDetailLabels(
  item: DashboardItemEvaluationViewModel,
): string[] {
  const optionLabels =
    item.variantOptions?.map((option) => `${option.name}: ${option.value}`) ??
    [];
  const variantTitle =
    item.variantTitle && item.variantTitle !== "Default Title"
      ? [item.variantTitle]
      : [];
  const sku = item.sku ? [`SKU ${item.sku}`] : [];

  return [...optionLabels, ...variantTitle, ...sku];
}

function getLineItemIdSuffix(lineItemId: string): string {
  return lineItemId.split("/").at(-1) ?? lineItemId;
}

export function RefundPreviewLineItemRow({
  item,
  isSelected,
  quantity,
  onToggle,
  onQuantityChange,
}: RefundPreviewLineItemRowProps) {
  const variantDetailLabels = getVariantDetailLabels(item);

  return (
    <div className="rounded-2xl border border-stone-900/10 bg-stone-50/90 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_116px] sm:items-center">
        <label className="grid min-w-0 cursor-pointer grid-cols-[auto_64px_minmax(0,1fr)] items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(item.lineItemId)}
            className="mt-1 h-4 w-4 accent-stone-950"
          />
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.imageAltText ?? item.title}
              className="h-16 w-16 rounded-lg border border-stone-900/10 bg-white object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-stone-900/10 bg-white text-xs font-semibold text-stone-400">
              No image
            </span>
          )}
          <span className="min-w-0 space-y-1">
            <strong className="block truncate text-sm text-stone-950">
              {item.title}
            </strong>
            <span
              title={item.lineItemId}
              className="block truncate font-mono text-[11px] text-stone-500"
            >
              Line item {getLineItemIdSuffix(item.lineItemId)}
            </span>
            {variantDetailLabels.length > 0 ? (
              <span className="block text-xs leading-5 text-stone-600">
                {variantDetailLabels.join(" / ")}
              </span>
            ) : null}
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
              <span>Returnable: {item.returnableQuantity}</span>
              {item.pendingRefundQuantity !== undefined ? (
                <span>Pending: {item.pendingRefundQuantity}</span>
              ) : null}
              {item.unitPriceLabel ? (
                <span>Unit price: {item.unitPriceLabel}</span>
              ) : null}
            </span>
          </span>
        </label>

        <label className="grid gap-1 text-[11px] uppercase tracking-[0.14em] text-stone-500">
          Qty
          <input
            type="number"
            min={1}
            max={item.returnableQuantity}
            value={quantity}
            disabled={!isSelected}
            onChange={(event) =>
              onQuantityChange(
                item.lineItemId,
                event.target.value,
                item.returnableQuantity,
              )
            }
            className="h-10 rounded-xl border border-stone-900/10 bg-white px-3 text-sm font-semibold text-stone-950 outline-none transition focus:border-stone-950 disabled:bg-stone-100 disabled:text-stone-400"
          />
        </label>
      </div>
    </div>
  );
}
