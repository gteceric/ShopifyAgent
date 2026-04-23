interface DashboardHeroProps {
  totalOrders: number;
  visibleOrders: number;
  eligibleCount: number;
  manualReviewCount: number;
  blockedCount: number;
  hasActiveFilters: boolean;
  isUsingLiveOrders: boolean;
}

export function DashboardHero({
  totalOrders,
  visibleOrders,
  eligibleCount,
  manualReviewCount,
  blockedCount,
  hasActiveFilters,
  isUsingLiveOrders,
}: DashboardHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-stone-900/10 bg-stone-50/85 shadow-[0_18px_48px_rgba(66,45,23,0.12)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(189,75,50,0.14),transparent_42%),linear-gradient(315deg,rgba(80,100,67,0.12),transparent_38%)]" />
      <div className="relative z-10 grid gap-5 p-6 sm:p-8">
        <span className="inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
          <span className="h-px w-7 bg-current" />
          {isUsingLiveOrders ? "Live Shopify Triage" : "Refund Operations"}
        </span>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-end">
          <div className="grid gap-4">
            <h1
              className="max-w-[12ch] text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.96] tracking-[-0.05em]"
              style={{
                fontFamily:
                  '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
              }}
            >
              Refund work without the tab chaos.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
              {hasActiveFilters
                ? `Showing ${visibleOrders} of ${totalOrders} orders in the current view, with live refund posture and next-step guidance for the filtered queue.`
                : `Track ${totalOrders} live orders, see their refund posture, and understand the next support move without bouncing through five merchant tools.`}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                {hasActiveFilters ? "Orders In View" : "Orders Loaded"}
              </p>
              <p className="text-3xl font-semibold">{visibleOrders}</p>
              <p className="mt-2 text-sm text-stone-500">
                {hasActiveFilters
                  ? `${totalOrders} total orders loaded`
                  : isUsingLiveOrders
                    ? "Live Shopify order feed"
                    : "Fallback mode or error state"}
              </p>
            </article>
            <article className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                Ready To Approve
              </p>
              <p className="text-3xl font-semibold">{eligibleCount}</p>
            </article>
            <article className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                Needs Review
              </p>
              <p className="text-3xl font-semibold">{manualReviewCount}</p>
            </article>
            <article className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">
                Blocked Cases
              </p>
              <p className="text-3xl font-semibold">{blockedCount}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
