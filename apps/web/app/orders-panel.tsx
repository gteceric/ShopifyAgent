import type { DashboardOrder, RefundDecision } from "./mock-orders";
import { type AgeFilter } from "./dashboard-helpers";
import { OrdersFilters } from "./orders-filters";
import { OrdersTableBody } from "./orders-table-body";
import { OrdersTableHeader } from "./orders-table-header";

interface OrdersPanelProps {
  orders: DashboardOrder[];
  totalOrders: number;
  search: string;
  decisionFilter: "all" | RefundDecision;
  ageFilter: AgeFilter;
  selectedOrderId: string;
  ordersLoadError?: string | null;
  onSearchChange(nextValue: string): void;
  onDecisionFilterChange(nextValue: "all" | RefundDecision): void;
  onAgeFilterChange(nextValue: AgeFilter): void;
  onSelectOrder(orderId: string): void;
}

export function OrdersPanel({
  orders,
  totalOrders,
  search,
  decisionFilter,
  ageFilter,
  selectedOrderId,
  ordersLoadError,
  onSearchChange,
  onDecisionFilterChange,
  onAgeFilterChange,
  onSelectOrder,
}: OrdersPanelProps) {
  const hasActiveFilters =
    search.trim().length > 0 ||
    decisionFilter !== "all" ||
    ageFilter !== "all";

  return (
    <div className="overflow-hidden rounded-[28px] border border-stone-900/10 bg-stone-50/85 shadow-[0_18px_48px_rgba(66,45,23,0.12)] backdrop-blur-xl">
      <OrdersFilters
        search={search}
        decisionFilter={decisionFilter}
        ageFilter={ageFilter}
        onSearchChange={onSearchChange}
        onDecisionFilterChange={onDecisionFilterChange}
        onAgeFilterChange={onAgeFilterChange}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-900/10 px-4 py-3 text-sm text-stone-600">
        <p>
          {orders.length} {orders.length === 1 ? "order" : "orders"} in view
          {totalOrders !== orders.length ? ` of ${totalOrders}` : ""}.
        </p>
        <p className="text-stone-500">
          {ordersLoadError
            ? "Live order feed needs attention."
            : hasActiveFilters
              ? "Filters are narrowing the live queue."
              : "Showing the latest workspace queue."}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="px-5 py-8 text-sm leading-6 text-stone-600">
          {ordersLoadError && totalOrders === 0
            ? "No live Shopify orders are available because the order feed could not be loaded."
            : totalOrders === 0
              ? "No orders are available for this workspace yet."
              : "No orders match the current search and filters. Try widening the search, decision, or age filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <OrdersTableHeader />
            <OrdersTableBody
              orders={orders}
              selectedOrderId={selectedOrderId}
              onSelectOrder={onSelectOrder}
            />
          </table>
        </div>
      )}
    </div>
  );
}
