import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readOptionalStringEnv } from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import type {
  ErrorResponse,
  ShopifyWebhookAcceptedResponse,
} from "./webhook-server-response.js";
import {
  ingestShopifyWebhook,
  ShopifyWebhookRequestError,
  type IngestShopifyWebhookDependencies,
  type IngestShopifyWebhookInput,
} from "../../platforms/shopify/webhooks/ingest-webhook.js";

const DEFAULT_SHOPIFY_WEBHOOK_PORT = 3001;
const MAX_SHOPIFY_WEBHOOK_BODY_BYTES = 256 * 1024;
const SHOPIFY_WEBHOOK_PATH = "/webhooks/shopify";

class RequestBodyTooLargeError extends Error {}

function readShopifyWebhookPort(): number {
  const rawPort = readOptionalStringEnv("SHOPIFY_WEBHOOK_PORT");

  if (!rawPort) {
    return DEFAULT_SHOPIFY_WEBHOOK_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("SHOPIFY_WEBHOOK_PORT must be a valid TCP port.");
  }

  return port;
}

function writeJson<TBody extends object>(
  response: ServerResponse,
  statusCode: number,
  body: TBody,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bodySize = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    bodySize += buffer.length;

    if (bodySize > MAX_SHOPIFY_WEBHOOK_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const port = readShopifyWebhookPort();
  const prisma = createPrismaClient();
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;

      if (request.method !== "POST" || path !== SHOPIFY_WEBHOOK_PATH) {
        const responseBody: ErrorResponse = {
          error: "Not found.",
        };

        writeJson(response, 404, responseBody);
        return;
      }

      try {
        const rawBody = await readRawBody(request);
        const ingestShopifyWebhookInput: IngestShopifyWebhookInput = {
          rawBody,
          headers: request.headers,
        };
        const ingestShopifyWebhookDependencies:
          IngestShopifyWebhookDependencies = {
            prisma,
          };
        const result = await ingestShopifyWebhook(
          ingestShopifyWebhookInput,
          ingestShopifyWebhookDependencies,
        );

        const responseBody: ShopifyWebhookAcceptedResponse = {
          accepted: true,
          duplicate: result.duplicate,
        };

        writeJson(response, 200, responseBody);
      } catch (error) {
        if (error instanceof ShopifyWebhookRequestError) {
          const responseBody: ErrorResponse = {
            error: error.message,
          };

          writeJson(response, error.httpStatusCode, responseBody);
          return;
        }

        if (error instanceof RequestBodyTooLargeError) {
          const responseBody: ErrorResponse = {
            error: "Shopify webhook body is too large.",
          };

          writeJson(response, 413, responseBody);
          return;
        }

        console.error("Failed to receive Shopify webhook.");
        console.error(error);
        const responseBody: ErrorResponse = {
          error: "Failed to receive Shopify webhook.",
        };

        writeJson(response, 500, responseBody);
      }
    })();
  });

  const shutdown = () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => {
        process.exit();
      });
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(port, () => {
    console.log(
      `Shopify webhook receiver listening on http://localhost:${port}${SHOPIFY_WEBHOOK_PATH}`,
    );
  });
}

main().catch((error: unknown) => {
  console.error("Failed to start Shopify webhook receiver.");
  console.error(error);
  process.exitCode = 1;
});
