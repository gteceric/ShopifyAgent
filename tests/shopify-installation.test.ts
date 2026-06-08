import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, ShopifyInstallation } from "@prisma/client";
import {
  deactivateShopifyInstallation,
  findShopifyInstallation,
  persistShopifyInstallation,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  SHOPIFY_INSTALLATION_INACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../src/platforms/shopify/persistence/installation.js";

interface RecordedCall {
  operation: string;
  args: unknown;
}

function makeShopifyInstallation(): ShopifyInstallation {
  return {
    id: "shopify-installation-1",
    platformAccountId: "platform-account-1",
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: "encrypted-access-token",
    encryptedRefreshToken: "encrypted-refresh-token",
    accessTokenExpiresAt: new Date("2026-06-06T01:00:00.000Z"),
    refreshTokenExpiresAt: new Date("2026-09-04T00:00:00.000Z"),
    grantedScopes: ["read_orders"],
    installedAt: new Date("2026-06-06T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
    updatedAt: new Date("2026-06-06T00:00:00.000Z"),
  };
}

class FakeShopifyInstallationClient implements ShopifyInstallationClient {
  readonly calls: RecordedCall[] = [];

  constructor(
    readonly installation: ShopifyInstallation | null =
      makeShopifyInstallation(),
  ) {}

  readonly shopifyInstallation = {
    findUnique: async (args: Prisma.ShopifyInstallationFindUniqueArgs) => {
      this.calls.push({ operation: "shopifyInstallation.findUnique", args });

      return this.installation;
    },
    update: async (args: Prisma.ShopifyInstallationUpdateArgs) => {
      this.calls.push({ operation: "shopifyInstallation.update", args });

      assert.ok(this.installation);

      return this.installation;
    },
    upsert: async (args: Prisma.ShopifyInstallationUpsertArgs) => {
      this.calls.push({ operation: "shopifyInstallation.upsert", args });

      assert.ok(this.installation);

      return this.installation;
    },
  };
}

function findCall<TArgs>(calls: RecordedCall[], operation: string): TArgs {
  const call = calls.find((recordedCall) => recordedCall.operation === operation);

  assert.ok(call, `${operation} was not called.`);

  return call.args as TArgs;
}

test("persists a normalized Shopify installation snapshot", async () => {
  const client = new FakeShopifyInstallationClient();

  const result = await persistShopifyInstallation(
    {
      localPlatformAccountId: " platform-account-1 ",
      status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      encryptedAccessToken: "encrypted-access-token",
      encryptedRefreshToken: "encrypted-refresh-token",
      accessTokenExpiresAt: "2026-06-06T01:00:00.000Z",
      refreshTokenExpiresAt: "2026-09-04T00:00:00.000Z",
      grantedScopes: ["write_orders", " read_orders ", "read_orders", ""],
      installedAt: "2026-06-06T00:00:00.000Z",
    },
    client,
  );

  assert.equal(result.id, "shopify-installation-1");

  const upsertArgs = findCall<Prisma.ShopifyInstallationUpsertArgs>(
    client.calls,
    "shopifyInstallation.upsert",
  );
  const expectedData = {
    platformAccountId: "platform-account-1",
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: "encrypted-access-token",
    encryptedRefreshToken: "encrypted-refresh-token",
    accessTokenExpiresAt: new Date("2026-06-06T01:00:00.000Z"),
    refreshTokenExpiresAt: new Date("2026-09-04T00:00:00.000Z"),
    grantedScopes: ["read_orders", "write_orders"],
    installedAt: new Date("2026-06-06T00:00:00.000Z"),
    uninstalledAt: null,
  };

  assert.deepEqual(upsertArgs, {
    where: {
      platformAccountId: "platform-account-1",
    },
    create: expectedData,
    update: expectedData,
  });
});

test("loads a Shopify installation by local platform account ID", async () => {
  const client = new FakeShopifyInstallationClient();

  const result = await findShopifyInstallation("platform-account-1", client);

  assert.equal(result?.id, "shopify-installation-1");
  assert.deepEqual(client.calls, [
    {
      operation: "shopifyInstallation.findUnique",
      args: {
        where: {
          platformAccountId: "platform-account-1",
        },
      },
    },
  ]);
});

test("deactivates a Shopify installation and clears stored credentials", async () => {
  const client = new FakeShopifyInstallationClient();
  const uninstalledAt = new Date("2026-06-06T02:00:00.000Z");

  await deactivateShopifyInstallation(
    {
      localPlatformAccountId: "platform-account-1",
      uninstalledAt,
    },
    client,
  );

  assert.deepEqual(client.calls, [
    {
      operation: "shopifyInstallation.update",
      args: {
        where: {
          platformAccountId: "platform-account-1",
        },
        data: {
          status: SHOPIFY_INSTALLATION_INACTIVE_STATUS,
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          uninstalledAt,
        },
      },
    },
  ]);
});

test("rejects invalid Shopify installation dates before writing", async () => {
  const client = new FakeShopifyInstallationClient();

  await assert.rejects(
    persistShopifyInstallation(
      {
        localPlatformAccountId: "platform-account-1",
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
        grantedScopes: ["read_orders"],
        installedAt: "not-a-date",
      },
      client,
    ),
    /installedAt must be a valid date\./,
  );
  assert.deepEqual(client.calls, []);
});
