"use server";

import {
  confirmRefundForDashboard,
  type RefundConfirmRequest,
  type RefundConfirmResult,
} from "./refund-confirm";

export async function confirmRefundAction(
  input: RefundConfirmRequest,
): Promise<RefundConfirmResult> {
  return confirmRefundForDashboard(input);
}
