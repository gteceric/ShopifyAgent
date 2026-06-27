"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectShopifyInstallationFromBrowser,
  type ShopifySessionTokenProvider,
} from "./shopify-connect-client";
import { ShopifyConnectionStatus } from "./shopify-connection-status";

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

interface ShopifyAppBridgeConnectProps {
  shopifyConnectionStatus: ShopifyConnectionStatus;
}

export function ShopifyAppBridgeConnect({
  shopifyConnectionStatus,
}: ShopifyAppBridgeConnectProps) {
  const router = useRouter();
  const hasRefreshedAfterConnectionRef = useRef(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState<
    string | null
  >(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const requiresShopifyReauthorization =
    shopifyConnectionStatus ===
    ShopifyConnectionStatus.RequiresReauthorization;

  const connectInstallation = useCallback(async () => {
    setIsConnecting(true);

    try {
      await connectShopifyInstallationFromBrowser({
        fetchImpl: fetch,
        shopifySessionTokenProvider: readShopifySessionTokenProvider(),
      });
    } finally {
      setIsConnecting(false);
    }

    if (!hasRefreshedAfterConnectionRef.current) {
      hasRefreshedAfterConnectionRef.current = true;
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (requiresShopifyReauthorization) {
      return;
    }

    async function run() {
      try {
        await connectInstallation();
      } catch (error) {
        setConnectionErrorMessage(readConnectionErrorMessage(error));
      }
    }

    void run();
  }, [connectInstallation, requiresShopifyReauthorization]);

  if (!connectionErrorMessage && !requiresShopifyReauthorization) {
    return null;
  }

  if (requiresShopifyReauthorization) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/10 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"
      >
        <span>
          Shopify needs to be reconnected before live orders can load.{" "}
          {connectionErrorMessage ??
            "Reconnect Shopify to refresh this shop's credentials."}
        </span>
        <button
          type="button"
          className="rounded-md border border-amber-900/20 bg-white px-3 py-1.5 font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isConnecting}
          onClick={() => {
            setConnectionErrorMessage(null);
            void connectInstallation().catch((error: unknown) => {
              setConnectionErrorMessage(readConnectionErrorMessage(error));
            });
          }}
        >
          {isConnecting ? "Reconnecting" : "Reconnect"}
        </button>
      </div>
    );
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
