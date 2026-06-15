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
import { ShopifyAppBridgeConnect } from "./shopify-app-bridge-connect";

interface DashboardProps {
  orders: DashboardOrder[];
  initialState: DashboardUrlState;
  ordersLoadError?: string | null;
  selectedOrderError: DashboardOrderErrorState | null;
}

export function Dashboard({
  orders,
  initialState,
  ordersLoadError,
  selectedOrderError,
}: DashboardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const defaultOrderId = orders[0]?.base.id ?? "";
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
  const activeSelectedOrderId = selectedOrder?.base.id ?? "";
  const displaySelectedOrderId =
    isPending && pendingSelectedOrderId
      ? pendingSelectedOrderId
      : activeSelectedOrderId;
  const displayedOrder =
    filteredOrders.find((order) => order.base.id === displaySelectedOrderId) ??
    selectedOrder;
  const displayedOrderError =
    selectedOrderError?.orderId === activeSelectedOrderId
      ? selectedOrderError.message
      : null;
  const hasActiveFilters =
    dashboardState.search.trim().length > 0 ||
    dashboardState.decisionFilter !== "all" ||
    dashboardState.ageFilter !== "all";
  const summary = getSummary(filteredOrders);
  const emptyDetailsMessage =
    ordersLoadError && orders.length === 0
      ? "Live Shopify orders could not be loaded. Fix the connection details or retry the order feed."
      : filteredOrders.length === 0 && orders.length > 0
        ? "No order matches the current search and filters. Adjust the queue to inspect refund guidance."
        : "Select an order to inspect refund posture, policy reasoning, and next-step guidance.";

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
        <ShopifyAppBridgeConnect />

        <DashboardHero
          totalOrders={orders.length}
          visibleOrders={filteredOrders.length}
          eligibleCount={summary.eligibleCount}
          manualReviewCount={summary.manualReviewCount}
          blockedCount={summary.blockedCount}
          hasActiveFilters={hasActiveFilters}
          isUsingLiveOrders={!ordersLoadError}
        />

        {ordersLoadError ? (
          <div className="rounded-[24px] border border-red-900/10 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900">
            Could not load the live Shopify order list: {ordersLoadError}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)] xl:items-start">
          <OrdersPanel
            orders={filteredOrders}
            totalOrders={orders.length}
            search={dashboardState.search}
            decisionFilter={dashboardState.decisionFilter}
            ageFilter={dashboardState.ageFilter}
            selectedOrderId={displaySelectedOrderId}
            ordersLoadError={ordersLoadError}
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
            emptyMessage={emptyDetailsMessage}
            isPending={isPending}
          />
        </section>
      </div>
    </main>
  );
}
