-- CreateTable
CREATE TABLE "shopify_installations" (
    "id" TEXT NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "status" VARCHAR(64) NOT NULL DEFAULT 'active',
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopify_installations_status_idx" ON "shopify_installations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_installations_platform_account_id_key" ON "shopify_installations"("platform_account_id");

-- AddForeignKey
ALTER TABLE "shopify_installations" ADD CONSTRAINT "shopify_installations_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
