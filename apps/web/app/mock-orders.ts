export type RefundDecision = "eligible" | "ineligible" | "manual_review";

export interface DashboardItemEvaluationViewModel {
  lineItemId: string;
  title: string;
  sku?: string;
  variantTitle?: string;
  variantOptions?: Array<{ name: string; value: string }>;
  imageUrl?: string;
  imageAltText?: string;
  unitPriceLabel?: string;
  decision: RefundDecision;
  returnableQuantity: number;
  reasonSummary: string;
  evidence: Array<{ label: string; value: string }>;
}

export interface DashboardOrderBase {
  id: string;
  orderName: string;
  customerName: string;
  createdAtLabel: string;
  orderAgeDays: number;
  orderTotalLabel: string;
  financialStatus: string;
  fulfillmentStatus: string;
}

export interface DashboardRefundEvaluationViewModel {
  decision: RefundDecision;
  reasonSummary: string;
  recommendedNextAction: string;
  lastUpdatedLabel: string;
  policyWindowLabel: string;
  reasonDetails: string[];
  evidence: Array<{ label: string; value: string }>;
  itemEvaluations?: DashboardItemEvaluationViewModel[];
  timeline: Array<{ title: string; detail: string }>;
}

export interface DashboardOrder {
  base: DashboardOrderBase;
  refundEvaluation: DashboardRefundEvaluationViewModel;
}

