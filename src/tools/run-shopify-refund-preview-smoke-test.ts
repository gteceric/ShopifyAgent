import {
  checkRefundEligibility,
  createPolicyConfig,
  createShopifyAdminRefundContextAdapter,
  previewShopifyRefund,
  RefundDecision,
} from "@shopify-agent/core";
import type {
  CheckRefundEligibilityDependencies,
  CheckRefundEligibilityInput,
  PreviewShopifyRefundDependencies,
  PreviewShopifyRefundInput,
  RefundPolicyLineItemEvaluation,
} from "@shopify-agent/core";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the refund preview smoke test.`);
  }

  return value;
}

function readRequiredPositiveIntegerEnv(name: string): number {
  const rawValue = readRequiredEnv(name);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number.`);
  }

  return value;
}

function parseIntegerListEnv(
  name: string,
  value: string,
  options: { min: number },
): number[] {
  const values = value.split(",").map((part) => {
    const trimmedPart = part.trim();
    const parsedValue = Number(trimmedPart);

    if (
      !trimmedPart ||
      !Number.isInteger(parsedValue) ||
      parsedValue < options.min
    ) {
      throw new Error(
        `${name} must be a comma-separated list of whole numbers greater than or equal to ${options.min}.`,
      );
    }

    return parsedValue;
  });

  if (values.length === 0) {
    throw new Error(`${name} must include at least one value.`);
  }

  return values;
}

function parseStringListEnv(name: string, value: string): string[] {
  const values = value.split(",").map((part) => {
    const trimmedPart = part.trim();

    if (!trimmedPart) {
      throw new Error(`${name} must be a comma-separated list of non-empty values.`);
    }

    return trimmedPart;
  });

  if (values.length === 0) {
    throw new Error(`${name} must include at least one value.`);
  }

  return values;
}

function readSmokeRefundLineItemIds(): string[] {
  return parseStringListEnv(
    "SMOKE_REFUND_LINE_ITEM_IDS",
    readRequiredEnv("SMOKE_REFUND_LINE_ITEM_IDS"),
  );
}

function readSmokeRefundQuantities(
  itemCount: number,
): number[] {
  const rawQuantities = process.env.SMOKE_REFUND_QUANTITIES?.trim();

  if (rawQuantities) {
    const quantities = parseIntegerListEnv(
      "SMOKE_REFUND_QUANTITIES",
      rawQuantities,
      { min: 1 },
    );

    if (quantities.length !== itemCount) {
      throw new Error(
        "SMOKE_REFUND_QUANTITIES must contain the same number of entries as SMOKE_REFUND_LINE_ITEM_IDS.",
      );
    }

    return quantities;
  }

  const quantity = readRequiredPositiveIntegerEnv("SMOKE_REFUND_QUANTITY");

  return Array.from({ length: itemCount }, () => quantity);
}

function requireRealShopifySmokeTestFlag(): void {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error(
      "Refund preview smoke test requires USE_REAL_SHOPIFY=true.",
    );
  }
}

function formatSmokeRefundItemEvaluations(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
) {
  return itemEvaluations.map((itemEvaluation, index) => {
    const evaluatedLineItem = itemEvaluation.evidence.evaluatedLineItem;

    return {
      index,
      lineItemId: evaluatedLineItem.lineItemId,
      title: evaluatedLineItem.title,
      decision: itemEvaluation.decision,
      returnableQuantity: evaluatedLineItem.returnableQuantity,
      pendingRefundQuantity: evaluatedLineItem.pendingRefundQuantity,
      hasReturnableFulfillment: evaluatedLineItem.hasReturnableFulfillment,
      reasons: itemEvaluation.reasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
      })),
    };
  });
}

