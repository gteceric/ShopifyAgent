"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

const ShopifyConnectionBannerTone = {
  Warning: "warning",
  Error: "error",
} as const;

type ShopifyConnectionBannerTone =
  (typeof ShopifyConnectionBannerTone)[keyof typeof ShopifyConnectionBannerTone];

const SHOPIFY_CONNECTION_BANNER_STYLES = {
  [ShopifyConnectionBannerTone.Warning]: {
    container:
      "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/10 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950",
    button:
      "rounded-md border border-amber-900/20 bg-white px-3 py-1.5 font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60",
  },
  [ShopifyConnectionBannerTone.Error]: {
    container:
      "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/10 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900",
    button:
      "rounded-md border border-red-900/20 bg-white px-3 py-1.5 font-semibold text-red-900 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60",
  },
} as const;

interface ShopifyConnectionBannerProps {
  children: ReactNode;
  actionLabel?: string;
  busyActionLabel?: string;
  isConnecting?: boolean;
  onAction?: () => void;
  tone: ShopifyConnectionBannerTone;
}

function ShopifyConnectionBanner({
  children,
  actionLabel,
  busyActionLabel,
  isConnecting,
  onAction,
  tone,
}: ShopifyConnectionBannerProps) {
  const styles = SHOPIFY_CONNECTION_BANNER_STYLES[tone];
  const hasAction = Boolean(actionLabel && busyActionLabel && onAction);

  return (
    <div
      role="alert"
      className={styles.container}
    >
      <span>{children}</span>
      {hasAction ? (
        <button
          type="button"
          className={styles.button}
          disabled={isConnecting}
          onClick={onAction}
        >
          {isConnecting ? busyActionLabel : actionLabel}
        </button>
      ) : null}
    </div>
  );
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
  const isShopifyConnectionInactive =
    shopifyConnectionStatus === ShopifyConnectionStatus.Inactive;

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

  const reconnectInstallation = useCallback(() => {
    setConnectionErrorMessage(null);
    void connectInstallation().catch((error: unknown) => {
      setConnectionErrorMessage(readConnectionErrorMessage(error));
    });
  }, [connectInstallation]);

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

  if (
    !connectionErrorMessage &&
    !requiresShopifyReauthorization &&
    !isShopifyConnectionInactive
  ) {
    return null;
  }

  if (requiresShopifyReauthorization) {
    return (
      <ShopifyConnectionBanner
        actionLabel="Reconnect"
        busyActionLabel="Reconnecting"
        isConnecting={isConnecting}
        onAction={reconnectInstallation}
        tone={ShopifyConnectionBannerTone.Warning}
      >
        Shopify needs to be reconnected before live orders can load.{" "}
        {connectionErrorMessage ??
          "Reconnect Shopify to refresh this shop's credentials."}
      </ShopifyConnectionBanner>
    );
  }

  if (isShopifyConnectionInactive) {
    return (
      <ShopifyConnectionBanner
        tone={ShopifyConnectionBannerTone.Warning}
      >
        Shopify is not connected for this store. Reinstall or open the app from
        Shopify Admin to reconnect.
        {connectionErrorMessage
          ? ` Connection attempt failed: ${connectionErrorMessage}`
          : null}
      </ShopifyConnectionBanner>
    );
  }

  return (
    <ShopifyConnectionBanner
      actionLabel="Retry"
      busyActionLabel="Retrying"
      isConnecting={isConnecting}
      onAction={reconnectInstallation}
      tone={ShopifyConnectionBannerTone.Error}
    >
      Shopify connection could not be refreshed: {connectionErrorMessage}
    </ShopifyConnectionBanner>
  );
}
