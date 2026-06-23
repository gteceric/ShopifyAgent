import type { DashboardOrder } from "./mock-orders";
import {
  decisionPillClassName,
  getDecisionLabel,
} from "./dashboard-helpers";
import { LineItemDecisionsSection } from "./line-item-decisions-section";
import { MerchantQuestionPanel } from "./merchant-question-panel";
import { RefundPreviewPanel } from "./refund-preview-panel";

interface OrderDetailsPanelProps {
  order: DashboardOrder | null;
  shopDomain: string | null;
  errorMessage?: string | null;
  emptyMessage?: string;
  isPending?: boolean;
}

export function OrderDetailsPanel({
  order,
  shopDomain,
  errorMessage,
  emptyMessage,
  isPending = false,
}: OrderDetailsPanelProps) {
  const base = order?.base;
  const refundEvaluation = order?.refundEvaluation;

  return (
    <aside className="grid gap-5 rounded-[28px] border border-stone-900/10 bg-stone-50/85 p-6 shadow-[0_18px_48px_rgba(66,45,23,0.12)] backdrop-blur-xl xl:sticky xl:top-6">
      {base && refundEvaluation ? (
        <>
          {isPending ? (
            <div className="rounded-2xl border border-orange-700/15 bg-orange-100/60 px-4 py-3 text-sm text-stone-700">
              Checking the latest refund posture for this order...
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
              Live refund check failed: {errorMessage}
            </div>
          ) : null}

          <header className="grid gap-2.5">
            <span
              className={`inline-flex w-fit min-w-[108px] items-center justify-center rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ${decisionPillClassName[refundEvaluation.decision]}`}
            >
              {getDecisionLabel(refundEvaluation.decision)}
            </span>
            <h2
              className="text-[2rem] leading-none text-stone-950"
              style={{
                fontFamily:
                  '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
              }}
            >
              {base.orderName}
            </h2>
            <p className="text-sm text-stone-600">
              {base.customerName} ·{" "}
              <span className="font-mono text-[0.95em]">{base.id}</span>
            </p>
          </header>

          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-3.5 py-2 text-sm text-stone-700">
              Suggested next step: {refundEvaluation.recommendedNextAction}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-stone-50 px-3.5 py-2 text-sm text-stone-700">
              Policy lens: {refundEvaluation.policyWindowLabel}
            </span>
          </div>

          <section className="grid gap-3 sm:grid-cols-2">
            {refundEvaluation.evidence.map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-stone-900/10 bg-stone-50/90 p-4"
              >
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  {item.label}
                </p>
                <p className="font-semibold text-stone-950">{item.value}</p>
              </article>
            ))}
          </section>

          <section>
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-stone-500">
              Reasoning Snapshot
            </p>
            <div className="grid gap-3">
              {refundEvaluation.reasonDetails.map((detail) => (
                <div
                  key={detail}
                  className="border-l-2 border-orange-700/30 pl-3.5"
                >
                  <strong className="mb-1.5 block text-sm text-stone-950">
                    {refundEvaluation.reasonSummary}
                  </strong>
                  <span className="text-sm leading-6 text-stone-600">
                    {detail}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {refundEvaluation.itemEvaluations &&
          refundEvaluation.itemEvaluations.length > 0 ? (
            <>
              <LineItemDecisionsSection
                itemEvaluations={refundEvaluation.itemEvaluations}
              />
              <RefundPreviewPanel
                orderId={base.id}
                shopDomain={shopDomain}
                itemEvaluations={refundEvaluation.itemEvaluations}
              />
            </>
          ) : null}

          <section>
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-stone-500">
              Workflow Timeline
            </p>
            <div className="grid gap-3">
              {refundEvaluation.timeline.map((entry) => (
                <div
                  key={entry.title}
                  className="border-l-2 border-orange-700/30 pl-3.5"
                >
                  <strong className="mb-1.5 block text-sm text-stone-950">
                    {entry.title}
                  </strong>
                  <span className="text-sm leading-6 text-stone-600">
                    {entry.detail}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <MerchantQuestionPanel
            key={base.id}
            orderId={base.id}
            shopDomain={shopDomain}
            decision={refundEvaluation.decision}
          />
        </>
      ) : (
        <div className="text-sm leading-6 text-stone-600">
          {emptyMessage ??
            "Select an order to inspect refund posture, policy reasoning, and next-step guidance."}
        </div>
      )}
    </aside>
  );
}
