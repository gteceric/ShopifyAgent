"use client";

import { useEffect, useState } from "react";
import { connectShopifyInstallationFromBrowser } from "./shopify-connect-client";

function readConnectionErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Shopify connection could not be established.";
}

export function ShopifyAppBridgeConnect() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // App Bridge intercepts global fetch and adds the current session token.
    void connectShopifyInstallationFromBrowser(fetch).catch((error: unknown) => {
      setErrorMessage(readConnectionErrorMessage(error));
    });
  }, []);

  if (!errorMessage) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/10 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900"
    >
      <span>
        Shopify connection could not be refreshed: {errorMessage}
      </span>
      <button
        type="button"
        className="rounded-md border border-red-900/20 bg-white px-3 py-1.5 font-semibold text-red-900 transition hover:bg-red-100"
        onClick={() => {
          setErrorMessage(null);
          void connectShopifyInstallationFromBrowser(fetch).catch(
            (error: unknown) => {
              setErrorMessage(readConnectionErrorMessage(error));
            },
          );
        }}
      >
        Retry
      </button>
    </div>
  );
}
