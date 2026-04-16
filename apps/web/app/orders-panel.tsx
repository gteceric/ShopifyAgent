import type { DashboardOrder, RefundDecision } from "./mock-orders";
import { type AgeFilter } from "./dashboard-helpers";
import { OrdersFilters } from "./orders-filters";
import { OrdersTableBody } from "./orders-table-body";
import { OrdersTableHeader } from "./orders-table-header";

interface OrdersPanelProps {
  orders: DashboardOrder[];
  search: string;
  decisionFilter: "all" | RefundDecision;
  ageFilter: AgeFilter;
  selectedOrderId: string;
  onSearchChange(nextValue: string): void;
  onDecisionFilterChange(nextValue: "all" | RefundDecision): void;
  onAgeFilterChange(nextValue: AgeFilter): void;
  onSelectOrder(orderId: string): void;
}

export function OrdersPanel({
  orders,
  search,
  decisionFilter,
  ageFilter,
  selectedOrderId,
  onSearchChange,
  onDecisionFilterChange,
  onAgeFilterChange,
  onSelectOrder,
}: OrdersPanelProps) {
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

      {orders.length === 0 ? (
        <div className="px-5 py-8 text-sm leading-6 text-stone-600">
          No orders match the current search and filters. Try widening the
          decision or age filters.
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
