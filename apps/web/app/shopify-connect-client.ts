interface ShopifyConnectResponse {
  connected: true;
  shopDomain: string;
  status: string;
}

export interface ShopifySessionTokenProvider {
  idToken(): Promise<string>;
}

interface ConnectShopifyInstallationFromBrowserInput {
  fetchImpl: typeof fetch;
  shopifySessionTokenProvider: ShopifySessionTokenProvider;
}

function readErrorMessage(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error.trim() || null;
  }

  return null;
}

// If this function returns true, then payload can safely be treated as a ShopifyConnectResponse.
function isShopifyConnectResponse(
  payload: unknown,
): payload is ShopifyConnectResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const response = payload as Record<string, unknown>;

  return (
    response.connected === true &&
    typeof response.shopDomain === "string" &&
    typeof response.status === "string"
  );
}

function parseShopifyConnectResponse(payload: unknown): ShopifyConnectResponse {
  if (!isShopifyConnectResponse(payload)) {
    throw new Error("Shopify connection returned an invalid response.");
  }

  return payload;
}

export async function connectShopifyInstallationFromBrowser(
  input: ConnectShopifyInstallationFromBrowserInput,
): Promise<ShopifyConnectResponse> {
  const sessionToken = await input.shopifySessionTokenProvider.idToken();
  const shopifyConnectRequest: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  };
  const response = await input.fetchImpl(
    "/api/shopify/connect",
    shopifyConnectRequest,
  );
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload) ??
        `Shopify connection failed with status ${response.status}.`,
    );
  }

  return parseShopifyConnectResponse(payload);
}
