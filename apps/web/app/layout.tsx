import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shopify Agent Web",
  description: "Merchant-facing dashboard scaffold for Shopify Agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = process.env.SHOPIFY_APP_CLIENT_ID?.trim();

  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {shopifyApiKey ? (
          <>
            <meta name="shopify-api-key" content={shopifyApiKey} />
            <Script
              src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
              strategy="beforeInteractive"
            />
          </>
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
