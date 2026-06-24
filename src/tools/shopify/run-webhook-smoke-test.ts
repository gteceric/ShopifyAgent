import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  fetchWithTimeout,
  readOptionalStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import type { ShopifyWebhookAcceptedResponse } from "./webhook-server-response.js";
import {
  SHOPIFY_WEBHOOK_ID_HEADER,
  SHOPIFY_WEBHOOK_SHOP_DOMAIN_HEADER,
  SHOPIFY_WEBHOOK_TOPIC_HEADER,
  normalizeShopifyShopDomain,
} from "../../platforms/shopify/webhooks/ingest-webhook.js";
import { SHOPIFY_WEBHOOK_HMAC_HEADER } from "../../platforms/shopify/webhooks/verify-webhook.js";

const SHOPIFY_PLATFORM = "shopify";
const SHOPIFY_WEBHOOK_PATH = "/webhooks/shopify";
const SHOPIFY_WEBHOOK_SMOKE_TOPIC = "orders/updated";
const SHOPIFY_WEBHOOK_SMOKE_PLATFORM_ORDER_ID = "gid://shopify/Order/123";
const DEFAULT_SHOPIFY_WEBHOOK_SMOKE_SHOP_DOMAIN = "smoke-shop.myshopify.com";
const DEFAULT_SHOPIFY_WEBHOOK_SMOKE_CLIENT_SECRET =
  "local-shopify-webhook-smoke-secret";
const SERVER_START_TIMEOUT_MS = 10_000;
const SERVER_STOP_TIMEOUT_MS = 5_000;
const SMOKE_HTTP_REQUEST_TIMEOUT_MS = 5_000;

interface StartedShopifyWebhookServer {
  childProcess: ChildProcess;
  output: () => string;
  hasExited: () => boolean;
}

function readRequiredEnv(name: string): string {
  const value = readOptionalStringEnv(name);

  if (!value) {
    throw new Error(
      `${name} is required for the synthetic Shopify webhook smoke test.`,
    );
  }

  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function findAvailableTcpPort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate a TCP port for the smoke test.");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return address.port;
}

