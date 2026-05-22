export const REFUND_ORDER_CONTEXT_QUERY = /* GraphQL */ `
  query RefundOrderContext($id: ID!) {
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
      transactions(first: 20) {
        kind
        status
      }
      lineItems(first: 100) {
        nodes {
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
              lineItem {
                id
              }
            }
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
