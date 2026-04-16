import type { RefundDecision } from "./mock-orders";
import {
  AGE_OPTIONS,
  DECISION_OPTIONS,
  type AgeFilter,
} from "./dashboard-helpers";

interface OrdersFiltersProps {
  search: string;
  decisionFilter: "all" | RefundDecision;
  ageFilter: AgeFilter;
  onSearchChange(nextValue: string): void;
  onDecisionFilterChange(nextValue: "all" | RefundDecision): void;
  onAgeFilterChange(nextValue: AgeFilter): void;
}

export function OrdersFilters({
  search,
  decisionFilter,
  ageFilter,
  onSearchChange,
  onDecisionFilterChange,
  onAgeFilterChange,
}: OrdersFiltersProps) {
  return (
    <div className="grid gap-3 border-b border-stone-900/10 p-4 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
      <label className="grid gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Search Orders
        </span>
        <input
          className="w-full rounded-full border border-stone-900/15 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-stone-900/30 focus:ring-2 focus:ring-orange-700/15"
          type="search"
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
          placeholder="Order name, customer, or Shopify GID"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Decision
        </span>
        <select
          className="w-full rounded-full border border-stone-900/15 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-stone-900/30 focus:ring-2 focus:ring-orange-700/15"
          value={decisionFilter}
          onChange={(event) => {
            onDecisionFilterChange(event.target.value as "all" | RefundDecision);
          }}
        >
          {DECISION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Order Age
        </span>
        <select
          className="w-full rounded-full border border-stone-900/15 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-stone-900/30 focus:ring-2 focus:ring-orange-700/15"
          value={ageFilter}
          onChange={(event) => {
            onAgeFilterChange(event.target.value as AgeFilter);
          }}
        >
          {AGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
