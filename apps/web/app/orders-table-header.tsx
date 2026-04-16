const tableHeaderClassName =
  "px-4 py-4 text-left text-[11px] uppercase tracking-[0.18em] text-stone-500";

const responsiveTableHeaderClassName = `${tableHeaderClassName} hidden md:table-cell`;

export function OrdersTableHeader() {
  return (
    <thead className="bg-stone-50/90">
      <tr>
        <th className={tableHeaderClassName}>Order</th>
        <th className={tableHeaderClassName}>Decision</th>
        <th className={responsiveTableHeaderClassName}>Refund Posture</th>
        <th className={responsiveTableHeaderClassName}>Action</th>
      </tr>
    </thead>
  );
}
