import {
  checkRefundEligibility,
  loadOrders,
} from "@shopify-agent/core";
import { Dashboard } from "./dashboard";
import {
  applyRefundEvaluationToOrder,
  DASHBOARD_DEMO_POLICY,
  mapOrderSummaryToDashboardOrder,
  type DashboardOrderErrorState,
} from "./dashboard-order-evaluation";
import {
  filterOrders,
  parseDashboardUrlState,
  selectActiveOrder,
} from "./dashboard-helpers";
import { DASHBOARD_ORDERS, type DashboardOrder } from "./mock-orders";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function shouldAllowMockOrdersFallback(): boolean {
  return process.env.WEB_ENABLE_MOCK_ORDERS_FALLBACK === "true";
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const now = new Date();
  const allowMockOrdersFallback = shouldAllowMockOrdersFallback();
  let orders: DashboardOrder[] = [];
  let ordersLoadError: string | null = null;

  if (!allowMockOrdersFallback && process.env.USE_REAL_SHOPIFY !== "true") {
    ordersLoadError =
      "Live Shopify loading is disabled. Set USE_REAL_SHOPIFY=true or explicitly enable WEB_ENABLE_MOCK_ORDERS_FALLBACK=true.";
  } else {
    try {
      const orderSummaries = await loadOrders({ limit: 9 });
      const evaluationResults = await Promise.allSettled(
        orderSummaries.map((order) =>
          checkRefundEligibility(
            { orderId: order.id },
            { config: DASHBOARD_DEMO_POLICY },
          ),
        ),
      );

      orders = orderSummaries.map((orderSummary, index) => {
        const baseOrder = mapOrderSummaryToDashboardOrder(orderSummary, now);
        const evaluationResult = evaluationResults[index];

        if (evaluationResult?.status === "fulfilled") {
          return applyRefundEvaluationToOrder(baseOrder, evaluationResult.value);
        }

        return baseOrder;
      });
    } catch (error) {
      ordersLoadError =
        error instanceof Error
          ? error.message
          : "Shopify order loading failed.";

      if (allowMockOrdersFallback) {
        orders = DASHBOARD_ORDERS;
      }
    }
  }

  const initialState = parseDashboardUrlState(
    resolvedSearchParams,
    orders,
  );
  const filteredOrders = filterOrders(
    orders,
    initialState.search,
    initialState.decisionFilter,
    initialState.ageFilter,
  );
  const activeSelectedOrder = selectActiveOrder(
    filteredOrders,
    initialState.selectedOrderId,
  );
  let selectedOrderError: DashboardOrderErrorState | null = null;

  if (activeSelectedOrder) {
    try {
      const result = await checkRefundEligibility(
        { orderId: activeSelectedOrder.id },
        { config: DASHBOARD_DEMO_POLICY },
      );

      orders = orders.map((order) =>
        order.id === activeSelectedOrder.id
          ? applyRefundEvaluationToOrder(order, result)
          : order,
      );
    } catch (error) {
      selectedOrderError = {
        orderId: activeSelectedOrder.id,
        message:
          error instanceof Error
            ? error.message
            : "Refund eligibility check failed.",
      };
    }
  }

  return (
    <Dashboard
      orders={orders}
      initialState={initialState}
      ordersLoadError={ordersLoadError}
      selectedOrderError={selectedOrderError}
    />
  );
}
