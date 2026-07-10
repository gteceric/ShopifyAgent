# Shopify App Configuration

The committed `shopify.app.toml` defines Shopify-managed installation scopes
and app-specific webhook subscriptions. Merchants do not configure these
webhooks themselves.

## Link The Shopify App

Create the app in Shopify's Dev Dashboard, then link this repository to it:

```bash
shopify app config link
```

The command replaces the placeholder `client_id`, app name, and
`application_url` with values from the selected Shopify app. Preserve the
committed access scopes and webhook subscription sections when reviewing the
result. Also replace the placeholder host in `auth.redirect_urls`.

Shopify's app configuration requires an OAuth redirect URL. The normal managed
installation and token-exchange flow does not use that legacy OAuth callback.

The Shopify app client ID is public. Never add the Shopify app client secret or
merchant access tokens to `shopify.app.toml`.

## Development Store

The local web process is defined in `apps/web/shopify.web.toml`. Shopify CLI
starts `apps/web/scripts/dev-with-root-env.mjs`, which loads missing values from
the root `.env` file and then starts Next.js. Shopify CLI also injects
development values such as `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and
`APP_URL`; the app maps those to the internal `SHOPIFY_APP_*` names used by the
backend.

Start Shopify CLI development mode and select the development store you want to
open:

```bash
shopify app dev --store commerceops-dev.myshopify.com
```

While `app dev` is running, Shopify applies saved TOML configuration changes to
the selected development store. Shopify-managed installation prompts the
merchant to approve the configured scopes.

Installing or reinstalling the app in Shopify is not enough to update the local
`ShopifyInstallation` row. The embedded app page must load so App Bridge can
send a session token to `POST /api/shopify/connect`; that route exchanges the
session token for offline credentials and stores the encrypted merchant token.
In development, the Shopify CLI preview is the most reliable way to open the
embedded app context.

`read_orders` and `read_customers` access protected customer data.
`read_products` allows refund checks to inspect product and variant context.
`read_returns` allows refund checks to inspect returnable fulfillment context.
Complete Shopify's protected customer data access request for the app before
relying on real merchant order and customer data.

## Webhook Delivery

The app configuration subscribes every installed shop to:

- `app/uninstalled`
- `orders/create`
- `orders/updated`
- `refunds/create`
- `order_transactions/create`

Shopify sends all four topics to:

```text
POST <application_url>/webhooks/shopify
```

The deployed application URL or its reverse proxy must route that path to the
existing Shopify webhook receiver. Do not deploy the subscriptions until the
public HTTPS webhook path is reachable.

`app/uninstalled` is handled synchronously during webhook ingestion: the app
writes a `PlatformEvent` audit row, marks only that shop's
`ShopifyInstallation` inactive, clears stored access and refresh tokens, and
leaves other shops untouched. Order-related webhook events stay in the
`PlatformEvent` inbox for the webhook processor to sync order snapshots.

Shopify webhook delivery is at-least-once, so duplicate delivery is expected.
The database uniqueness key includes `platform`, `platformAccountId`, and
`platformEventId` so duplicate detection is scoped per merchant.

## Runtime Environment

Production web/runtime environments should provide:

- `DATABASE_URL`
- `USE_REAL_SHOPIFY=true`
- `SHOPIFY_APP_CLIENT_ID`
- `SHOPIFY_APP_CLIENT_SECRET`
- `SHOPIFY_APP_URL`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_TOKEN_ENCRYPTION_KEY`

`SHOPIFY_TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key and must be
kept stable; rotating it without a migration will make stored merchant
credentials unreadable.

`SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_TOKEN` are single-store smoke/manual
tool inputs. They are not used by the multi-merchant dashboard, refund routes,
webhook processor, or installed-shop reconciliation path.

Set `ENABLE_REAL_REFUND_EXECUTION=true` only when real Shopify refund creation
is intentionally enabled. `USE_REAL_SHOPIFY=true` by itself loads live data and
performs live preview/revalidation, but refund execution still has this separate
safety gate.

## Production

After deploying the web application and public webhook receiver, release the
configuration to installed shops:

```bash
shopify app deploy
```

Changing scopes or subscriptions later is also managed by updating this file
and deploying a new Shopify app version.
