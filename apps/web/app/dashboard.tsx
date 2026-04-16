"use client";

import { startTransition, useDeferredValue, useState } from "react";
import type { DashboardOrder, RefundDecision } from "./mock-orders";
import {
  filterOrders,
  getSummary,
  type AgeFilter,
} from "./dashboard-helpers";
import { DashboardHero } from "./dashboard-hero";
import { OrderDetailsPanel } from "./order-details-panel";
import { OrdersPanel } from "./orders-panel";

interface DashboardProps {
  orders: DashboardOrder[];
}

export function Dashboard({ orders }: DashboardProps) {
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<
    "all" | RefundDecision
  >("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? "");
  const deferredSearch = useDeferredValue(search);
  const filteredOrders = filterOrders(
    orders,
    deferredSearch,
    decisionFilter,
    ageFilter,
  );

  const selectedOrder =
    filteredOrders.find((order) => order.id === selectedOrderId) ??
    filteredOrders[0] ??
    null;
  const activeSelectedOrderId = selectedOrder?.id ?? "";

  const summary = getSummary(orders);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(180,138,56,0.23),transparent_28%),radial-gradient(circle_at_top_right,rgba(80,100,67,0.18),transparent_24%),linear-gradient(180deg,#fbf7ef_0%,#f1e5d5_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1380px] gap-6">
        <DashboardHero
          totalOrders={summary.total}
          eligibleCount={summary.eligibleCount}
          manualReviewCount={summary.manualReviewCount}
          blockedCount={summary.blockedCount}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)] xl:items-start">
          <OrdersPanel
            orders={filteredOrders}
            search={search}
            decisionFilter={decisionFilter}
            ageFilter={ageFilter}
            selectedOrderId={activeSelectedOrderId}
            onSearchChange={(nextValue) => {
              startTransition(() => {
                setSearch(nextValue);
              });
            }}
            onDecisionFilterChange={(nextValue) => {
              startTransition(() => {
                setDecisionFilter(nextValue);
              });
            }}
            onAgeFilterChange={(nextValue) => {
              startTransition(() => {
                setAgeFilter(nextValue);
              });
            }}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
            }}
          />
          <OrderDetailsPanel order={selectedOrder} />
        </section>
      </div>
    </main>
  );
}
