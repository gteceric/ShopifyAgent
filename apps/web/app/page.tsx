import { checkRefundEligibility } from "@shopify-agent/core";
import { Dashboard } from "./dashboard";
import {
  applyRefundEvaluationToOrder,
  DASHBOARD_DEMO_POLICY,
  type DashboardOrderErrorState,
} from "./dashboard-order-evaluation";
import {
  filterOrders,
  parseDashboardUrlState,
  selectActiveOrder,
} from "./dashboard-helpers";
import { DASHBOARD_ORDERS } from "./mock-orders";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialState = parseDashboardUrlState(
    resolvedSearchParams,
    DASHBOARD_ORDERS,
  );
  const filteredOrders = filterOrders(
    DASHBOARD_ORDERS,
    initialState.search,
    initialState.decisionFilter,
    initialState.ageFilter,
  );
  const activeSelectedOrder = selectActiveOrder(
    filteredOrders,
    initialState.selectedOrderId,
  );
  let orders = DASHBOARD_ORDERS;
  let selectedOrderError: DashboardOrderErrorState | null = null;

  if (activeSelectedOrder) {
    try {
      const result = await checkRefundEligibility(
        { orderId: activeSelectedOrder.id },
        { config: DASHBOARD_DEMO_POLICY },
      );

      orders = DASHBOARD_ORDERS.map((order) =>
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
      selectedOrderError={selectedOrderError}
    />
  );
}
