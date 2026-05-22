import {
  decisionPillClassName,
  getDecisionLabel,
} from "./dashboard-helpers";
import type { DashboardItemEvaluationViewModel } from "./mock-orders";

interface LineItemDecisionsSectionProps {
  itemEvaluations: DashboardItemEvaluationViewModel[];
}

export function LineItemDecisionsSection({
  itemEvaluations,
}: LineItemDecisionsSectionProps) {
  if (itemEvaluations.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-stone-500">
        Line Item Decisions
      </p>
      <div className="grid gap-3">
        {itemEvaluations.map((item) => (
          <article
            key={item.lineItemId}
            className="rounded-2xl border border-stone-900/10 bg-stone-50/90 p-4"
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-stone-950">
                  {item.title}
                </strong>
                <span className="font-mono text-[11px] text-stone-500">
                  {item.lineItemId}
                </span>
              </div>
              <span
                className={`inline-flex min-w-[94px] items-center justify-center rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${decisionPillClassName[item.decision]}`}
              >
                {getDecisionLabel(item.decision)}
              </span>
            </div>

            <p className="mb-3 text-sm leading-6 text-stone-600">
              {item.reasonSummary}
            </p>

            <dl className="grid gap-2 sm:grid-cols-2">
              {item.evidence.map((evidenceItem) => (
                <div
                  key={evidenceItem.label}
                  className="rounded-xl border border-stone-900/10 bg-white/60 px-3 py-2"
                >
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    {evidenceItem.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-950">
                    {evidenceItem.value}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
