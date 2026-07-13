import {
  checkRefundEligibility,
  createShopifyRefundContextAdapter,
  type ShopifyAdminClient,
} from "@shopify-agent/core";
import { Dashboard } from "./dashboard";
import { loadDashboardOrderSummaries } from "./dashboard-order-summaries";
import {
  requireResolvedShopifyAdminClient,
  resolveCurrentShopifyAdminClient,
} from "./shopify-admin-client-resolver";
import {
  isShopifyInstallationInactiveError,
  isShopifyInstallationRequiresReauthorizationError,
} from "../../../src/platforms/shopify/persistence/installation";
import { ShopifyConnectionStatus } from "./shopify-connection-status";
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
import { type DashboardOrder } from "./mock-orders";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = searchParams[name];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readShopifyConnectionStatusFromError(
  error: unknown,
): ShopifyConnectionStatus | null {
  if (isShopifyInstallationRequiresReauthorizationError(error)) {
    return ShopifyConnectionStatus.RequiresReauthorization;
  }

  if (isShopifyInstallationInactiveError(error)) {
    return ShopifyConnectionStatus.Inactive;
  }

  return null;
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const now = new Date();
  const useRealShopify = process.env.USE_REAL_SHOPIFY === "true";
  const merchantPolicyConfig = await loadMerchantRefundPolicyConfig();
  let orders: DashboardOrder[] = [];
  let ordersLoadError: string | null = null;
  let shopifyConnectionStatus: ShopifyConnectionStatus =
    ShopifyConnectionStatus.Ready;
  // Keep row-level refund-check failures separate from top-level order-feed
  // failures so the dashboard can still render partial success.
  const orderEvaluationErrors = new Map<string, string>();

  try {
    const shopDomain = readSearchParamValue(resolvedSearchParams, "shop");
    const dashboardOrderSummariesInput = {
      limit: 9,
      shopDomain,
      useRealShopify,
    };
    let shopifyAdminClient: ShopifyAdminClient | undefined;

    if (useRealShopify) {
      shopifyAdminClient = await resolveCurrentShopifyAdminClient(shopDomain);
      shopifyAdminClient =
        requireResolvedShopifyAdminClient(shopifyAdminClient);
    }
    const realShopifyOrderSummariesDependencies = shopifyAdminClient
      ? {
          shopifyAdminClient,
        }
      : undefined;
    const dashboardOrderSummariesDependencies = {
      realShopify: realShopifyOrderSummariesDependencies,
    };
    const orderSummaries = await loadDashboardOrderSummaries(
      dashboardOrderSummariesInput,
      dashboardOrderSummariesDependencies,
    );
    const refundContextDependencies = shopifyAdminClient
      ? {
          env: process.env,
          shopifyAdminClient,
        }
      : {
          env: process.env,
        };
    const refundContextAdapter = createShopifyRefundContextAdapter(
      refundContextDependencies,
    );
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
        return applyRefundEvaluationToOrder(baseOrder, evaluationOutcome.value);
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
    const errorShopifyConnectionStatus =
      readShopifyConnectionStatusFromError(error);

    if (errorShopifyConnectionStatus) {
      shopifyConnectionStatus = errorShopifyConnectionStatus;
    } else {
      ordersLoadError =
        error instanceof Error
          ? error.message
          : "Shopify order loading failed.";
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
    activeSelectedOrder &&
    orderEvaluationErrors.has(activeSelectedOrder.base.id)
      ? {
          orderId: activeSelectedOrder.base.id,
          message: orderEvaluationErrors.get(activeSelectedOrder.base.id)!,
        }
      : null;

  return (
    <Dashboard
      orders={orders}
      shopDomain={readSearchParamValue(resolvedSearchParams, "shop")}
      initialState={initialState}
      ordersLoadError={ordersLoadError}
      shopifyConnectionStatus={shopifyConnectionStatus}
      selectedOrderError={selectedOrderError}
    />
  );
}
