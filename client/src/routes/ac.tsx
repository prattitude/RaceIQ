import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { gameStore } from "../stores/game";

function AcLayout() {
  const setGameId = gameStore.actions.setGameId;
  useEffect(() => {
    setGameId("ac");
    return () => setGameId(null);
  }, [setGameId]);
  return <Outlet />;
}

export const Route = createFileRoute("/ac")({
  component: AcLayout,
});
