import readline from "node:readline";

import { createRefundMcpServer } from "./server.js";
import { JsonRpcRequestSchema } from "./schemas.js";

const server = createRefundMcpServer();

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const message = line.trim();

    if (!message) {
      continue;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(message);
    } catch {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error.",
          },
        })}\n`,
      );
      continue;
    }

    const parsedMessage = JsonRpcRequestSchema.safeParse(parsed);

    if (!parsedMessage.success) {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid JSON-RPC message.",
            data: parsedMessage.error.flatten(),
          },
        })}\n`,
      );
      continue;
    }

    const response = await server.handleMessage(parsedMessage.data);

    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