export const DASHBOARD_ORDERS: DashboardOrder[] = [
  {
    base: {
      id: "gid://shopify/Order/6275299147889",
      orderName: "#4881",
      customerName: "Maya Chen",
      createdAtLabel: "Nov 14, 2025",
      orderAgeDays: 152,
      orderTotalLabel: "$128.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "ineligible",
      reasonSummary: "Outside the 30-day refund window.",
      recommendedNextAction: "Decline the refund request with policy wording.",
      lastUpdatedLabel: "Checked 3 minutes ago",
      policyWindowLabel: "30-day refund window",
      reasonDetails: [
        "The order is 152 days old, which is well outside the merchant's standard refund period.",
        "No active override or escalation path is attached to this order right now.",
      ],
      evidence: [
        { label: "Order Age", value: "152 days" },
        { label: "Refund Window", value: "30 days" },
        { label: "Returnable Fulfillments", value: "Available" },
        { label: "Prior Full Refund", value: "No" },
      ],
      timeline: [
        {
          title: "Refund check completed",
          detail: "Policy engine returned an ineligible decision with no exception path.",
        },
        {
          title: "Order fulfilled",
          detail: "Items were delivered and would otherwise be returnable.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/6261109358705",
      orderName: "#4867",
      customerName: "Elliot Park",
      createdAtLabel: "Nov 3, 2025",
      orderAgeDays: 163,
      orderTotalLabel: "$36.99",
      financialStatus: "Paid",
      fulfillmentStatus: "Unfulfilled",
    },
    refundEvaluation: {
      decision: "manual_review",
      reasonSummary: "Unfulfilled order is past the cancellation window.",
      recommendedNextAction: "Escalate to a human reviewer before promising a refund.",
      lastUpdatedLabel: "Checked 5 minutes ago",
      policyWindowLabel: "30-day cancellation and refund window",
      reasonDetails: [
        "The order was never fulfilled, so this is closer to a cancellation case than a standard return.",
        "It is still far outside the automatic cancellation window, so a human should decide how to handle it.",
      ],
      evidence: [
        { label: "Order Age", value: "163 days" },
        { label: "Fulfillment", value: "Unfulfilled" },
        { label: "Escalation", value: "Required" },
        { label: "Exception Available", value: "No" },
      ],
      timeline: [
        {
          title: "Manual review required",
          detail: "This case is too old for auto-approval or auto-denial.",
        },
        {
          title: "Fulfillment follow-up likely",
          detail: "Support may need to coordinate with ops before replying.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1001",
      orderName: "#1001",
      customerName: "Jordan Rivera",
      createdAtLabel: "Mar 10, 2026",
      orderAgeDays: 20,
      orderTotalLabel: "$48.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "eligible",
      reasonSummary: "Inside the refund window with returnable fulfillments available.",
      recommendedNextAction: "Approve the standard refund flow.",
      lastUpdatedLabel: "Checked just now",
      policyWindowLabel: "30-day refund window",
      reasonDetails: [
        "The order is inside the merchant refund window and has no blocking flags.",
        "Returnable fulfillments are available, so this can proceed through the normal flow.",
      ],
      evidence: [
        { label: "Order Age", value: "20 days" },
        { label: "Refund Window", value: "30 days" },
        { label: "Financial Status", value: "Paid" },
        { label: "Returnable Fulfillments", value: "Available" },
      ],
      timeline: [
        {
          title: "Order qualifies automatically",
          detail: "No manual-review flag or override is needed for this case.",
        },
        {
          title: "Support can reply confidently",
          detail: "This case can move straight into the standard refund flow.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1044",
      orderName: "#1044",
      customerName: "Noah Patel",
      createdAtLabel: "Apr 2, 2026",
      orderAgeDays: 12,
      orderTotalLabel: "$785.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "manual_review",
      reasonSummary: "High-value order crosses merchant review threshold.",
      recommendedNextAction: "Route to a senior support or finance queue.",
      lastUpdatedLabel: "Checked 11 minutes ago",
      policyWindowLabel: "High-value review threshold",
      reasonDetails: [
        "The order is still timely, but the amount is high enough that merchant policy requires a sign-off.",
        "This is a review gate, not a denial.",
      ],
      evidence: [
        { label: "Order Total", value: "$785.00" },
        { label: "High-Value Threshold", value: "$500.00" },
        { label: "Refund Window", value: "Inside" },
        { label: "Escalation", value: "Required" },
      ],
      timeline: [
        {
          title: "Threshold-based review",
          detail: "Merchant policy flags higher-value orders for additional approval.",
        },
        {
          title: "Refund not denied",
          detail: "A human still needs to decide before customer communication is finalized.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1089",
      orderName: "#1089",
      customerName: "Sophia Nguyen",
      createdAtLabel: "Apr 7, 2026",
      orderAgeDays: 7,
      orderTotalLabel: "$62.50",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "eligible",
      reasonSummary: "Fresh order inside the refund window with no policy blockers.",
      recommendedNextAction: "Approve the refund and send standard confirmation.",
      lastUpdatedLabel: "Checked 2 minutes ago",
      policyWindowLabel: "30-day refund window",
      reasonDetails: [
        "The order was placed recently and remains well inside the merchant refund window.",
        "No special review flags or blocking conditions were found, so the standard refund path applies.",
      ],
      evidence: [
        { label: "Order Age", value: "7 days" },
        { label: "Refund Window", value: "30 days" },
        { label: "Financial Status", value: "Paid" },
        { label: "Returnable Fulfillments", value: "Available" },
      ],
      timeline: [
        {
          title: "Auto-approval path",
          detail: "This case qualifies cleanly under the default merchant policy.",
        },
        {
          title: "Customer reply ready",
          detail: "Support can confirm the refund without extra escalation.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1127",
      orderName: "#1127",
      customerName: "Liam Brooks",
      createdAtLabel: "Feb 19, 2026",
      orderAgeDays: 55,
      orderTotalLabel: "$214.30",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "ineligible",
      reasonSummary: "Past the standard refund window for a completed order.",
      recommendedNextAction: "Decline and reference the merchant's posted policy window.",
      lastUpdatedLabel: "Checked 14 minutes ago",
      policyWindowLabel: "30-day refund window",
      reasonDetails: [
        "The order has aged beyond the standard refund period, so it no longer qualifies automatically.",
        "The order was otherwise normal, but there is no exception attached that would reopen eligibility.",
      ],
      evidence: [
        { label: "Order Age", value: "55 days" },
        { label: "Refund Window", value: "30 days" },
        { label: "Fulfillment", value: "Delivered" },
        { label: "Exception Available", value: "No" },
      ],
      timeline: [
        {
          title: "Window expired",
          detail: "The policy deadline passed before the customer requested a refund.",
        },
        {
          title: "No exception path",
          detail: "Support can deny this case without routing it for manual review.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1182",
      orderName: "#1182",
      customerName: "Ava Martinez",
      createdAtLabel: "Mar 28, 2026",
      orderAgeDays: 17,
      orderTotalLabel: "$512.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    refundEvaluation: {
      decision: "manual_review",
      reasonSummary: "Inside the window, but refund amount exceeds the merchant review threshold.",
      recommendedNextAction: "Escalate to a senior reviewer for approval.",
      lastUpdatedLabel: "Checked 8 minutes ago",
      policyWindowLabel: "High-value review threshold",
      reasonDetails: [
        "Timing is not the issue here; the order is still within the standard policy window.",
        "Because the refund amount is large, the merchant requires an approval step before support responds.",
      ],
      evidence: [
        { label: "Order Total", value: "$512.00" },
        { label: "Review Threshold", value: "$500.00" },
        { label: "Refund Window", value: "Inside" },
        { label: "Escalation", value: "Required" },
      ],
      timeline: [
        {
          title: "Threshold trigger detected",
          detail: "This case entered the approval queue based on order value.",
        },
        {
          title: "Support paused",
          detail: "A final merchant decision is needed before customer-facing messaging.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1215",
      orderName: "#1215",
      customerName: "Ethan Wong",
      createdAtLabel: "Jan 30, 2026",
      orderAgeDays: 75,
      orderTotalLabel: "$89.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Unfulfilled",
    },
    refundEvaluation: {
      decision: "manual_review",
      reasonSummary: "Late unfulfilled order needs a human decision instead of an automatic response.",
      recommendedNextAction: "Route to support operations before confirming the outcome.",
      lastUpdatedLabel: "Checked 6 minutes ago",
      policyWindowLabel: "30-day cancellation and refund window",
      reasonDetails: [
        "The order was never fulfilled, which makes it operationally different from a standard return.",
        "It is still well past the normal cancellation window, so support should not promise an outcome automatically.",
      ],
      evidence: [
        { label: "Order Age", value: "75 days" },
        { label: "Fulfillment", value: "Unfulfilled" },
        { label: "Financial Status", value: "Paid" },
        { label: "Escalation", value: "Required" },
      ],
      timeline: [
        {
          title: "Cancellation path expired",
          detail: "The case no longer qualifies for automatic pre-fulfillment cancellation handling.",
        },
        {
          title: "Ops review recommended",
          detail: "Support may need inventory or shipping context before replying.",
        },
      ],
    },
  },
  {
    base: {
      id: "gid://shopify/Order/1279",
      orderName: "#1279",
      customerName: "Grace Kim",
      createdAtLabel: "Apr 11, 2026",
      orderAgeDays: 3,
      orderTotalLabel: "$24.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Unfulfilled",
    },
    refundEvaluation: {
      decision: "eligible",
      reasonSummary: "Newly placed unfulfilled order can be canceled and refunded normally.",
      recommendedNextAction: "Approve the cancellation refund flow.",
      lastUpdatedLabel: "Checked just now",
      policyWindowLabel: "30-day cancellation and refund window",
      reasonDetails: [
        "The order is very recent and has not yet shipped, so it fits the normal cancellation path.",
        "There are no blocking flags, no review thresholds, and no exception handling needed here.",
      ],
      evidence: [
        { label: "Order Age", value: "3 days" },
        { label: "Fulfillment", value: "Unfulfilled" },
        { label: "Cancellation Window", value: "Inside" },
        { label: "Escalation", value: "Not required" },
      ],
      timeline: [
        {
          title: "Cancellation allowed",
          detail: "This order can be stopped and refunded through the standard support flow.",
        },
        {
          title: "Low-friction case",
          detail: "No additional reviewer or finance approval is needed.",
        },
      ],
    },
  },
];
