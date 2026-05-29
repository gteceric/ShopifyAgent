-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "shop_domain" VARCHAR(255),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "platform_order_id" TEXT NOT NULL,
    "order_name" VARCHAR(128),
    "created_at_platform" TIMESTAMP(3) NOT NULL,
    "financial_status" VARCHAR(64) NOT NULL,
    "fulfillment_status" VARCHAR(64),
    "total_amount" DECIMAL(18,4),
    "currency_code" VARCHAR(3),
    "raw_payload" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "platform_line_item_id" TEXT NOT NULL,
    "title" TEXT,
    "sku" VARCHAR(128),
    "variant_title" VARCHAR(255),
    "variant_options" JSONB,
    "image_url" TEXT,
    "image_alt_text" TEXT,
    "fulfillment_line_item_id" TEXT,
    "category" TEXT,
    "fulfillment_status" VARCHAR(64),
    "has_returnable_fulfillment" BOOLEAN NOT NULL DEFAULT false,
    "final_sale" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" DECIMAL(18,4),
    "currency_code" VARCHAR(3),
    "current_quantity" INTEGER NOT NULL DEFAULT 0,
    "returnable_quantity" INTEGER NOT NULL DEFAULT 0,
    "pending_refund_quantity" INTEGER NOT NULL DEFAULT 0,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "platform_refund_id" TEXT NOT NULL,
    "status" VARCHAR(64) NOT NULL,
    "total_amount" DECIMAL(18,4),
    "currency_code" VARCHAR(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_line_items" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "order_line_item_id" TEXT,
    "platform" VARCHAR(50) NOT NULL,
    "platform_refund_line_item_id" TEXT,
    "platform_line_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_amount" DECIMAL(18,4),
    "currency_code" VARCHAR(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_transactions" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "platform_refund_transaction_id" TEXT NOT NULL,
    "kind" VARCHAR(64),
    "gateway" VARCHAR(128),
    "status" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(18,4),
    "currency_code" VARCHAR(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_events" (
    "id" TEXT NOT NULL,
    "platform_account_id" TEXT,
    "platform" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "platform_event_id" TEXT NOT NULL,
    "resource_type" VARCHAR(64),
    "resource_id" TEXT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "platform_account_id" TEXT,
    "platform" VARCHAR(50) NOT NULL,
    "sync_type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(64) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "summary" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_accounts_platform_idx" ON "platform_accounts"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_platform_platform_account_id_key" ON "platform_accounts"("platform", "platform_account_id");

-- CreateIndex
CREATE INDEX "orders_platform_account_id_idx" ON "orders"("platform_account_id");

-- CreateIndex
CREATE INDEX "orders_platform_platform_order_id_idx" ON "orders"("platform", "platform_order_id");

-- CreateIndex
CREATE INDEX "orders_platform_financial_status_idx" ON "orders"("platform", "financial_status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_platform_account_id_platform_order_id_key" ON "orders"("platform_account_id", "platform_order_id");

-- CreateIndex
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items"("order_id");

-- CreateIndex
CREATE INDEX "order_line_items_platform_platform_line_item_id_idx" ON "order_line_items"("platform", "platform_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_items_order_id_platform_line_item_id_key" ON "order_line_items"("order_id", "platform_line_item_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_platform_platform_refund_id_idx" ON "refunds"("platform", "platform_refund_id");

-- CreateIndex
CREATE INDEX "refunds_platform_status_idx" ON "refunds"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_order_id_platform_refund_id_key" ON "refunds"("order_id", "platform_refund_id");

-- CreateIndex
CREATE INDEX "refund_line_items_refund_id_idx" ON "refund_line_items"("refund_id");

-- CreateIndex
CREATE INDEX "refund_line_items_order_line_item_id_idx" ON "refund_line_items"("order_line_item_id");

-- CreateIndex
CREATE INDEX "refund_line_items_platform_platform_refund_line_item_id_idx" ON "refund_line_items"("platform", "platform_refund_line_item_id");

-- CreateIndex
CREATE INDEX "refund_line_items_platform_platform_line_item_id_idx" ON "refund_line_items"("platform", "platform_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_line_items_refund_id_platform_refund_line_item_id_key" ON "refund_line_items"("refund_id", "platform_refund_line_item_id");

-- CreateIndex
CREATE INDEX "refund_transactions_refund_id_idx" ON "refund_transactions"("refund_id");

-- CreateIndex
CREATE INDEX "refund_transactions_platform_platform_refund_transaction_id_idx" ON "refund_transactions"("platform", "platform_refund_transaction_id");

-- CreateIndex
CREATE INDEX "refund_transactions_platform_status_idx" ON "refund_transactions"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refund_transactions_refund_id_platform_refund_transaction_i_key" ON "refund_transactions"("refund_id", "platform_refund_transaction_id");

-- CreateIndex
CREATE INDEX "platform_events_platform_account_id_idx" ON "platform_events"("platform_account_id");

-- CreateIndex
CREATE INDEX "platform_events_platform_event_type_idx" ON "platform_events"("platform", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "platform_events_platform_platform_event_id_key" ON "platform_events"("platform", "platform_event_id");

-- CreateIndex
CREATE INDEX "sync_runs_platform_account_id_idx" ON "sync_runs"("platform_account_id");

-- CreateIndex
CREATE INDEX "sync_runs_platform_sync_type_status_idx" ON "sync_runs"("platform", "sync_type", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_line_items" ADD CONSTRAINT "refund_line_items_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_line_items" ADD CONSTRAINT "refund_line_items_order_line_item_id_fkey" FOREIGN KEY ("order_line_item_id") REFERENCES "order_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_transactions" ADD CONSTRAINT "refund_transactions_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_events" ADD CONSTRAINT "platform_events_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
