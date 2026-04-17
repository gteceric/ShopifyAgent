"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useDeferredValue } from "react";
import type { DashboardOrder } from "./mock-orders";
import {
  buildDashboardSearchParams,
  filterOrders,
  getSummary,
  parseDashboardUrlState,
  type DashboardUrlState,
} from "./dashboard-helpers";
import { DashboardHero } from "./dashboard-hero";
import { OrderDetailsPanel } from "./order-details-panel";
import { OrdersPanel } from "./orders-panel";

interface DashboardProps {
  orders: DashboardOrder[];
  initialState: DashboardUrlState;
}

export function Dashboard({ orders, initialState }: DashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultOrderId = orders[0]?.id ?? "";
  const queryEntries = Object.fromEntries(urlSearchParams.entries());
  const dashboardState =
    Object.keys(queryEntries).length > 0
      ? parseDashboardUrlState(queryEntries, orders)
      : initialState;
  const deferredSearch = useDeferredValue(dashboardState.search);
  const filteredOrders = filterOrders(
    orders,
    deferredSearch,
    dashboardState.decisionFilter,
    dashboardState.ageFilter,
  );

  const selectedOrder =
    filteredOrders.find((order) => order.id === dashboardState.selectedOrderId) ??
    filteredOrders[0] ??
    null;
  const activeSelectedOrderId = selectedOrder?.id ?? "";

  const summary = getSummary(orders);

  function updateDashboardState(nextState: DashboardUrlState) {
    const nextSearchParams = buildDashboardSearchParams(
      new URLSearchParams(urlSearchParams.toString()),
      nextState,
      defaultOrderId,
    );

    if (nextSearchParams === urlSearchParams.toString()) {
      return;
    }

    const nextUrl =
      nextSearchParams.length > 0
        ? `${pathname}?${nextSearchParams}`
        : pathname;

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

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
            search={dashboardState.search}
            decisionFilter={dashboardState.decisionFilter}
            ageFilter={dashboardState.ageFilter}
            selectedOrderId={activeSelectedOrderId}
            onSearchChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                search: nextValue,
              });
            }}
            onDecisionFilterChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                decisionFilter: nextValue,
              });
            }}
            onAgeFilterChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                ageFilter: nextValue,
              });
            }}
            onSelectOrder={(orderId) => {
              updateDashboardState({
                ...dashboardState,
                selectedOrderId: orderId,
              });
            }}
          />
          <OrderDetailsPanel order={selectedOrder} />
        </section>
      </div>
    </main>
  );
}