function selectSmokeRefundLineItemById(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
  quantity: number,
  lineItemId: string,
): RefundPolicyLineItemEvaluation {
  const selectedItem = itemEvaluations.find(
    (itemEvaluation) =>
      itemEvaluation.evidence.evaluatedLineItem.lineItemId === lineItemId,
  );

  if (!selectedItem) {
    console.log("Refund preview smoke test item evaluations");
    console.log(
      JSON.stringify(formatSmokeRefundItemEvaluations(itemEvaluations), null, 2),
    );

    throw new Error(
      `No smoke-test line item found for SMOKE_REFUND_LINE_ITEM_IDS value ${lineItemId}.`,
    );
  }

  const evaluatedLineItem = selectedItem.evidence.evaluatedLineItem;

  if (
    selectedItem.decision !== RefundDecision.Eligible ||
    evaluatedLineItem.returnableQuantity < quantity
  ) {
    console.log("Refund preview smoke test item evaluations");
    console.log(
      JSON.stringify(formatSmokeRefundItemEvaluations(itemEvaluations), null, 2),
    );

    throw new Error(
      `Smoke-test line item ${lineItemId} is not eligible for quantity ${quantity}.`,
    );
  }

  return selectedItem;
}

function selectSmokeRefundLineItems(
  itemEvaluations: RefundPolicyLineItemEvaluation[],
  selectedLineItemIds: string[],
  quantities: number[],
): RefundPolicyLineItemEvaluation[] {
  const selectedItems = selectedLineItemIds.map((lineItemId, index) =>
    selectSmokeRefundLineItemById(
      itemEvaluations,
      quantities[index]!,
      lineItemId,
    ),
  );
  const uniqueSelectedLineItemIds = new Set<string>();

  for (const selectedItem of selectedItems) {
    const lineItemId = selectedItem.evidence.evaluatedLineItem.lineItemId;

    if (uniqueSelectedLineItemIds.has(lineItemId)) {
      throw new Error(
        `Refund preview smoke selected the same line item more than once: ${lineItemId}.`,
      );
    }

    uniqueSelectedLineItemIds.add(lineItemId);
  }

  return selectedItems;
}

async function main(): Promise<void> {
  requireRealShopifySmokeTestFlag();

  const orderId = readRequiredEnv("SMOKE_REFUND_ORDER_ID");
  const selectedLineItemIds = readSmokeRefundLineItemIds();
  const quantities = readSmokeRefundQuantities(selectedLineItemIds.length);
  const adapter = createShopifyAdminRefundContextAdapter();
  const eligibilityInput: CheckRefundEligibilityInput = { orderId };
  const eligibilityDependencies: CheckRefundEligibilityDependencies = {
    config: createPolicyConfig(),
    adapter,
  };
  const eligibilityResult = await checkRefundEligibility(
    eligibilityInput,
    eligibilityDependencies,
  );
  const selectedItemEvaluations = selectSmokeRefundLineItems(
    eligibilityResult.policyResult.itemEvaluations,
    selectedLineItemIds,
    quantities,
  );
  const refundPreviewInput: PreviewShopifyRefundInput = {
    orderId,
    refundLineItems: selectedItemEvaluations.map((itemEvaluation, index) => ({
      lineItemId: itemEvaluation.evidence.evaluatedLineItem.lineItemId,
      quantity: quantities[index]!,
    })),
  };
  const refundPreviewDependencies: PreviewShopifyRefundDependencies = {};
  const refundPreview = await previewShopifyRefund(
    refundPreviewInput,
    refundPreviewDependencies,
  );

  console.log("Refund preview smoke test input");
  console.log(
    JSON.stringify(
      {
        orderId,
        selectedLineItemIds,
        selectedLineItems: selectedItemEvaluations.map(
          (itemEvaluation, index) => {
            const selectedLineItem =
              itemEvaluation.evidence.evaluatedLineItem;

            return {
              lineItemId: selectedLineItem.lineItemId,
              title: selectedLineItem.title,
              returnableQuantity: selectedLineItem.returnableQuantity,
              pendingRefundQuantity: selectedLineItem.pendingRefundQuantity,
              decision: itemEvaluation.decision,
              quantity: quantities[index],
            };
          },
        ),
        decision: eligibilityResult.policyResult.decision,
      },
      null,
      2,
    ),
  );

  console.log("Refund preview smoke test result");
  console.log(JSON.stringify(refundPreview, null, 2));
}

main().catch((error: unknown) => {
  console.error("Failed to run Shopify refund preview smoke test.");
  console.error(error);
  process.exitCode = 1;
});
