"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowUp, Menu, MoreVertical, Square, X } from "lucide-react";
import BorderGlow from "@/components/scout/BorderGlow";
import { QuestionCard } from "@/components/scout/QuestionCard";
import { ActivityPill } from "@/components/scout/ActivityPill";
import { ResultsPanel } from "@/components/scout/ResultsPanel";
import { AttachedCardChip } from "@/components/scout/AttachedCardChip";
import { BroadSuggestions } from "@/components/scout/BroadSuggestions";
import { LatestRunIndicator } from "@/components/scout/LatestRunIndicator";
import { UserMessage } from "@/components/scout/UserMessage";
import { ChatsList } from "@/components/scout/ChatsList";
import { ContinuityModal } from "@/components/scout/ContinuityModal";
import { getSiblingInfo, getActivePath, addMessage } from "@/lib/conversationTree";
import { listAllChats } from "@/lib/chatStorage";
import { GLOW_PROPS } from "@/lib/useScoutAppLogic";
import type { useScoutAppLogic } from "@/lib/useScoutAppLogic";
import type { ConversationTurn } from "@/types";

type MobileTab = "chat" | "scout";

// Mobile (<768px) layout: the same three views the desktop shows
// side-by-side (chats / chat thread / Scout results) become one
// full-screen view at a time on phones, matching the ScoutAI mockups:
//   - Chats list: full-screen slide-over, opened via the header's
//     hamburger button.
//   - Chat thread + Scout results: share one screen, switched with
//     the "Chat | Scout" segmented control in the header — same
//     control shown in the reference screens.
// Every piece of state and every handler below comes from
// useScoutAppLogic — the exact same hook ScoutAppDesktop uses — so
// submit flow, run polling, branching, retries, etc. behave
// identically on both layouts. This file only decides how to arrange
// them on a narrow screen.
export function ScoutAppMobile(props: ReturnType<typeof useScoutAppLogic>) {
  const {
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
    signInWithGoogle,
    signOut,
    hasOnboarded,
    localDisplayName,
    completeOnboarding,
    setLocalDisplayName,
    effectiveDisplayName,
    canSend,
    phase,
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
    title,
    currentQuestion,
    showChatsList,
    setShowChatsList,
    showContinuityModal,
    setShowContinuityModal,
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
    handleAnswer,
    handleSkipAll,
    handleStop,
    handleNewChat,
    handleFollowUp,
    handleIntroSubmit,
    typewriter,
    askForNextQuestion,
    stoppedDuringRef,
    lastScoutArgsRef,
  } = props;

  // Which of the two main screens is showing. Only meaningful once a
  // chat has actually started — the landing/intro screen (below)
  // doesn't have a Scout side yet, since there's no run to show.
  const [tab, setTab] = useState<MobileTab>("chat");
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);

  // On mobile, the shared hook initialises showChatsList to true when
  // there is no chatId (so the desktop sidebar starts open). Mobile
  // treats that flag as "render the full-screen chats overlay", which
  // would take over the entire screen on a fresh load before the user
  // has done anything. Fix: reset it to false exactly once when this
  // mobile view mounts — desktop is completely unaffected because it
  // never mounts this component.
  useEffect(() => {
    setShowChatsList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Onboarding lives in the Scout tab's right-panel component
  // (ResultsPanel -> OnboardingFlow) — same component desktop shows
  // permanently alongside the chat. On desktop that's always visible,
  // so a message sent from the landing page before onboarding is done
  // (see handleIntroSubmit: it stashes the text as a pending draft and
  // navigates to /chat/[id] without touching history) lands the user
  // somewhere they can immediately finish onboarding. On mobile only
  // one tab is mounted at a time and it defaults to "chat", so that
  // same navigation used to drop the user on an empty chat thread with
  // no visible way to onboard — the reported "blackout". Fix: as soon
  // as we're on a real chat route (chatId present, so we're past the
  // landing page) and onboarding isn't done, force the Scout tab open
  // so OnboardingFlow is what the user actually sees.
  useEffect(() => {
    if (chatId && !hasOnboarded) {
      setTab("scout");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, hasOnboarded]);

  // Once onboarding completes, hop back to the chat tab: the pending
  // draft (if any) is already sitting in the composer per
  // useScoutAppLogic's hydration effect, unsent, waiting for the user
  // to hit send themselves.
  const handleCompleteOnboarding = (name: string) => {
    completeOnboarding(name);
    setTab("chat");
  };

  const latestRun = runs[runs.length - 1];
  const showLatestIndicator = Boolean(latestRun) && latestRun.id !== activeRunId;

  // ---------- CHATS LIST: full-screen slide-over ----------
  // Rendered on top of everything else, same component desktop uses.
  if (showChatsList) {
    return (
      <main className="flex h-screen w-full flex-col overflow-hidden">
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
      </main>
    );
  }

  // ---------- INTRO / LANDING VIEW ----------
  // No chat started yet — just the logo + input, full screen. Mirrors
  // ScoutAppDesktop's landing view but single-column.
  if (!chatId && !hasStarted && history.length === 0) {
    return (
      <main className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden px-4">
        <div className="absolute left-4 top-4 z-20">
          <button
            type="button"
            onClick={() => setShowChatsList(true)}
            aria-label="Chats"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 backdrop-blur-sm active:scale-95"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="absolute right-4 top-4 z-20">
          <button
            type="button"
            onClick={() => setShowContinuityModal(true)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm active:scale-95 ${isGlowing
              ? "ring-2 ring-amber-400/90 shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-pulse"
              : user
                ? "ring-1 ring-border"
                : "bg-neutral-800/60"
              }`}
          >
            {user ? (
              headerAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headerAvatarUrl}
                  alt={headerDisplayName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
                  {headerInitial}
                </div>
              )
            ) : (
              <div className="h-2 w-2 rounded-full bg-neutral-400" />
            )}
          </button>
        </div>

        {showContinuityModal && (
          <ContinuityModal
            onClose={() => setShowContinuityModal(false)}
            user={user}
            syncStatus={syncStatus}
            activeView={activeView}
            onSelectView={(v) => setActiveView(v)}
            localChatCount={listAllChats().length}
            accountChatCount={accountChats.length}
            onSignIn={() => {
              setShowContinuityModal(false);
              signInWithGoogle();
            }}
            onSignOut={() => {
              setShowContinuityModal(false);
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

        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center text-center">
          <Image
            src="/logo.avif"
            alt="ScoutAI"
            width={160}
            height={80}
            priority
            className="h-9 w-auto object-contain"
          />
          <p className="mt-2 text-sm text-foreground-muted">
            Autonomous location scouting for film &amp; commercial productions.
          </p>

          <BorderGlow className="mt-6 w-full no-glow" {...GLOW_PROPS}>
            <form
              onSubmit={handleIntroSubmit}
              className="flex items-center gap-3 p-2.5 pl-4 pr-3"
            >
              <input
                value={userHasEdited ? introText : introText || typewriter.displayText}
                onChange={(e) => {
                  setUserHasEdited(true);
                  if (!typewriter.isFrozen) typewriter.freeze(e.target.value);
                  setIntroText(e.target.value);
                }}
                onFocus={() => {
                  if (!userHasEdited) {
                    const current = typewriter.displayText;
                    setUserHasEdited(true);
                    setIntroText(current);
                    typewriter.freeze(current);
                  }
                }}
                placeholder={userHasEdited ? "Describe the scene you're scouting..." : ""}
                className="h-12 flex-1 border-0 bg-transparent px-3 text-base placeholder:text-neutral-500 focus-visible:ring-0 focus:outline-none"
              />
              <Button
                type="submit"
                disabled={
                  (userHasEdited ? introText : introText || typewriter.displayText).trim()
                    .length < 1
                }
                className="h-10 w-10 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </Button>
            </form>
          </BorderGlow>
        </div>
      </main>
    );
  }

  // ---------- MAIN CHAT VIEW (Chat / Scout tabs) ----------
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex h-screen flex-col overflow-hidden"
    >
      {showContinuityModal && (
        <ContinuityModal
          onClose={() => setShowContinuityModal(false)}
          user={user}
          syncStatus={syncStatus}
          activeView={activeView}
          onSelectView={(v) => setActiveView(v)}
          localChatCount={listAllChats().length}
          accountChatCount={accountChats.length}
          onSignIn={() => {
            setShowContinuityModal(false);
            signInWithGoogle();
          }}
          onSignOut={() => {
            setShowContinuityModal(false);
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

      {/* Header: hamburger (chats) — Chat|Scout toggle — overflow menu.
          Matches the reference screenshots' top bar exactly. */}
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setShowChatsList(true)}
          aria-label="Chats"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center rounded-full bg-neutral-800/60 p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={`rounded-full px-4 py-1.5 transition-colors ${tab === "chat" ? "bg-white text-black" : "text-neutral-300"
              }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setTab("scout")}
            className={`rounded-full px-4 py-1.5 transition-colors ${tab === "scout" ? "bg-white text-black" : "text-neutral-300"
              }`}
          >
            Scout
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowOverflowMenu((v) => !v)}
            aria-label="Chat options"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 active:scale-95"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          <AnimatePresence>
            {showOverflowMenu && (
              <>
                {/* Backdrop to catch outside taps */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowOverflowMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      handleNewChat();
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-white/5"
                  >
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowContinuityModal(true);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-white/5"
                  >
                    Account
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      {title && (
        <div className="shrink-0 truncate px-4 pb-2.5 pt-0.5 text-center font-display text-[15px] font-medium tracking-tight text-foreground/90">
          {title}
        </div>
      )}

      {/* Body: exactly one of the two tabs is mounted at a time. Scout
          keeps its own scroll/overlay behavior unchanged (same
          ResultsPanel component as desktop); Chat gets the message
          thread + composer below. */}
      {tab === "scout" ? (
        <div className="mobile-scout-scroll flex min-h-0 flex-1 flex-col px-3 py-4">
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
            onAttachCard={(location) => {
              setAttachedCard({ scope: "single", locations: [location] });
              setTab("chat");
            }}
            onAttachSuggestion={(location, suggestionText) => {
              setAttachedCard({ scope: "single", locations: [location] });
              setFollowUpText(suggestionText);
              setTab("chat");
            }}
            user={user}
            syncStatus={syncStatus}
            onOpenContinuity={() => setShowContinuityModal(true)}
            onQuickStart={(text) => {
              handleInitialSubmit(text);
              setTab("chat");
            }}
            hasOnboarded={hasOnboarded}
            onboardingPrefillName={effectiveDisplayName}
            onCompleteOnboarding={handleCompleteOnboarding}
            displayName={effectiveDisplayName}
            onRetryRun={handleRetryRun}
            isRetryingRunId={isRetryingRunId}
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <motion.div
              key={chatId ?? "landing"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="space-y-4"
            >
              {activePathNodes.map((node, i) => {
                const run = runs.find(
                  (r) =>
                    r.triggerMessageIndex === i &&
                    r.triggerMessageContent === node.content,
                );
                const isActive = run ? activeRunId === run.id : false;
                const siblingInfo = getSiblingInfo(tree, node.id);
                const hasSiblings = Boolean(siblingInfo && siblingInfo.total > 1);

                return (
                  <div key={node.id} className="space-y-3">
                    {node.role === "user" ? (
                      <UserMessage
                        content={node.content}
                        attachedCard={node.attachedCard}
                        onEdit={(newContent) => handleEditMessage(i, newContent)}
                        pager={
                          hasSiblings && siblingInfo
                            ? {
                              position: siblingInfo.position,
                              total: siblingInfo.total,
                              onNavigate: (direction) => {
                                const parentId = node.parentId ?? tree.rootId;
                                const currentIndex = siblingInfo.position - 1;
                                const targetIndex =
                                  direction === "prev"
                                    ? currentIndex - 1
                                    : currentIndex + 1;
                                const targetSibling = siblingInfo.siblings[targetIndex];
                                if (!targetSibling) return;
                                handleSwitchBranch(parentId, targetSibling.id);
                              },
                            }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="max-w-[92%] text-sm leading-relaxed text-foreground-muted">
                        {node.content}
                      </div>
                    )}

                    {run && (
                      <div key={run.id} className="space-y-2">
                        <ActivityPill
                          run={run}
                          isActive={isActive}
                          onClick={() => {
                            handlePillClick(run);
                            setTab("scout");
                          }}
                        />
                        {run.packet && (
                          <button
                            type="button"
                            onClick={() => {
                              openRunCards(run.id);
                              setTab("scout");
                            }}
                            className="w-full rounded-lg border border-border bg-surface p-3 text-left text-xs text-foreground-muted"
                          >
                            View {run.packet.locations.length} location
                            {run.packet.locations.length === 1 ? "" : "s"} in Scout →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {phase === "thinking" &&
                !runs.some((r) => r.triggerMessageIndex === history.length - 1) && (
                  <div className="flex items-center gap-2 text-xs text-foreground-muted">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                    {thinkingMessage}
                  </div>
                )}

              {(isFollowingUp || isClassifyingCardChat) && (
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  {isClassifyingCardChat ? "Thinking about that..." : thinkingMessage}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  {error}
                </div>
              )}
            </motion.div>
          </div>

          {/* ---- Composer: same phase-driven branches as desktop,
              condensed for a single-column, safe-area-aware bar. ---- */}
          <div className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
            {showLatestIndicator && phase !== "done" && (
              <LatestRunIndicator
                latestRun={latestRun}
                isViewingLatest={false}
                onJumpToLatest={() => {
                  setActiveRunId(latestRun.id);
                  setTab("scout");
                }}
              />
            )}

            {!canSend && (phase === "clarifying" || phase === "intro") && (
              <div className="px-4 pb-1 pt-2 text-center text-xs text-foreground-muted">
                Tap the account icon to finish quick setup before chatting.
              </div>
            )}

            <div className="px-3 pb-3 pt-2">
              {history.length === 0 && (phase === "intro" || phase === "clarifying") ? (
                <BorderGlow className="no-glow" {...GLOW_PROPS}>
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
                      disabled={!canSend}
                      className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!canSend || (followUpText || introText).trim().length < 3}
                      className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </Button>
                  </form>
                </BorderGlow>
              ) : phase === "clarifying" && currentQuestion ? (
                currentQuestion.type === "choice" ? (
                  <div className="space-y-2">
                    <QuestionCard
                      key={currentQuestion.text}
                      question={currentQuestion}
                      onAnswer={handleAnswer}
                      onSkipAll={handleSkipAll}
                      prefill={suggestionPrefill}
                      disabled={!canSend}
                    />
                    <BorderGlow className="no-glow" {...GLOW_PROPS}>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!canSend) return;
                          if (followUpText.trim().length === 0) return;
                          const message = followUpText.trim();
                          setFollowUpText("");
                          handleAnswer(message);
                        }}
                        className="flex items-center gap-2 p-2.5"
                      >
                        <input
                          value={followUpText}
                          onChange={(e) => setFollowUpText(e.target.value)}
                          placeholder="Or type your own answer..."
                          disabled={!canSend}
                          className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <Button
                          type="submit"
                          disabled={!canSend || followUpText.trim().length === 0}
                          className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                        >
                          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                        </Button>
                      </form>
                    </BorderGlow>
                  </div>
                ) : (
                  <BorderGlow className="no-glow" {...GLOW_PROPS}>
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
                          const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
                          return addMessage(prevTree, leafId, "user", message).tree;
                        });
                        askForNextQuestion(updatedHistory, slots);
                      }}
                      className="flex items-center gap-2 p-2.5"
                    >
                      <input
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        placeholder="Type a message..."
                        disabled={!canSend}
                        className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <Button
                        type="submit"
                        disabled={!canSend || followUpText.trim().length === 0}
                        className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                      >
                        <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                      </Button>
                    </form>
                  </BorderGlow>
                )
              ) : phase === "clarifying" ? (
                // Same "clarifying" phase, but no pending question — a
                // chat-only turn (e.g. the agent replied to a greeting
                // or small talk with no next_question). Matches
                // ScoutAppDesktop's `phase === "clarifying" || phase
                // === "intro"` fallback: previously this case fell
                // through every other branch below (none of which
                // match "clarifying") straight to the final `: null`,
                // making the whole composer disappear right after the
                // first message if it read as a greeting/small talk.
                <BorderGlow className="no-glow" {...GLOW_PROPS}>
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
                        const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
                        return addMessage(prevTree, leafId, "user", message).tree;
                      });
                      askForNextQuestion(updatedHistory, slots);
                    }}
                    className="flex items-center gap-2 p-2.5"
                  >
                    <input
                      value={followUpText}
                      onChange={(e) => setFollowUpText(e.target.value)}
                      placeholder="Type a message..."
                      disabled={!canSend}
                      className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!canSend || followUpText.trim().length === 0}
                      className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </Button>
                  </form>
                </BorderGlow>
              ) : phase === "thinking" || phase === "running" ? (
                <BorderGlow className="no-glow" {...GLOW_PROPS}>
                  <div className="flex items-center gap-2 p-2.5">
                    <div className="h-10 flex-1 rounded-lg bg-transparent px-2 text-sm text-foreground-muted flex items-center">
                      {phase === "thinking" ? thinkingMessage : "Researching locations..."}
                    </div>
                    <button
                      type="button"
                      onClick={handleStop}
                      aria-label="Stop"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised active:scale-95"
                    >
                      <Square className="h-3.5 w-3.5 fill-white text-white" />
                    </button>
                  </div>
                </BorderGlow>
              ) : phase === "stopped" ? (
                <BorderGlow className="no-glow" {...GLOW_PROPS}>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!canSend) return;
                      if (followUpText.trim().length === 0) return;
                      const message = followUpText.trim();
                      setFollowUpText("");
                      const updatedHistory: ConversationTurn[] = [
                        ...history,
                        { role: "user", content: message },
                      ];
                      setTree((prevTree) => {
                        const leafId = getActivePath(prevTree).at(-1)?.id ?? null;
                        return addMessage(prevTree, leafId, "user", message).tree;
                      });
                      if (stoppedDuringRef.current === "research") {
                        dispatchScout(
                          lastScoutArgsRef.current.finalSlots,
                          message,
                          updatedHistory,
                        );
                      } else {
                        askForNextQuestion(updatedHistory, slots);
                      }
                    }}
                    className="flex items-center gap-2 p-2.5"
                  >
                    <input
                      value={followUpText}
                      onChange={(e) => setFollowUpText(e.target.value)}
                      placeholder="Type a message to continue..."
                      disabled={!canSend}
                      className="h-10 flex-1 rounded-full bg-transparent px-3 text-sm text-foreground placeholder-foreground-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={!canSend || followUpText.trim().length === 0}
                      className="h-9 w-9 shrink-0 rounded-full bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center p-0 transition-all duration-200"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </Button>
                  </form>
                </BorderGlow>
              ) : phase === "done" ? (
                <div className="space-y-2">
                  {(() => {
                    const shownLocations =
                      runs.find((r) => r.id === rightPanelRunId)?.packet?.locations ?? [];
                    return shownLocations.length > 0 ? (
                      <BroadSuggestions
                        locations={shownLocations}
                        onPick={(text) => {
                          setAttachedCard({ scope: "all", locations: shownLocations });
                          setFollowUpText(text);
                        }}
                      />
                    ) : null;
                  })()}
                  <BorderGlow className="no-glow" {...GLOW_PROPS}>
                    <form onSubmit={handleFollowUp} className="flex flex-col gap-2 p-2.5">
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
                      </div>
                    </form>
                  </BorderGlow>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Tiny X affordance to close the overflow menu backdrop on
          platforms where the fixed backdrop div above might sit under
          other fixed elements. Not visible; safety net only. */}
      {showOverflowMenu && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setShowOverflowMenu(false)}
          className="sr-only"
        >
          <X className="h-0 w-0" />
        </button>
      )}
    </motion.div>
  );
}