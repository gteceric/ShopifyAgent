import { loadShopifyOrderTransactions } from "@shopify-agent/core";
import type {
  LoadShopifyOrderTransactionsDeps,
  LoadShopifyOrderTransactionsInput,
} from "@shopify-agent/core";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the transaction smoke test.`);
  }

  return value;
}

function requireRealShopifyReadFlags(): void {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error("Transaction smoke test requires USE_REAL_SHOPIFY=true.");
  }
}

async function main(): Promise<void> {
  requireRealShopifyReadFlags();

  const orderId = readRequiredEnv("SMOKE_REFUND_ORDER_ID");
  const input: LoadShopifyOrderTransactionsInput = { orderId };
  const deps: LoadShopifyOrderTransactionsDeps = {
    env: process.env,
  };
  const transactions = await loadShopifyOrderTransactions(input, deps);

  console.log("Shopify order transaction smoke test result");
  console.log(
    JSON.stringify(
      {
        orderId,
        transactions,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("Failed to run Shopify order transaction smoke test.");
  console.error(error);
  process.exitCode = 1;
});
