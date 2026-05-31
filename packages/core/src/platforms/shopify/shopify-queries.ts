const REFUND_ORDER_LINE_ITEM_FIELDS = /* GraphQL */ `
  id
  title
  sku
  currentQuantity
  originalUnitPriceSet {
    shopMoney {
      amount
      currencyCode
    }
    presentmentMoney {
      amount
      currencyCode
    }
  }
  variant {
    title
    sku
    selectedOptions {
      name
      value
    }
    image {
      url
      altText
    }
  }
  product {
    category {
      fullName
    }
    featuredMedia {
      preview {
        image {
          url
          altText
        }
      }
    }
  }
  customAttributes {
    key
    value
  }
`;

const REFUND_LINE_ITEM_FIELDS = /* GraphQL */ `
  id
  quantity
  subtotalSet {
    shopMoney {
      amount
      currencyCode
    }
    presentmentMoney {
      amount
      currencyCode
    }
  }
  lineItem {
    id
  }
`;

const REFUND_TRANSACTION_FIELDS = /* GraphQL */ `
  id
  kind
  gateway
  status
  amountSet {
    shopMoney {
      amount
      currencyCode
    }
    presentmentMoney {
      amount
      currencyCode
    }
  }
`;

const RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS = /* GraphQL */ `
  quantity
  fulfillmentLineItem {
    lineItem {
      id
    }
  }
`;

export const REFUND_ORDER_SUMMARY_QUERY = /* GraphQL */ `
  query RefundOrderSummary($id: ID!) {
    order(id: $id) {
      id
      name
      tags
      createdAt
      totalPriceSet {
        shopMoney {
          amount
        }
      }
      displayFinancialStatus
      displayFulfillmentStatus
      transactions(first: 250) {
        kind
        status
      }
      fraudHoldFlag: metafield(namespace: "refund_policy", key: "fraud_hold") {
        value
      }
      manualReviewFlag: metafield(
        namespace: "refund_policy"
        key: "manual_review"
      ) {
        value
      }
      vipOverrideFlag: metafield(
        namespace: "refund_policy"
        key: "vip_override"
      ) {
        value
      }
    }
  }
`;

export const REFUND_ORDER_LINE_ITEMS_QUERY = /* GraphQL */ `
  query RefundOrderLineItems($id: ID!, $after: String) {
    order(id: $id) {
      id
      lineItems(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${REFUND_ORDER_LINE_ITEM_FIELDS}
        }
      }
    }
  }
`;

export const REFUND_ORDER_REFUNDS_QUERY = /* GraphQL */ `
  query RefundOrderRefunds($id: ID!) {
    order(id: $id) {
      id
      # Shopify exposes order refunds here as an array-style field, so request
      # the largest safe page size and cursor-page each refund's nested data.
      refunds(first: 250) {
        id
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
        refundLineItems(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${REFUND_LINE_ITEM_FIELDS}
          }
        }
        transactions(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              ${REFUND_TRANSACTION_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const REFUND_REFUND_LINE_ITEMS_QUERY = /* GraphQL */ `
  query RefundRefundLineItems($id: ID!, $after: String) {
    node(id: $id) {
      ... on Refund {
        id
        refundLineItems(first: 250, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${REFUND_LINE_ITEM_FIELDS}
          }
        }
      }
    }
  }
`;

export const REFUND_TRANSACTIONS_QUERY = /* GraphQL */ `
  query RefundTransactions($id: ID!, $after: String) {
    node(id: $id) {
      ... on Refund {
        id
        transactions(first: 250, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              ${REFUND_TRANSACTION_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const REFUND_RETURNABLE_FULFILLMENTS_QUERY = /* GraphQL */ `
  query RefundReturnableFulfillments($orderId: ID!, $after: String) {
    returnableFulfillments(orderId: $orderId, first: 250, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        returnableFulfillmentLineItems(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS}
          }
        }
      }
    }
  }
`;

export const REFUND_RETURNABLE_FULFILLMENT_LINE_ITEMS_QUERY = /* GraphQL */ `
  query RefundReturnableFulfillmentLineItems($id: ID!, $after: String) {
    node(id: $id) {
      ... on ReturnableFulfillment {
        id
        returnableFulfillmentLineItems(first: 250, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS}
          }
        }
      }
    }
  }
`;

export const SHOPIFY_REFUND_CREATE_MUTATION = /* GraphQL */ `
  mutation ShopifyRefundCreate($input: RefundInput!, $idempotencyKey: String!) {
    refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
      refund {
        id
        totalRefundedSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
        transactions(first: 10) {
          edges {
            node {
              id
              kind
              gateway
              status
              amountSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const SHOPIFY_REFUND_PREVIEW_QUERY = /* GraphQL */ `
  query ShopifyRefundPreview(
    $orderId: ID!
    $refundLineItems: [RefundLineItemInput!]
  ) {
    order(id: $orderId) {
      id
      suggestedRefund(refundLineItems: $refundLineItems) {
        amountSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
        maximumRefundableSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
        subtotalSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
          presentmentMoney {
            amount
            currencyCode
          }
        }
        refundLineItems {
          lineItem {
            id
            title
          }
          quantity
          priceSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
        suggestedTransactions {
          kind
          gateway
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
          maximumRefundableSet {
            shopMoney {
              amount
              currencyCode
            }
            presentmentMoney {
              amount
              currencyCode
            }
          }
          parentTransaction {
            id
          }
        }
      }
    }
  }
`;

export const SHOPIFY_ORDERS_LIST_QUERY = /* GraphQL */ `
  query ShopifyOrdersList($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        displayFinancialStatus
        displayFulfillmentStatus
        transactions(first: 20) {
          kind
          status
        }
        customer {
          displayName
        }
      }
    }
  }
`;
