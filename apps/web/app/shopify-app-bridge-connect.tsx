"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectShopifyInstallationFromBrowser,
  type ShopifySessionTokenProvider,
} from "./shopify-connect-client";

declare global {
  interface Window {
    shopify?: ShopifySessionTokenProvider;
  }
}

function readConnectionErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Shopify connection could not be established.";
}

function readShopifySessionTokenProvider(): ShopifySessionTokenProvider {
  if (!window.shopify || typeof window.shopify.idToken !== "function") {
    throw new Error("Shopify App Bridge is not ready.");
  }

  return window.shopify;
}

export function ShopifyAppBridgeConnect() {
  const router = useRouter();
  const hasRefreshedAfterConnectionRef = useRef(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState<
    string | null
  >(null);

  const connectInstallation = useCallback(async () => {
    await connectShopifyInstallationFromBrowser({
      fetchImpl: fetch,
      shopifySessionTokenProvider: readShopifySessionTokenProvider(),
    });

    if (!hasRefreshedAfterConnectionRef.current) {
      hasRefreshedAfterConnectionRef.current = true;
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    async function run() {
      try {
        await connectInstallation();
      } catch (error) {
        setConnectionErrorMessage(readConnectionErrorMessage(error));
      }
    }

    void run();
  }, [connectInstallation]);

  if (!connectionErrorMessage) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/10 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900"
    >
      <span>
        Shopify connection could not be refreshed: {connectionErrorMessage}
      </span>
      <button
        type="button"
        className="rounded-md border border-red-900/20 bg-white px-3 py-1.5 font-semibold text-red-900 transition hover:bg-red-100"
        onClick={() => {
          setConnectionErrorMessage(null);
          void connectInstallation().catch((error: unknown) => {
            setConnectionErrorMessage(readConnectionErrorMessage(error));
          });
        }}
      >
        Retry
      </button>
    </div>
  );
}
