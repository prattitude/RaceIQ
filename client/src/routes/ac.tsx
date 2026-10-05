import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useGameStore } from "../stores/game";

function AcLayout() {
  const setGameId = useGameStore((state) => state.setGameId);
  useEffect(() => {
    setGameId("ac");
    return () => setGameId(null);
  }, [setGameId]);
  return <Outlet />;
}

export const Route = createFileRoute("/ac")({
  component: AcLayout,
});
