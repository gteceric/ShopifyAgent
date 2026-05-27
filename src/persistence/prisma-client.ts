import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export interface CreatePrismaClientOptions {
  databaseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

function readDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a Prisma client.");
  }

  return databaseUrl;
}

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const databaseUrl = options.databaseUrl ?? readDatabaseUrl(options.env ?? process.env);
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}

let sharedPrismaClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  sharedPrismaClient ??= createPrismaClient();

  return sharedPrismaClient;
}

