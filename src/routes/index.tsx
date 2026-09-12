import { createFileRoute } from "@tanstack/react-router";
import { NightBarn } from "@/game/NightBarn";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <NightBarn />;
}
