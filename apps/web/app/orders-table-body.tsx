import type { DashboardOrder } from "./mock-orders";
import {
  decisionPillClassName,
  getDecisionLabel,
} from "./dashboard-helpers";

interface OrdersTableBodyProps {
  orders: DashboardOrder[];
  selectedOrderId: string;
  onSelectOrder(orderId: string): void;
}

export function OrdersTableBody({
  orders,
  selectedOrderId,
  onSelectOrder,
}: OrdersTableBodyProps) {
  return (
    <tbody>
      {orders.map((order) => {
        const isSelected = selectedOrderId === order.id;

        return (
          <tr
            key={order.id}
            className={`border-t border-stone-900/8 transition ${
              isSelected ? "bg-orange-100/70" : "hover:bg-stone-100/80"
            }`}
          >
            <td className="px-4 py-4 align-top">
              <button
                type="button"
                className="w-full rounded-2xl px-3 py-3 text-left"
                onClick={() => {
                  onSelectOrder(order.id);
                }}
              >
                <p className="mb-1.5 font-semibold text-stone-950">
                  {order.orderName} · {order.customerName}
                </p>
                <p className="mb-1 text-sm text-stone-600">
                  <span className="font-mono text-[0.92em]">{order.id}</span>
                </p>
                <p className="text-sm text-stone-600">
                  {order.orderTotalLabel} · {order.createdAtLabel}
                </p>
              </button>
            </td>
            <td className="px-4 py-4 align-top">
              <span
                className={`inline-flex min-w-[108px] items-center justify-center rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] ${decisionPillClassName[order.decision]}`}
              >
                {getDecisionLabel(order.decision)}
              </span>
            </td>
            <td className="hidden px-4 py-4 align-top md:table-cell">
              <p className="mb-1.5 font-semibold text-stone-950">
                {order.reasonSummary}
              </p>
              <p className="text-sm text-stone-600">
                {order.financialStatus} · {order.fulfillmentStatus}
              </p>
            </td>
            <td className="hidden px-4 py-4 align-top md:table-cell">
              <p className="mb-1.5 font-semibold text-stone-950">
                {order.recommendedNextAction}
              </p>
              <p className="text-sm text-stone-600">
                {order.lastUpdatedLabel}
              </p>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
