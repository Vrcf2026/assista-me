import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/preventiva")({
  component: () => <Outlet />,
});
