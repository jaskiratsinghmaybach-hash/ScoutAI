import { SpeedInsights } from "@vercel/speed-insights/next";
import { ScoutApp } from "@/components/scout/ScoutApp";

export default function Home() {
  return (
    <>
      <ScoutApp />
      <SpeedInsights />
    </>
  );
}