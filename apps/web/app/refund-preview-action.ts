"use server";

import {
  previewRefundForDashboard,
  type RefundPreviewRequest,
  type RefundPreviewResult,
} from "./refund-preview";

export async function previewRefundAction(
  input: RefundPreviewRequest,
): Promise<RefundPreviewResult> {
  return previewRefundForDashboard(input);
}
