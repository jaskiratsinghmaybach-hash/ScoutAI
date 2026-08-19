import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBudget(budget: string): string {
  const map: Record<string, string> = {
    micro: "Micro · <$50K",
    indie: "Indie · $50K–$500K",
    mid: "Mid · $500K–$5M",
    studio: "Studio · $5M+",
  };
  return map[budget] ?? budget;
}

export function scoreBadgeVariant(score: number): "success" | "default" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "default";
  return "danger";
}
