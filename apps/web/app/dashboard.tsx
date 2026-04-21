"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState, useTransition } from "react";
import type { DashboardOrderErrorState } from "./dashboard-order-evaluation";
import type { DashboardOrder } from "./mock-orders";
import {
  buildDashboardSearchParams,
  filterOrders,
  getSummary,
  normalizeDashboardSearchParams,
  parseDashboardUrlState,
  selectActiveOrder,
  type DashboardUrlState,
} from "./dashboard-helpers";
import { DashboardHero } from "./dashboard-hero";
import { OrderDetailsPanel } from "./order-details-panel";
import { OrdersPanel } from "./orders-panel";

interface DashboardProps {
  orders: DashboardOrder[];
  initialState: DashboardUrlState;
  selectedOrderError: DashboardOrderErrorState | null;
}

export function Dashboard({
  orders,
  initialState,
  selectedOrderError,
}: DashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultOrderId = orders[0]?.id ?? "";
  const [isPending, startTransition] = useTransition();
  const [pendingSelectedOrderId, setPendingSelectedOrderId] = useState<
    string | null
  >(null);
  const normalizedSearchParams = normalizeDashboardSearchParams(urlSearchParams);
  const dashboardState =
    urlSearchParams.size > 0
      ? parseDashboardUrlState(normalizedSearchParams, orders)
      : initialState;
  const deferredSearch = useDeferredValue(dashboardState.search);
  const filteredOrders = filterOrders(
    orders,
    deferredSearch,
    dashboardState.decisionFilter,
    dashboardState.ageFilter,
  );
  const selectedOrder = selectActiveOrder(
    filteredOrders,
    dashboardState.selectedOrderId,
  );
  const activeSelectedOrderId = selectedOrder?.id ?? "";
  const displaySelectedOrderId =
    isPending && pendingSelectedOrderId
      ? pendingSelectedOrderId
      : activeSelectedOrderId;
  const displayedOrder =
    filteredOrders.find((order) => order.id === displaySelectedOrderId) ??
    selectedOrder;
  const displayedOrderError =
    selectedOrderError?.orderId === activeSelectedOrderId
      ? selectedOrderError.message
      : null;

  const summary = getSummary(orders);

  function updateDashboardState(
    nextState: DashboardUrlState,
    nextPendingSelectedOrderId: string | null = null,
  ) {
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
      setPendingSelectedOrderId(nextPendingSelectedOrderId);
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
            selectedOrderId={displaySelectedOrderId}
            onSearchChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                search: nextValue,
              }, null);
            }}
            onDecisionFilterChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                decisionFilter: nextValue,
              }, null);
            }}
            onAgeFilterChange={(nextValue) => {
              updateDashboardState({
                ...dashboardState,
                ageFilter: nextValue,
              }, null);
            }}
            onSelectOrder={(orderId) => {
              updateDashboardState({
                ...dashboardState,
                selectedOrderId: orderId,
              }, orderId);
            }}
          />
          <OrderDetailsPanel
            order={displayedOrder}
            errorMessage={displayedOrderError}
            isPending={isPending}
          />
        </section>
      </div>
    </main>
  );
}
