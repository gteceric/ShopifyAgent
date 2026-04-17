import type { RefundPolicyInput } from "../domain/refund-policy.types.js";

export interface LoadRefundContextInput {
  orderId: string;
}

export interface RefundContextPlatformAdapter {
  platform: string;
  loadRefundContext(input: LoadRefundContextInput): Promise<RefundPolicyInput>;
}
