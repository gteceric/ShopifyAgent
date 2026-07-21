export const PlatformEventStatus = {
  Pending: "pending",
  Retrying: "retrying",
  Processed: "processed",
  DeadLetter: "dead_letter",
} as const;

export type PlatformEventStatusValue =
  (typeof PlatformEventStatus)[keyof typeof PlatformEventStatus];
