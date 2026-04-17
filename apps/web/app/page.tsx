import { Dashboard } from "./dashboard";
import { parseDashboardUrlState } from "./dashboard-helpers";
import { DASHBOARD_ORDERS } from "./mock-orders";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialState = parseDashboardUrlState(
    resolvedSearchParams,
    DASHBOARD_ORDERS,
  );

  return <Dashboard orders={DASHBOARD_ORDERS} initialState={initialState} />;
}
