import type { RefundPolicyInput } from "../domain/refund-policy.types.js";

export interface RefundContextInput {
  orderId: string;
}

export interface RefundContextPlatformAdapter {
  platform: string;
  loadRefundContext(input: RefundContextInput): Promise<RefundPolicyInput>;
}
