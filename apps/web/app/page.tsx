import { Dashboard } from "./dashboard";
import { DASHBOARD_ORDERS } from "./mock-orders";

export default function Home() {
  return <Dashboard orders={DASHBOARD_ORDERS} />;
}
