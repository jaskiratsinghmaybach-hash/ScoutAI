"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowUp, Check, Copy, Square } from "lucide-react";
import BorderGlow from "@/components/scout/BorderGlow";
import { QuestionCard } from "@/components/scout/QuestionCard";
import { ActivityPill } from "@/components/scout/ActivityPill";
import { ResultsPanel } from "@/components/scout/ResultsPanel";
import { AttachedCardChip } from "@/components/scout/AttachedCardChip";
import { BroadSuggestions } from "@/components/scout/BroadSuggestions";
import { LatestRunIndicator } from "@/components/scout/LatestRunIndicator";
import { UserMessage } from "@/components/scout/UserMessage";
import { ChatsList } from "@/components/scout/ChatsList";
import { AppHeader } from "@/components/scout/AppHeader";
import { ContinuityModal } from "@/components/scout/ContinuityModal";
import { listAllChats } from "@/lib/chatStorage";
import { getSiblingInfo, getActivePath, addMessage } from "@/lib/conversationTree";
import { GLOW_PROPS } from "@/lib/useScoutAppLogic";
import type { useScoutAppLogic } from "@/lib/useScoutAppLogic";
import type { ConversationTurn } from "@/types";

// Desktop (>=768px) chat view: the original three-pane layout (chats
// column / chat thread / Scout results panel) shown side-by-side.
// Pure presentation — every piece of state and every handler comes
// from useScoutAppLogic, shared verbatim with the mobile view, so
// behavior (submit flow, run polling, branching, etc.) never drifts
// between the two.
export function ScoutAppDesktop(props: ReturnType<typeof useScoutAppLogic>) {
  const {
    router,
    chatId,
    user,
    syncStatus,
    activeView,
    setActiveView,
    accountChats,
    refreshAccountChats,
    profile,
    refreshProfile,
    isGlowing,
    isDropdownOpen,
    setIsDropdownOpen,
    signInWithGoogle,
    signOut,
    hasOnboarded,
    localDisplayName,
    completeOnboarding,
    setLocalDisplayName,
    effectiveDisplayName,
    canSend,
    phase,
    setPhase,
    thinkingMessage,
    introText,
    setIntroText,
    userHasEdited,
    setUserHasEdited,
    tree,
    setTree,
    activePathNodes,
    history,
    slots,
    setSlots,
    title,
    setTitle,
    currentQuestion,
    setCurrentQuestion,
    showChatsList,
    setShowChatsList,
    showContinuityModal,
    setShowContinuityModal,
    shareCopied,
    shareDialog,
    setShareDialog,
    runs,
    activeRunId,
    setActiveRunId,
    focusedRunId,
    setFocusedRunId,
    rightPanelRunId,
    setRightPanelRunId,
    inFlightRun,
    openRunCards,
    handlePillClick,
    isRetryingRunId,
    error,
    followUpText,
    setFollowUpText,
    isFollowingUp,
    attachedCard,
    setAttachedCard,
    isClassifyingCardChat,
    suggestionPrefill,
    landingSuggestions,
    typewriter,
    hasHydrated,
    hasStarted,
    headerAvatarUrl,
    headerDisplayName,
    headerInitial,
    handleDeleteConfirmedOnCurrentChat,
    dispatchScout,
    handleRetryRun,
    handleInitialSubmit,
    handleEditMessage,
    handleSwitchBranch,
    handleIntroSubmit,
    handleShareCurrentChat,
    handleCopyCurrentShareLink,
    handleAnswer,
    handleSkipAll,
    handleStop,
    handleNewChat,
    handleFollowUp,
    askForNextQuestion,
    stoppedDuringRef,
    lastScoutArgsRef,
  } = props;

  if (chatId && !hasHydrated) {
    return (
      <main className="flex h-screen w-full items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <span className="text-sm text-foreground-muted">Loading chat…</span>
        </div>
      </main>
    );
  }

  // ---------- INTRO / LANDING VIEW ----------
  // Only the true landing page (no chatId in the URL at all) uses this
  // full-bleed layout. A chat that was just created — including one
  // holding nothing but a pending pre-onboarding draft, so history is
  // still empty — must always render the split chat-view layout below
  // instead: that's where the right-panel onboarding flow actually
  // lives, and where the "fresh chat input bar" branch shows the
  // draft text sitting unsent in the composer. Gating on chatId here
  // (rather than on hasStarted/history alone) is what makes
  // navigating to /chat/[id] actually show the split view immediately
  // instead of bouncing back to a landing-page-shaped screen.
  if (!chatId && !hasStarted && history.length === 0) {
    return (
      <main className="flex h-screen w-full overflow-hidden">
        {/* Inline collapsible chats column — matches the main chat view's
            pattern instead of the old full-screen overlay drawer. */}
        <div
          className={`flex h-full flex-col border-r border-border transition-all duration-200 ${showChatsList ? "w-full max-w-sm" : "w-0 overflow-hidden border-r-0"
            }`}
        >
          {showChatsList && (
            <ChatsList
              onClose={() => setShowChatsList(false)}
              activeView={activeView}
              user={user}
              accountChats={accountChats}
              onRefreshAccountChats={refreshAccountChats}
              onSignIn={() => {
                setShowChatsList(false);
                signInWithGoogle();
              }}
              onSwitchToLocal={() => setActiveView("local")}
              currentChatId={chatId}
              onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
            />
          )}
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
          {/* Upper Left: Chats toggle button — only shown when the column
              is collapsed, so there's always a way to reopen it */}
          {!showChatsList && (
            <div className="absolute left-6 top-6 z-20">
              <button
                type="button"
                onClick={() => setShowChatsList(true)}
                className="group inline-flex items-center gap-1 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                <svg
                  className="h-3.5 w-3.5 text-neutral-400 transition-colors group-hover:text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Chats</span>
              </button>
            </div>
          )}

          {/* Upper Right: Continuity Button */}
          <div className="absolute right-6 top-6 z-20">
            <button
              type="button"
              id="continuity-btn-landing"
              onClick={() => setShowContinuityModal(true)}
              className={`relative flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-95 ${user
                ? "h-8 w-8"
                : "px-3 py-1.5 text-xs font-medium bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                } ${isGlowing
                  ? "ring-2 ring-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse"
                  : user
                    ? "ring-1 ring-border hover:ring-border-strong"
                    : ""
                }`}
            >
              {user ? (
                <>
                  {headerAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={headerAvatarUrl}
                      alt={headerDisplayName}
                      className="h-full w-full rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                      {headerInitial}
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${syncStatus === "synced"
                      ? "bg-emerald-400"
                      : syncStatus === "syncing"
                        ? "bg-amber-400 animate-pulse"
                        : syncStatus === "pending"
                          ? "bg-orange-400"
                          : "bg-neutral-500"
                      }`}
                  />
                </>
              ) : (
                "Continuity"
              )}
            </button>
          </div>

          {/* Continuity Modal (landing view) */}
          {showContinuityModal && (
            <ContinuityModal
              onClose={() => {
                setShowContinuityModal(false);
                setIsDropdownOpen(false);
              }}
              user={user}
              syncStatus={syncStatus}
              activeView={activeView}
              onSelectView={(v) => setActiveView(v)}
              localChatCount={listAllChats().length}
              accountChatCount={accountChats.length}
              onSignIn={() => {
                setShowContinuityModal(false);
                setIsDropdownOpen(false);
                signInWithGoogle();
              }}
              onSignOut={() => {
                setShowContinuityModal(false);
                setIsDropdownOpen(false);
                signOut();
              }}
              onRefreshAccountChats={refreshAccountChats}
              onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
              profile={profile}
              onRefreshProfile={refreshProfile}
              onLocalDisplayNameChange={setLocalDisplayName}
              localDisplayName={localDisplayName}
            />
          )}

          <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.avif"
                alt="ScoutAI"
                width={160}
                height={80}
                priority
                className="h-10 w-auto object-contain"
              />
            </div>

            <p className="mt-2 text-sm text-foreground-muted">
              Autonomous location scouting for film &amp; commercial productions.
            </p>

            <BorderGlow className="mt-6 w-full" {...GLOW_PROPS}>
              <form
                onSubmit={handleIntroSubmit}
                className="flex items-center gap-3 p-2.5 pl-4 pr-3"
              >
                <input
                  value={
                    userHasEdited
                      ? introText
                      : introText || typewriter.displayText
                  }
                  onChange={(e) => {
                    setUserHasEdited(true);
                    if (!typewriter.isFrozen) typewriter.freeze(e.target.value);
                    setIntroText(e.target.value);
                  }}
                  onMouseDown={() => {
                    if (!userHasEdited) {
                      const current = typewriter.displayText;
                      setUserHasEdited(true);
                      setIntroText(current);
                      typewriter.freeze(current);
                    }
                  }}
                  onFocus={() => {
                    if (!userHasEdited) {
                      const current = typewriter.displayText;
                      setUserHasEdited(true);
                      setIntroText(current);
                      typewriter.freeze(current);
                    }
                  }}
                  placeholder={
                    userHasEdited ? "Describe the scene you're scouting..." : ""
                  }
                  autoFocus
                  className={`h-12 flex-1 border-0 bg-transparent px-3 text-base transition-colors duration-300 placeholder:text-neutral-500 focus-visible:ring-0 focus:outline-none ${(userHasEdited
                    ? introText
                    : introText || typewriter.displayText) ||
                    typewriter.isFrozen
                    ? "text-white"
                    : "text-white/85"
                    }`}
                />
                <Button
                  type="submit"
                  disabled={
                    (userHasEdited
                      ? introText
                      : introText || typewriter.displayText
                    ).trim().length < 1
                  }
                  className="h-10 w-10 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                </Button>
              </form>
            </BorderGlow>

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {landingSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    typewriter.freeze(s);
                    setIntroText(s);
                    setUserHasEdited(true);
                  }}
                  className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:text-white active:scale-95"
                >
                  {s.length > 40 ? s.slice(0, 40) + "…" : s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Which run (if any) is "in progress and not the one currently shown" —
  // drives the LatestRunIndicator, and must live directly above whichever
  // input box is actually rendered, never as a floating sibling.
  const latestRun = runs[runs.length - 1];
  const showLatestIndicator =
    Boolean(latestRun) && latestRun.id !== activeRunId;

  // ---------- CONVERSATION VIEW ----------
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-screen flex-col overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-50"
      >
        <AppHeader
          title={title}
          actions={
            <>
              <button
                type="button"
                id="continuity-btn-header"
                onClick={() => setShowContinuityModal(true)}
                className={`relative flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 active:scale-95 ${user
                  ? "h-8 w-8"
                  : "px-3 py-1.5 text-[13px] font-medium bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  } ${isGlowing
                    ? "ring-2 ring-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse"
                    : user
                      ? "ring-1 ring-border hover:ring-border-strong"
                      : ""
                  }`}
              >
                {user ? (
                  <>
                    {headerAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headerAvatarUrl}
                        alt={headerDisplayName}
                        className="h-full w-full rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                        {headerInitial}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${syncStatus === "synced"
                        ? "bg-emerald-400"
                        : syncStatus === "syncing"
                          ? "bg-amber-400 animate-pulse"
                          : syncStatus === "pending"
                            ? "bg-orange-400"
                            : "bg-neutral-500"
                        }`}
                    />
                  </>
                ) : (
                  "Continuity"
                )}
              </button>
              <button
                type="button"
                onClick={handleShareCurrentChat}
                className="rounded-full bg-neutral-800/60 px-3 py-1.5 text-[13px] font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                Share
              </button>
            </>
          }
        />

        {/* Continuity Modal (conversation view) */}
        {showContinuityModal && (
          <ContinuityModal
            onClose={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
            }}
            user={user}
            syncStatus={syncStatus}
            activeView={activeView}
            onSelectView={(v) => setActiveView(v)}
            localChatCount={listAllChats().length}
            accountChatCount={accountChats.length}
            onSignIn={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signInWithGoogle();
            }}
            onSignOut={() => {
              setShowContinuityModal(false);
              setIsDropdownOpen(false);
              signOut();
            }}
            onRefreshAccountChats={refreshAccountChats}
            onDeleteConfirmedOnCurrentChat={handleDeleteConfirmedOnCurrentChat}
            profile={profile}
            onRefreshProfile={refreshProfile}
            onLocalDisplayNameChange={setLocalDisplayName}
            localDisplayName={localDisplayName}
          />
        )}
      </motion.div>

      {shareDialog && (
        <div
          onClick={() => setShareDialog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 shadow-2xl space-y-5"
          >
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Share chat
              </div>
              <h3 className="truncate text-base font-semibold text-foreground">
                {shareDialog.title}
              </h3>
            </div>

            <div className="rounded-lg border border-border bg-black/30 p-3.5">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Viewer access
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">
                Anyone with this link can view this shared ScoutAI chat and its
                scouting results.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                Share link
              </label>
              <div className="flex h-11 items-center rounded-lg border border-border bg-surface px-3 focus-within:border-border-strong">
                <input
                  readOnly
                  value={shareDialog.url}
                  className="selectable min-w-0 flex-1 bg-transparent pr-3 text-sm text-neutral-300 outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyCurrentShareLink}
                  aria-label="Copy share link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                >
                  {shareCopied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShareDialog(null)}
                className="rounded-full bg-neutral-800/60 px-4 py-1.5 text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="flex w-full max-w-md flex-col border-r border-border">
          <div className="flex flex-1 flex-col overflow-hidden">
            {showChatsList ? (
              <ChatsList
                onClose={() => setShowChatsList(false)}
                activeView={activeView}
                user={user}
                accountChats={accountChats}
                onRefreshAccountChats={refreshAccountChats}
                onSignIn={() => {
                  setShowChatsList(false);
                  signInWithGoogle();
                }}
                onSwitchToLocal={() => setActiveView("local")}
                currentChatId={chatId}
                onDeleteConfirmedOnCurrentChat={
                  handleDeleteConfirmedOnCurrentChat
                }
              />
            ) : (
              <>
                <div className="sticky top-0 z-10 flex w-full items-center justify-center gap-2 px-4 py-2">
                  {/* Chats Button */}
                  <button
                    type="button"
                    onClick={() => setShowChatsList(true)}
                    className="group inline-flex items-center gap-0.5 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-[15px] font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                  >
                    {/* Chat Bubble Icon */}
                    <svg
                      className="h-6 w-8 text-neutral-400 transition-colors group-hover:text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <span>Chats</span>
                  </button>

                  {/* New Chat (+) Button */}
                  <div className="relative group/newchat">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      aria-label="New chat"
                      className="group flex h-8.75 w-8.75 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                    >
                      <svg
                        className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>

                    {/* Tooltip: hidden by default, fades in on hover, doesn't block clicks */}
                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover/newchat:opacity-100">
                      New chat
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
                  <motion.div
                    key={chatId ?? "landing"}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    {/* Merged message and activity stream */}
                    {activePathNodes.map((node, i) => {
                      const run = runs.find(
                        (r) =>
                          r.triggerMessageIndex === i &&
                          r.triggerMessageContent === node.content,
                      );
                      const isActive = run ? activeRunId === run.id : false;

                      const siblingInfo = getSiblingInfo(tree, node.id);
                      const hasSiblings = Boolean(
                        siblingInfo && siblingInfo.total > 1,
                      );

                      return (
                        <div key={node.id} className="space-y-4">
                          {node.role === "user" ? (
                            <UserMessage
                              content={node.content}
                              attachedCard={node.attachedCard}
                              onEdit={(newContent) =>
                                handleEditMessage(i, newContent)
                              }
                              pager={
                                hasSiblings && siblingInfo
                                  ? {
                                    position: siblingInfo.position,
                                    total: siblingInfo.total,
                                    onNavigate: (direction) => {
                                      const parentId =
                                        node.parentId ?? tree.rootId;
                                      const currentIndex =
                                        siblingInfo.position - 1;
                                      const targetIndex =
                                        direction === "prev"
                                          ? currentIndex - 1
                                          : currentIndex + 1;
                                      const targetSibling =
                                        siblingInfo.siblings[targetIndex];
                                      if (!targetSibling) return;
                                      handleSwitchBranch(
                                        parentId,
                                        targetSibling.id,
                                      );
                                    },
                                  }
                                  : undefined
                              }
                            />
                          ) : (
                            <div className="max-w-[90%] text-sm leading-relaxed text-foreground-muted">
                              {node.content}
                            </div>
                          )}

                          {/* Agent activity now lives exclusively on the right
                            panel (mini pill + focused overlay) — the left
                            chat stream only ever shows the ActivityPill
                            summary, whether the run is still going or
                            already done. Clicking it opens that run's
                            cards on the right (or, if a NEW in-flight run
                            is currently tracked elsewhere, just switches
                            which run's cards are shown — it never blocks
                            on the newer run). */}
                          {run && (
                            <div key={run.id} className="space-y-2">
                              <ActivityPill
                                run={run}
                                isActive={isActive}
                                onClick={() => handlePillClick(run)}
                              />

                              {run.packet && (
                                <div className="rounded-lg border border-border bg-surface p-3.5">
                                  <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                    Scout&apos;s note
                                  </div>
                                  <div className="mt-2 space-y-1.5 text-xs">
                                    {run.packet.agent_reasoning
                                      .split("\n")
                                      .filter(Boolean)
                                      .map((line: string, li: number) => {
                                        const trimmed = line.trim();
                                        const isBullet =
                                          trimmed.startsWith("-") ||
                                          trimmed.startsWith("•");
                                        return isBullet ? (
                                          <div
                                            key={li}
                                            className="flex items-start gap-2 leading-relaxed text-foreground-muted"
                                          >
                                            <span className="select-none text-foreground-muted/60">
                                              •
                                            </span>
                                            <span>
                                              {trimmed.replace(/^[-•]\s*/, "")}
                                            </span>
                                          </div>
                                        ) : (
                                          <p
                                            key={li}
                                            className="mb-2.5 font-medium leading-relaxed text-foreground"
                                          >
                                            {trimmed}
                                          </p>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {phase === "thinking" &&
                      !runs.some(
                        (r) => r.triggerMessageIndex === history.length - 1,
                      ) && (
                        <div className="flex items-center gap-2 text-xs text-foreground-muted">
                          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                          {thinkingMessage}
                        </div>
                      )}

                    {/* Follow-up with an attached card goes through the
                      /api/card-chat classify step before anything else
                      happens (see handleFollowUp) — that request can take
                      a moment, and until now nothing in the message
                      stream showed feedback while it was in flight (the
                      submit button had a tiny pulsing dot, easy to miss).
                      Mirrors the "thinking" indicator above; only one of
                      the two is ever visible since phase !== "thinking"
                      while isFollowingUp/isClassifyingCardChat is true. */}
                    {(isFollowingUp || isClassifyingCardChat) && (
                      <div className="flex items-center gap-2 text-xs text-foreground-muted">
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                        {isClassifyingCardChat
                          ? "Thinking about that..."
                          : thinkingMessage}
                      </div>
                    )}

                    {error && (
                      <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                        {error}
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* ---- Input area: exactly one block renders at a time, and the
              LatestRunIndicator (if needed) always sits directly above it. ---- */}

                {/* Fresh chat input bar when history is empty */}
                {history.length === 0 &&
                  (phase === "intro" || phase === "clarifying") && (
                    <div className="shrink-0">
                      {!canSend && (
                        <div className="px-6 pb-2 text-center text-xs text-foreground-muted">
                          Finish the quick setup on the right to start chatting with ScoutAI.
                        </div>
                      )}
                      <div className="px-6 pb-6 pt-2">
                        <BorderGlow {...GLOW_PROPS}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleInitialSubmit();
                            }}
                            className="flex items-center gap-2 p-2.5"
                          >
                            <input
                              value={followUpText || introText}
                              onChange={(e) => {
                                setFollowUpText(e.target.value);
                                setIntroText(e.target.value);
                              }}
                              placeholder="Describe the scene you're scouting..."
                              autoFocus
                              disabled={!canSend}
                              className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <span
                              title={
                                canSend
                                  ? undefined
                                  : "Finish the quick setup on the right to send messages"
                              }
                            >
                              <Button
                                type="submit"
                                disabled={
                                  !canSend ||
                                  (followUpText || introText).trim().length < 3
                                }
                                className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                              >
                                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                              </Button>
                            </span>
                          </form>
                        </BorderGlow>
                      </div>
                    </div>
                  )}

                {history.length > 0 &&
                  (phase === "intro" ||
                    phase === "clarifying" ||
                    phase === "thinking" ||
                    phase === "running") && (
                    <div className="shrink-0">
                      {showLatestIndicator && (
                        <LatestRunIndicator
                          latestRun={latestRun}
                          isViewingLatest={false}
                          onJumpToLatest={() => setActiveRunId(latestRun.id)}
                        />
                      )}
                      {!canSend && phase === "clarifying" && (
                        <div className="px-6 pb-2 text-center text-xs text-foreground-muted">
                          Finish the quick setup on the right to start chatting with ScoutAI.
                        </div>
                      )}
                      <div className="px-6 pb-6 pt-2 space-y-3">
                        {phase === "clarifying" && currentQuestion ? (
                          currentQuestion.type === "choice" ? (
                            <>
                              <QuestionCard
                                key={currentQuestion.text}
                                question={currentQuestion}
                                onAnswer={handleAnswer}
                                onSkipAll={handleSkipAll}
                                prefill={suggestionPrefill}
                                disabled={!canSend}
                              />
                              <BorderGlow {...GLOW_PROPS}>
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!canSend) return;
                                    if (followUpText.trim().length === 0)
                                      return;
                                    const message = followUpText.trim();
                                    setFollowUpText("");
                                    handleAnswer(message);
                                  }}
                                  className="flex items-center gap-2 p-2.5"
                                >
                                  <input
                                    value={followUpText}
                                    onChange={(e) =>
                                      setFollowUpText(e.target.value)
                                    }
                                    placeholder="Or type your own answer..."
                                    disabled={!canSend}
                                    className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <span
                                    title={
                                      canSend
                                        ? undefined
                                        : "Finish the quick setup on the right to send messages"
                                    }
                                  >
                                    <Button
                                      type="submit"
                                      disabled={
                                        !canSend ||
                                        followUpText.trim().length === 0
                                      }
                                      className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                                    >
                                      <ArrowUp
                                        className="h-4 w-4"
                                        strokeWidth={2.5}
                                      />
                                    </Button>
                                  </span>
                                </form>
                              </BorderGlow>
                            </>
                          ) : (
                            <QuestionCard
                              key={currentQuestion.text}
                              question={currentQuestion}
                              onAnswer={handleAnswer}
                              onSkipAll={handleSkipAll}
                              prefill={suggestionPrefill}
                              disabled={!canSend}
                            />
                          )
                        ) : phase === "clarifying" || phase === "intro" ? (
                          // Chat-only turn (greeting/small talk reply) — no
                          // question pending, just let the user keep talking.
                          <BorderGlow {...GLOW_PROPS}>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!canSend) return;
                                const message = followUpText.trim();
                                if (!message) return;
                                setFollowUpText("");
                                const updatedHistory: ConversationTurn[] = [
                                  ...history,
                                  { role: "user", content: message },
                                ];
                                setTree((prevTree) => {
                                  const leafId =
                                    getActivePath(prevTree).at(-1)?.id ??
                                    null;
                                  return addMessage(
                                    prevTree,
                                    leafId,
                                    "user",
                                    message,
                                  ).tree;
                                });
                                askForNextQuestion(updatedHistory, slots);
                              }}
                              className="flex items-center gap-2 p-2.5"
                            >
                              <input
                                value={followUpText}
                                onChange={(e) =>
                                  setFollowUpText(e.target.value)
                                }
                                placeholder="Type a message..."
                                autoFocus
                                disabled={!canSend}
                                className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span
                                title={
                                  canSend
                                    ? undefined
                                    : "Finish the quick setup on the right to send messages"
                                }
                              >
                                <Button
                                  type="submit"
                                  disabled={!canSend || followUpText.trim().length === 0}
                                  className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                                >
                                  <ArrowUp
                                    className="h-4 w-4"
                                    strokeWidth={2.5}
                                  />
                                </Button>
                              </span>
                            </form>
                          </BorderGlow>
                        ) : (
                          <BorderGlow {...GLOW_PROPS}>
                            <div className="flex items-center gap-2 p-2.5">
                              <div className="h-10 flex-1 rounded-lg bg-transparent px-2 text-sm text-foreground-muted flex items-center">
                                {phase === "thinking"
                                  ? thinkingMessage
                                  : "Researching locations..."}
                              </div>
                              {/* handleStop itself already aborts the
                                  controller/reader correctly — this was
                                  only a visual bug: a 3px div read as an
                                  inert dot rather than a clickable stop
                                  icon. Swapped for a proper filled
                                  square with hover/active feedback. */}
                              <button
                                type="button"
                                onClick={handleStop}
                                aria-label="Stop"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised transition-colors hover:bg-surface-raised/70 active:scale-95"
                              >
                                <Square className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                            </div>
                          </BorderGlow>
                        )}
                      </div>
                    </div>
                  )}

                {phase === "stopped" && (
                  <div className="shrink-0">
                    {showLatestIndicator && (
                      <LatestRunIndicator
                        latestRun={latestRun}
                        isViewingLatest={false}
                        onJumpToLatest={() => setActiveRunId(latestRun.id)}
                      />
                    )}
                    {!canSend && (
                      <div className="px-6 pb-2 text-center text-xs text-foreground-muted">
                        Finish the quick setup on the right to start chatting with ScoutAI.
                      </div>
                    )}
                    <div className="px-6 pb-6 pt-2">
                      <BorderGlow {...GLOW_PROPS}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!canSend) return;
                            if (followUpText.trim().length === 0) return;
                            const message = followUpText.trim();
                            setFollowUpText("");

                            if (stoppedDuringRef.current === "research") {
                              const updatedHistory: ConversationTurn[] = [
                                ...history,
                                { role: "user", content: message },
                              ];
                              setTree((prevTree) => {
                                const leafId =
                                  getActivePath(prevTree).at(-1)?.id ?? null;
                                return addMessage(
                                  prevTree,
                                  leafId,
                                  "user",
                                  message,
                                ).tree;
                              });
                              dispatchScout(
                                lastScoutArgsRef.current.finalSlots,
                                message,
                                updatedHistory,
                              );
                            } else {
                              const updatedHistory: ConversationTurn[] = [
                                ...history,
                                { role: "user", content: message },
                              ];
                              setTree((prevTree) => {
                                const leafId =
                                  getActivePath(prevTree).at(-1)?.id ?? null;
                                return addMessage(
                                  prevTree,
                                  leafId,
                                  "user",
                                  message,
                                ).tree;
                              });
                              askForNextQuestion(updatedHistory, slots);
                            }
                          }}
                          className="flex items-center gap-2 p-2.5"
                        >
                          <input
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                            placeholder="Type a message to continue..."
                            autoFocus
                            disabled={!canSend}
                            className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span
                            title={
                              canSend
                                ? undefined
                                : "Finish the quick setup on the right to send messages"
                            }
                          >
                            <Button
                              type="submit"
                              disabled={!canSend || followUpText.trim().length === 0}
                              className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                            >
                              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                            </Button>
                          </span>
                        </form>
                      </BorderGlow>
                    </div>
                  </div>
                )}

                {phase === "done" && latestRun?.packet && (
                  <div className="shrink-0">
                    {showLatestIndicator && (
                      <LatestRunIndicator
                        latestRun={latestRun}
                        isViewingLatest={false}
                        onJumpToLatest={() => setActiveRunId(latestRun.id)}
                      />
                    )}
                    {!canSend && (
                      <div className="px-6 pb-2 text-center text-xs text-foreground-muted">
                        Finish the quick setup on the right to start chatting with ScoutAI.
                      </div>
                    )}
                    {(() => {
                      const shownLocations =
                        runs.find((r) => r.id === rightPanelRunId)?.packet
                          ?.locations ?? [];
                      return shownLocations.length > 0 ? (
                        <div className="px-6 pb-2 backdrop-blur-md bg-black/30">
                          <BroadSuggestions
                            locations={shownLocations}
                            onPick={(text) => {
                              setAttachedCard({ scope: "all", locations: shownLocations });
                              setFollowUpText(text);
                            }}
                          />
                        </div>
                      ) : null;
                    })()}
                    <div className="px-6 pb-6 pt-2">
                      <BorderGlow {...GLOW_PROPS}>
                        <form
                          onSubmit={handleFollowUp}
                          className="flex flex-col gap-2 p-2.5"
                        >
                          {attachedCard && (
                            <div className="px-1">
                              <AttachedCardChip
                                scope={attachedCard.scope}
                                locations={attachedCard.locations}
                                onRemove={() => setAttachedCard(null)}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              value={followUpText}
                              onChange={(e) => setFollowUpText(e.target.value)}
                              placeholder="Type a message to continue..."
                              disabled={!canSend || isFollowingUp || isClassifyingCardChat}
                              className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <span
                              title={
                                canSend
                                  ? undefined
                                  : "Finish the quick setup on the right to send messages"
                              }
                            >
                              <Button
                                type="submit"
                                disabled={
                                  !canSend ||
                                  followUpText.trim().length === 0 ||
                                  isFollowingUp ||
                                  isClassifyingCardChat
                                }
                                className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                              >
                                {isFollowingUp || isClassifyingCardChat ? (
                                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
                                ) : (
                                  <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                                )}
                              </Button>
                            </span>
                          </div>
                        </form>
                      </BorderGlow>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-8 py-8">
          <ResultsPanel
            runs={runs}
            inFlightRun={inFlightRun}
            focusedRunId={focusedRunId}
            selectedRunId={rightPanelRunId}
            onOpenFocused={(runId) => setFocusedRunId(runId)}
            onCloseFocused={() => setFocusedRunId(null)}
            onSelectRun={(runId) => {
              const r = runs.find((item) => item.id === runId);
              if (r && !r.packet) {
                setActiveRunId(runId);
                setRightPanelRunId(runId);
                setFocusedRunId(runId);
              } else {
                openRunCards(runId);
              }
            }}
            onOpenMiniPillCards={(runId) => {
              const r = runs.find((item) => item.id === runId);
              if (r && !r.packet) {
                setFocusedRunId(runId);
              } else {
                openRunCards(runId);
              }
            }}
            onDismissCards={() => {
              setRightPanelRunId(null);
              setFocusedRunId(null);
            }}
            onAttachCard={(location) =>
              setAttachedCard({ scope: "single", locations: [location] })
            }
            onAttachSuggestion={(location, suggestionText) => {
              setAttachedCard({ scope: "single", locations: [location] });
              setFollowUpText(suggestionText);
            }}
            user={user}
            syncStatus={syncStatus}
            onOpenContinuity={() => setShowContinuityModal(true)}
            onQuickStart={(text) => handleInitialSubmit(text)}
            hasOnboarded={hasOnboarded}
            onboardingPrefillName={effectiveDisplayName}
            onCompleteOnboarding={completeOnboarding}
            displayName={effectiveDisplayName}
            onRetryRun={handleRetryRun}
            isRetryingRunId={isRetryingRunId}
          />
        </div>
      </main>
    </motion.div>
  );

}
