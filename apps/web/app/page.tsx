import {
  checkRefundEligibility,
  createShopifyRefundContextAdapter,
  loadOrders,
} from "@shopify-agent/core";
import { Dashboard } from "./dashboard";
import {
  applyRefundEvaluationToOrder,
  loadMerchantRefundPolicyConfig,
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
  const refundContextAdapter = createShopifyRefundContextAdapter();
  const merchantPolicyConfig = await loadMerchantRefundPolicyConfig();
  let orders: DashboardOrder[] = [];
  let ordersLoadError: string | null = null;
  // Keep row-level refund-check failures separate from top-level order-feed
  // failures so the dashboard can still render partial success.
  const orderEvaluationErrors = new Map<string, string>();

  if (!allowMockOrdersFallback && process.env.USE_REAL_SHOPIFY !== "true") {
    ordersLoadError =
      "Live Shopify loading is disabled. Set USE_REAL_SHOPIFY=true or explicitly enable WEB_ENABLE_MOCK_ORDERS_FALLBACK=true.";
  } else {
    try {
      const orderSummaries = await loadOrders({ limit: 9 });
      // Each loaded row gets its own refund evaluation so the queue can show
      // real posture immediately instead of only enriching the selected order.
      const evaluationOutcomes = await Promise.allSettled(
        orderSummaries.map((order) => {
          const refundEligibilityInput = { orderId: order.id };
          const refundEligibilityDependencies = {
            config: merchantPolicyConfig,
            adapter: refundContextAdapter,
          };

          return checkRefundEligibility(
            refundEligibilityInput,
            refundEligibilityDependencies,
          );
        }),
      );

      orders = orderSummaries.map((orderSummary, index) => {
        // First convert Shopify order-summary data into the dashboard view
        // model, then layer the live refund result on top when available.
        const baseOrder = mapOrderSummaryToDashboardOrder(orderSummary, now);
        const evaluationOutcome = evaluationOutcomes[index];

        if (evaluationOutcome?.status === "fulfilled") {
          return applyRefundEvaluationToOrder(
            baseOrder,
            evaluationOutcome.value,
          );
        }

        if (evaluationOutcome?.status === "rejected") {
          orderEvaluationErrors.set(
            orderSummary.id,
            evaluationOutcome.reason instanceof Error
              ? evaluationOutcome.reason.message
              : "Refund eligibility check failed.",
          );
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

  const initialState = parseDashboardUrlState(resolvedSearchParams, orders);
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
  const selectedOrderError: DashboardOrderErrorState | null =
    activeSelectedOrder && orderEvaluationErrors.has(activeSelectedOrder.base.id)
      ? {
          orderId: activeSelectedOrder.base.id,
          message: orderEvaluationErrors.get(activeSelectedOrder.base.id)!,
        }
      : null;

  return (
    <Dashboard
      orders={orders}
      initialState={initialState}
      ordersLoadError={ordersLoadError}
      selectedOrderError={selectedOrderError}
    />
  );
}
