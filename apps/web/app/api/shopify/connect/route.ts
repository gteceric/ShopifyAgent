import { InvalidJwtError } from "@shopify/shopify-api";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient } from "../../../../../../src/persistence/prisma-client";
import { connectShopifyInstallation } from "../../../../../../src/platforms/shopify/auth/connect-installation";
import { readCredentialEncryptionKey } from "../../../../../../src/security/credential-encryption";
import { logger } from "../../../logger";
import {
  readShopifyApiVersion,
  readShopifyAppClientId,
  readShopifyAppClientSecret,
  readShopifyAppUrl,
} from "../../../shopify-app-env";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

interface ShopifyConnectSuccessResponse {
  connected: true;
  shopDomain: string;
  status: string;
}

interface ShopifyConnectErrorResponse {
  error: string;
}

function readBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, extraPart] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extraPart) {
    return null;
  }

  return token;
}

export async function POST(request: NextRequest) {
  const sessionToken = readBearerToken(request.headers.get("authorization"));

  if (!sessionToken) {
    const responseBody: ShopifyConnectErrorResponse = {
      error: "A Shopify session token is required.",
    };

    return NextResponse.json(responseBody, { status: 401 });
  }

  try {
    const result = await connectShopifyInstallation(
      {
        sessionToken,
      },
      {
        prisma: getPrismaClient(),
        credentialEncryptionKey: readCredentialEncryptionKey(
          SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
        ),
        appClientId: readShopifyAppClientId(),
        appClientSecret: readShopifyAppClientSecret(),
        appUrl: readShopifyAppUrl(),
        apiVersion: readShopifyApiVersion(),
        fetchImpl: fetch,
        nowFn: () => new Date(),
      },
    );
    const responseBody: ShopifyConnectSuccessResponse = {
      connected: true,
      shopDomain: result.shopDomain,
      status: result.installation.status,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    if (error instanceof InvalidJwtError) {
      const responseBody: ShopifyConnectErrorResponse = {
        error: "The Shopify session token is invalid or expired.",
      };

      return NextResponse.json(responseBody, { status: 401 });
    }

    logger.error("[shopify/connect] Failed to connect Shopify installation.");
    logger.error(error instanceof Error ? error.message : String(error));
    const responseBody: ShopifyConnectErrorResponse = {
      error: "Failed to connect Shopify installation.",
    };

    return NextResponse.json(responseBody, { status: 500 });
  }
}
