import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  receiveShopifyWebhook,
  ShopifyWebhookRequestError,
  type ReceiveShopifyWebhookDependencies,
  type ReceiveShopifyWebhookInput,
} from "../../platforms/shopify/webhooks/receive-webhook.js";

const DEFAULT_SHOPIFY_WEBHOOK_PORT = 3001;
const MAX_SHOPIFY_WEBHOOK_BODY_BYTES = 256 * 1024;
const SHOPIFY_WEBHOOK_PATH = "/webhooks/shopify";

class RequestBodyTooLargeError extends Error {}

function readShopifyWebhookPort(): number {
  const rawPort = process.env.SHOPIFY_WEBHOOK_PORT?.trim();

  if (!rawPort) {
    return DEFAULT_SHOPIFY_WEBHOOK_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("SHOPIFY_WEBHOOK_PORT must be a valid TCP port.");
  }

  return port;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
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
        writeJson(response, 404, {
          error: "Not found.",
        });
        return;
      }

      try {
        const rawBody = await readRawBody(request);
        const receiveShopifyWebhookInput: ReceiveShopifyWebhookInput = {
          rawBody,
          headers: request.headers,
        };
        const receiveShopifyWebhookDependencies:
          ReceiveShopifyWebhookDependencies = {
            prisma,
          };
        const result = await receiveShopifyWebhook(
          receiveShopifyWebhookInput,
          receiveShopifyWebhookDependencies,
        );

        writeJson(response, 200, {
          accepted: true,
          duplicate: result.duplicate,
        });
      } catch (error) {
        if (error instanceof ShopifyWebhookRequestError) {
          writeJson(response, error.httpStatusCode, {
            error: error.message,
          });
          return;
        }

        if (error instanceof RequestBodyTooLargeError) {
          writeJson(response, 413, {
            error: "Shopify webhook body is too large.",
          });
          return;
        }

        console.error("Failed to receive Shopify webhook.");
        console.error(error);
        writeJson(response, 500, {
          error: "Failed to receive Shopify webhook.",
        });
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
