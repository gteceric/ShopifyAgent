export const RefundProcessingStatus = {
  Succeeded: "succeeded",
  Pending: "pending",
  Failed: "failed",
  Unknown: "unknown",
} as const;

export type RefundProcessingStatus =
  (typeof RefundProcessingStatus)[keyof typeof RefundProcessingStatus];
