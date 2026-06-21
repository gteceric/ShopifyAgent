import type { Metadata } from "next";
import "./globals.css";
import { readOptionalShopifyAppClientId } from "./shopify-app-env";

const SHOPIFY_APP_BRIDGE_SCRIPT_URL =
  "https://cdn.shopify.com/shopifycloud/app-bridge.js";

export const metadata: Metadata = {
  title: "Shopify Agent Web",
  description: "Merchant-facing dashboard scaffold for Shopify Agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = readOptionalShopifyAppClientId();

  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {shopifyApiKey ? (
          <>
            <meta name="shopify-api-key" content={shopifyApiKey} />
            {/* eslint-disable-next-line @next/next/no-sync-scripts -- Shopify App Bridge rejects async script tags. */}
            <script src={SHOPIFY_APP_BRIDGE_SCRIPT_URL}></script>
          </>
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