function startShopifyWebhookServer(input: {
  smokeDatabaseUrl: string;
  clientSecret: string;
  port: number;
}): StartedShopifyWebhookServer {
  const serverScriptPath = fileURLToPath(
    new URL("./run-webhook-server.js", import.meta.url),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: input.smokeDatabaseUrl,
    SHOPIFY_APP_CLIENT_SECRET: input.clientSecret,
    SHOPIFY_WEBHOOK_PORT: String(input.port),
  };

  // start another Node process using the same Node binary that is running this smoke test
  const childProcess = spawn(
    process.execPath,
    ["--enable-source-maps", serverScriptPath],
    {
      env, // need to pass values as environment to other node process
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let processOutput = "";
  let processExited = false;

  childProcess.stdout?.on("data", (chunk: Buffer) => {
    processOutput += chunk.toString("utf8");
  });
  childProcess.stderr?.on("data", (chunk: Buffer) => {
    processOutput += chunk.toString("utf8");
  });
  childProcess.once("exit", (code, signal) => {
    processExited = true;
    processOutput += `\nShopify webhook server exited with code ${code} and signal ${signal}.\n`;
  });

  return {
    childProcess,
    output: () => processOutput.trim(),
    hasExited: () => processExited,
  };
}

async function waitForShopifyWebhookServer(
  startedShopifyWebhookServer: StartedShopifyWebhookServer,
  port: number,
): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  const readinessUrl = `http://127.0.0.1:${port}/__smoke_ready`;

  while (Date.now() < deadline) {
    if (startedShopifyWebhookServer.hasExited()) {
      throw new Error(
        `Shopify webhook server exited before it was ready.\n${startedShopifyWebhookServer.output()}`,
      );
    }

    try {
      // If I got a 404, the server is listening, so readiness check is done.
      const response = await fetchWithTimeout(readinessUrl, {}, {
        fetchImpl: fetch,
        timeoutMs: SMOKE_HTTP_REQUEST_TIMEOUT_MS,
      });

      if (response.status === 404) {
        return;
      }
    } catch {
      // The server is not listening yet.
    }

    await delay(100);
  }

  throw new Error(
    `Timed out waiting for Shopify webhook server to start.\n${startedShopifyWebhookServer.output()}`,
  );
}

async function stopShopifyWebhookServer(
  startedShopifyWebhookServer: StartedShopifyWebhookServer,
): Promise<void> {
  if (startedShopifyWebhookServer.hasExited()) {
    return;
  }

  const exitPromise = new Promise<void>((resolve) => {
    startedShopifyWebhookServer.childProcess.once("exit", () => {
      resolve();
    });
  });
  const timeoutPromise = delay(SERVER_STOP_TIMEOUT_MS).then(() => false);

  startedShopifyWebhookServer.childProcess.kill("SIGTERM");

  const stopped = await Promise.race([
    exitPromise.then(() => true),
    timeoutPromise,
  ]);

  if (!stopped && !startedShopifyWebhookServer.hasExited()) {
    startedShopifyWebhookServer.childProcess.kill("SIGKILL");
    await exitPromise;
  }
}

function signShopifyWebhookBody(input: {
  rawBody: Buffer;
  clientSecret: string;
}): string {
  return createHmac("sha256", input.clientSecret)
    .update(input.rawBody)
    .digest("base64");
}

async function sendSignedShopifyWebhook(input: {
  port: number;
  platformEventId: string;
  shopDomain: string;
  clientSecret: string;
}): Promise<ShopifyWebhookAcceptedResponse> {
  const rawBody = Buffer.from(
    JSON.stringify({
      admin_graphql_api_id: SHOPIFY_WEBHOOK_SMOKE_PLATFORM_ORDER_ID,
      smokeTest: true,
    }),
  );
  const hmac = signShopifyWebhookBody({
    rawBody,
    clientSecret: input.clientSecret,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [SHOPIFY_WEBHOOK_HMAC_HEADER]: hmac,
    [SHOPIFY_WEBHOOK_ID_HEADER]: input.platformEventId,
    [SHOPIFY_WEBHOOK_TOPIC_HEADER]: SHOPIFY_WEBHOOK_SMOKE_TOPIC,
    [SHOPIFY_WEBHOOK_SHOP_DOMAIN_HEADER]: input.shopDomain,
  };
  const syntheticWebhookRequest: RequestInit = {
    method: "POST",
    headers,
    body: rawBody,
  };
  const response = await fetchWithTimeout(
    `http://127.0.0.1:${input.port}${SHOPIFY_WEBHOOK_PATH}`,
    syntheticWebhookRequest,
    {
      fetchImpl: fetch,
      timeoutMs: SMOKE_HTTP_REQUEST_TIMEOUT_MS,
    },
  );
  const responseText = await response.text();
  const responseBody = responseText
    ? (JSON.parse(responseText) as ShopifyWebhookAcceptedResponse)
    : undefined;

  if (!response.ok) {
    throw new Error(
      `Synthetic Shopify webhook smoke request failed with HTTP ${response.status}: ${responseText}`,
    );
  }

  if (!responseBody) {
    throw new Error("Synthetic Shopify webhook smoke response was empty.");
  }

  return responseBody;
}

async function cleanupSyntheticPlatformEvent(
  prisma: ReturnType<typeof createPrismaClient>,
  platformEventId: string,
  localPlatformAccountId?: string,
): Promise<number> {
  const deleteResult = await prisma.platformEvent.deleteMany({
    where: {
      platform: SHOPIFY_PLATFORM,
      platformEventId,
      ...(localPlatformAccountId
        ? { platformAccountId: localPlatformAccountId }
        : {}),
    },
  });

  return deleteResult.count;
}

async function ensureSyntheticPlatformAccount(
  prisma: ReturnType<typeof createPrismaClient>,
  shopDomain: string,
): Promise<{ created: boolean; id: string }> {
  const existingPlatformAccount = await prisma.platformAccount.findFirst({
    where: {
      platform: SHOPIFY_PLATFORM,
      shopDomain,
    },
  });

  if (existingPlatformAccount) {
    return {
      created: false,
      id: existingPlatformAccount.id,
    };
  }

  const platformAccount = await prisma.platformAccount.create({
    data: {
      platform: SHOPIFY_PLATFORM,
      platformAccountId: `smoke:shop:${randomUUID()}`,
      name: "Synthetic Shopify webhook smoke shop",
      shopDomain,
    },
  });

  return {
    created: true,
    id: platformAccount.id,
  };
}

async function main(): Promise<void> {
  const smokeDatabaseUrl = readRequiredEnv("DATABASE_URL_SMOKE");
  const shopDomain = normalizeShopifyShopDomain(
    readOptionalStringEnv("SHOPIFY_STORE_DOMAIN") ??
      DEFAULT_SHOPIFY_WEBHOOK_SMOKE_SHOP_DOMAIN,
  );
  const clientSecret =
    readOptionalStringEnv("SHOPIFY_APP_CLIENT_SECRET") ??
    DEFAULT_SHOPIFY_WEBHOOK_SMOKE_CLIENT_SECRET;
  const platformEventId = `smoke:webhook:${Date.now()}:${randomUUID()}`;
  const prisma = createPrismaClient({
    databaseUrl: smokeDatabaseUrl,
  });
  let startedShopifyWebhookServer: StartedShopifyWebhookServer | undefined;
  let localPlatformEventId: string | undefined;
  let syntheticPlatformAccount:
    | Awaited<ReturnType<typeof ensureSyntheticPlatformAccount>>
    | undefined;
  let cleanupDeletedCount = 0;
  let smokeError: unknown;

  try {
    const port = await findAvailableTcpPort();
    syntheticPlatformAccount = await ensureSyntheticPlatformAccount(
      prisma,
      shopDomain,
    );

    startedShopifyWebhookServer = startShopifyWebhookServer({
      smokeDatabaseUrl,
      clientSecret,
      port,
    });
    await waitForShopifyWebhookServer(startedShopifyWebhookServer, port);

    const firstWebhookResponse = await sendSignedShopifyWebhook({
      port,
      platformEventId,
      shopDomain,
      clientSecret,
    });

    assert.deepEqual(firstWebhookResponse, {
      accepted: true,
      duplicate: false,
    });

    // wait for response (record insert into platform event)
    const duplicateWebhookResponse = await sendSignedShopifyWebhook({
      port,
      platformEventId,
      shopDomain,
      clientSecret,
    });

    assert.deepEqual(duplicateWebhookResponse, {
      accepted: true,
      duplicate: true,
    });

    const localPlatformEventCount = await prisma.platformEvent.count({
      where: {
        platform: SHOPIFY_PLATFORM,
        platformAccountId: syntheticPlatformAccount.id,
        platformEventId,
      },
    });

    assert.equal(localPlatformEventCount, 1);

    const localPlatformEvent = await prisma.platformEvent.findFirst({
      where: {
        platform: SHOPIFY_PLATFORM,
        platformAccountId: syntheticPlatformAccount.id,
        platformEventId,
      },
    });

    assert.ok(localPlatformEvent, "Persisted PlatformEvent was not found.");
    assert.equal(
      localPlatformEvent.platformAccountId,
      syntheticPlatformAccount.id,
    );
    assert.equal(localPlatformEvent.platform, SHOPIFY_PLATFORM);
    assert.equal(localPlatformEvent.eventType, SHOPIFY_WEBHOOK_SMOKE_TOPIC);
    assert.equal(localPlatformEvent.resourceType, "order");
    assert.equal(
      localPlatformEvent.resourceId,
      SHOPIFY_WEBHOOK_SMOKE_PLATFORM_ORDER_ID,
    );
    assert.deepEqual(localPlatformEvent.payload, {
      platformOrderId: SHOPIFY_WEBHOOK_SMOKE_PLATFORM_ORDER_ID,
    });
    assert.equal(localPlatformEvent.processedAt, null);

    localPlatformEventId = localPlatformEvent.id;

    console.log("Synthetic Shopify webhook smoke test passed");
    console.log(
      JSON.stringify(
        {
          localPlatformEventId,
          platformEventId,
          platformOrderId: SHOPIFY_WEBHOOK_SMOKE_PLATFORM_ORDER_ID,
          duplicateDeliveryAccepted: duplicateWebhookResponse.duplicate,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    smokeError = error;
    throw error;
  } finally {
    try {
      if (startedShopifyWebhookServer) {
        await stopShopifyWebhookServer(startedShopifyWebhookServer);
      }

      cleanupDeletedCount = await cleanupSyntheticPlatformEvent(
        prisma,
        platformEventId,
        syntheticPlatformAccount?.id,
      );

      const remainingSyntheticPlatformEventCount =
        await prisma.platformEvent.count({
          where: {
            platform: SHOPIFY_PLATFORM,
            ...(syntheticPlatformAccount?.id
              ? { platformAccountId: syntheticPlatformAccount.id }
              : {}),
            platformEventId,
          },
        });

      assert.equal(remainingSyntheticPlatformEventCount, 0);

      if (syntheticPlatformAccount?.created) {
        await prisma.platformAccount.delete({
          where: {
            id: syntheticPlatformAccount.id,
          },
        });
      }
    } catch (cleanupError) {
      if (!smokeError) {
        throw cleanupError;
      }

      console.error(
        "Failed to clean up synthetic Shopify webhook smoke test rows.",
      );
      console.error(cleanupError);
    } finally {
      await prisma.$disconnect();
    }

    if (cleanupDeletedCount > 0) {
      console.log(
        JSON.stringify(
          {
            cleanedUpPlatformEventCount: cleanupDeletedCount,
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error("Failed to run synthetic Shopify webhook smoke test.");
  console.error(error);
  process.exitCode = 1;
});
