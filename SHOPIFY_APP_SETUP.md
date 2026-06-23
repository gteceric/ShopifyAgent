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

Start Shopify CLI development mode and select the NextLensFix development
store:

```bash
shopify app dev --store nextlensfix.myshopify.com
```

While `app dev` is running, Shopify applies saved TOML configuration changes to
the selected development store. Shopify-managed installation prompts the
merchant to approve the configured scopes.

`read_orders` and `read_customers` access protected customer data.
`read_products` allows refund checks to inspect product and variant context.
`read_returns` allows refund checks to inspect returnable fulfillment context.
Complete Shopify's protected customer data access request for the app before
relying on real merchant order and customer data.

## Webhook Delivery

The app configuration subscribes every installed shop to:

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

`app/uninstalled` is intentionally not subscribed yet. Add it after its webhook
handler deactivates the corresponding `ShopifyInstallation`.

## Production

After deploying the web application and public webhook receiver, release the
configuration to installed shops:

```bash
shopify app deploy
```

Changing scopes or subscriptions later is also managed by updating this file
and deploying a new Shopify app version.
