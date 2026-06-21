import {
  checkRefundEligibility,
  createShopifyRefundContextAdapter,
} from "@shopify-agent/core";
import { getPrismaClient } from "../../../src/persistence/prisma-client";
import { readCredentialEncryptionKey } from "../../../src/security/credential-encryption";
import { Dashboard } from "./dashboard";
import { loadDashboardOrderSummaries } from "./dashboard-order-summaries";
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
import {
  readShopifyApiVersion,
  readShopifyAppClientId,
  readShopifyAppClientSecret,
} from "./shopify-app-env";
import { DASHBOARD_ORDERS, type DashboardOrder } from "./mock-orders";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

function shouldAllowMockOrdersFallback(): boolean {
  return process.env.WEB_ENABLE_MOCK_ORDERS_FALLBACK === "true";
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

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const now = new Date();
  const allowMockOrdersFallback = shouldAllowMockOrdersFallback();
  const useRealShopify = process.env.USE_REAL_SHOPIFY === "true";
  const merchantPolicyConfig = await loadMerchantRefundPolicyConfig();
  let orders: DashboardOrder[] = [];
  let ordersLoadError: string | null = null;
  // Keep row-level refund-check failures separate from top-level order-feed
  // failures so the dashboard can still render partial success.
  const orderEvaluationErrors = new Map<string, string>();

  if (!allowMockOrdersFallback && !useRealShopify) {
    ordersLoadError =
      "Live Shopify loading is disabled. Set USE_REAL_SHOPIFY=true or explicitly enable WEB_ENABLE_MOCK_ORDERS_FALLBACK=true.";
  } else {
    try {
      const dashboardOrderSummariesInput = {
        limit: 9,
        shopDomain: readSearchParamValue(resolvedSearchParams, "shop"),
        useRealShopify,
      };
      const realShopifyOrderSummariesDependencies = useRealShopify
        ? {
            prisma: getPrismaClient(),
            credentialEncryptionKey: readCredentialEncryptionKey(
              SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
            ),
            appClientId: readShopifyAppClientId(),
            appClientSecret: readShopifyAppClientSecret(),
            apiVersion: readShopifyApiVersion(),
            fetchImpl: fetch,
            nowFn: () => new Date(),
          }
        : undefined;
      const dashboardOrderSummariesDependencies = {
        realShopify: realShopifyOrderSummariesDependencies,
      };
      const orderSummaries = await loadDashboardOrderSummaries(
        dashboardOrderSummariesInput,
        dashboardOrderSummariesDependencies,
      );
      const refundContextAdapter = createShopifyRefundContextAdapter();
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
