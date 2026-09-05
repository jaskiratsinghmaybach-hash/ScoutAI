"use client";

import { useScoutAppLogic } from "@/lib/useScoutAppLogic";
import { useIsMobile } from "@/lib/useIsMobile";
import { ScoutAppDesktop } from "@/components/scout/ScoutAppDesktop";
import { ScoutAppMobile } from "@/components/scout/ScoutAppMobile";

// Entry point used by both /app/page.tsx and /app/chat/[id]/page.tsx.
// All state, effects, and handlers live in useScoutAppLogic — this
// component's only job is picking which layout renders them:
//   - ScoutAppDesktop: the original three-column layout (chats /
//     thread / Scout results shown side-by-side).
//   - ScoutAppMobile: the same views as full-screen, one at a time,
//     switched with a header "Chat | Scout" toggle and a slide-over
//     chats list — see the ScoutAI mobile mockups this was built from.
// Because both consume the exact same hook, there is no behavior to
// keep in sync by hand: fix a bug once here and both layouts get it.
//
// suppressHydrationWarning: useIsMobile() reads window.innerWidth
// synchronously in its lazy useState initialiser on the client, so a
// real phone gets isMobile=true immediately. SSR (no window) returns
// false and renders desktop markup. The resulting SSR↔client mismatch
// is intentional and harmless — the correct layout replaces the SSR
// shell before the user can see it — but without this attribute React
// would throw a hydration error in the console.
export function ScoutApp({ chatId }: { chatId?: string }) {
  const logic = useScoutAppLogic({ chatId });
  const isMobile = useIsMobile();

  return (
    <div suppressHydrationWarning className="h-screen w-screen overflow-hidden">
      {isMobile ? <ScoutAppMobile {...logic} /> : <ScoutAppDesktop {...logic} />}
    </div>
  );
}
