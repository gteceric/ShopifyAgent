export const REFUND_ORDER_CONTEXT_QUERY = /* GraphQL */ `
  query RefundOrderContext($id: ID!) {
    order(id: $id) {
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
      lineItems(first: 100) {
        nodes {
          id
          currentQuantity
          product {
            category {
              fullName
            }
          }
          customAttributes {
            key
            value
          }
        }
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

export const REFUND_RETURNABLE_FULFILLMENTS_QUERY = /* GraphQL */ `
  query RefundReturnableFulfillments($orderId: ID!) {
    returnableFulfillments(orderId: $orderId, first: 20) {
      nodes {
        id
        returnableFulfillmentLineItems(first: 50) {
          nodes {
            quantity
            fulfillmentLineItem {
              id
            }
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
        customer {
          displayName
        }
      }
    }
  }
`;
