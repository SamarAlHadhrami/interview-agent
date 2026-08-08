"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { candidates, type Candidate } from "@/lib/data";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

type ChatRole = "interviewer" | "candidate";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type Feedback = {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
};

type InterviewResponse = {
  reply?: string;
  done?: boolean;
  feedback?: Feedback;
  error?: string;
};

const DAY_TAG_RE = /\[Day\s*(\d+)\]/i;
const ALL_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DAYS_LEFT = ALL_DAYS.slice(0, 15);
const DAYS_RIGHT = ALL_DAYS.slice(15);

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Detect code-like content for monospace rendering. */
function looksLikeCode(content: string): boolean {
  const lines = content.split("\n");
  const indentedLines = lines.filter(
    (line) => /^\s+/.test(line) && line.trim().length > 0
  );
  if (lines.length >= 2 && indentedLines.length >= 1) return true;

  if (/^```/m.test(content)) return true;

  if (
    /^(def |class |function |async function |const |let |var |import |from |export |#include |package |public |private |protected |fn |struct |impl |using |<\?php|#!\/)/m.test(
      content
    )
  ) {
    return true;
  }

  if (
    lines.length >= 2 &&
    lines.filter((line) => /[{};]$/.test(line.trimEnd())).length >= 2
  ) {
    return true;
  }

  return false;
}

function stripDayPrefix(content: string): string {
  return content.replace(/^\[Day\s*\d+\]\s*/i, "").trimStart();
}

/** Parse [Day X] tags from assistant messages. */
function extractDayTag(content: string): number | null {
  const match = content.match(DAY_TAG_RE);
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function deriveAskedDays(messages: ChatMessage[]): {
  askedDays: Set<number>;
  questionsAsked: number;
} {
  const askedDays = new Set<number>();
  let questionsAsked = 0;

  for (const m of messages) {
    if (m.role !== "interviewer") continue;
    const day = extractDayTag(m.content);
    if (day == null) continue;
    askedDays.add(day);
    questionsAsked += 1;
  }

  return { askedDays, questionsAsked };
}

export default function Home() {
  const candidateList = candidates.candidates;
  const [selectedId, setSelectedId] = useState(candidateList[0]?.member.id ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<
    "start" | "send" | "end" | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingMessageRef = useRef("");

  const selectedCandidate =
    candidateList.find((c) => c.member.id === selectedId) ?? candidateList[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, feedback, error]);

  const started = sessionId !== null && messages.length > 0;
  const showComposer = started && !done;
  const { askedDays, questionsAsked } = useMemo(
    () => deriveAskedDays(messages),
    [messages]
  );

  useLayoutEffect(() => {
    if (!showComposer) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingY =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const min = lineHeight * 3 + paddingY;
    const max = lineHeight * 6 + paddingY;
    el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight))}px`;
  }, [input, showComposer]);

  async function postInterview(body: {
    sessionId: string;
    candidate?: Candidate;
    message?: string;
  }): Promise<InterviewResponse> {
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }

    return (await res.json()) as InterviewResponse;
  }

  async function startInterview() {
    if (!selectedCandidate || loading) return;

    const newSessionId = randomSessionId();
    setLoading(true);
    setError(null);
    setRetryAction(null);
    setDone(false);
    setFeedback(null);
    setMessages([]);
    setSessionId(newSessionId);
    setInput("");

    try {
      const data = await postInterview({
        sessionId: newSessionId,
        candidate: selectedCandidate,
      });

      setMessages([
        {
          id: `m-${Date.now()}`,
          role: "interviewer",
          content: data.reply ?? "Welcome — let's begin.",
        },
      ]);
    } catch (err) {
      console.error(err);
      setSessionId(null);
      setError(
        err instanceof Error ? err.message : "Failed to start the interview."
      );
      setRetryAction("start");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(messageOverride?: string) {
    if (!sessionId || loading || done) return;

    // Preserve whitespace/indentation exactly — only reject empty/whitespace-only.
    const text = messageOverride ?? input;
    if (!text.trim()) return;

    pendingMessageRef.current = text;
    setInput("");
    setLoading(true);
    setError(null);
    setRetryAction(null);

    setMessages((prev) => [
      ...prev,
      { id: `c-${Date.now()}`, role: "candidate", content: text },
    ]);

    try {
      const data = await postInterview({ sessionId, message: text });

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `i-${Date.now()}`,
            role: "interviewer",
            content: data.reply!,
          },
        ]);
      }

      if (data.done) {
        setDone(true);
        if (data.feedback) setFeedback(data.feedback);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
      setError(
        err instanceof Error ? err.message : "Failed to send your message."
      );
      setRetryAction("send");
    } finally {
      setLoading(false);
    }
  }

  async function endInterview() {
    if (!sessionId || loading || done || !started) return;

    setLoading(true);
    setError(null);
    setRetryAction(null);

    try {
      const data = await postInterview({
        sessionId,
        message: "__END_INTERVIEW__",
      });

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `i-${Date.now()}`,
            role: "interviewer",
            content: data.reply!,
          },
        ]);
      }

      if (data.done) {
        setDone(true);
        if (data.feedback) setFeedback(data.feedback);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to end the interview."
      );
      setRetryAction("end");
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    if (retryAction === "start") {
      void startInterview();
    } else if (retryAction === "send") {
      void sendMessage(pendingMessageRef.current || input);
    } else if (retryAction === "end") {
      void endInterview();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage();
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div
      className={`${inter.className} min-h-screen bg-[#0A0D10] text-[#E8EDF0] antialiased`}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 border-b border-[#1C232B] pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-[#E8EDF0]">
            Interview Agent
          </h1>
          <p className="mt-1 text-sm font-normal text-[#7A8A94]">
            Pick a candidate and run a live technical interview demo.
          </p>
        </header>

        <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="text-[#7A8A94]">Candidate</span>
            <select
              className="rounded-lg border border-[#1C232B] bg-[#12161B] px-3 py-2.5 text-[#E8EDF0] outline-none focus:border-[#22D3EE] disabled:opacity-50"
              value={selectedCandidate?.member.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading || (started && !done)}
            >
              {candidateList.map((c) => (
                <option key={c.member.id} value={c.member.id}>
                  {c.member.name} — {c.member.jobRole}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <button
              type="button"
              onClick={() => void startInterview()}
              disabled={loading || !selectedCandidate}
              className="rounded-lg bg-[#22D3EE] px-4 py-2.5 text-sm font-semibold text-[#0A0D10] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {started ? "Restart Interview" : "Start Interview"}
            </button>
            {started && !done && (
              <button
                type="button"
                onClick={() => void endInterview()}
                disabled={loading}
                className="rounded-lg border border-[#F59E0B]/50 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                End Interview
              </button>
            )}
          </div>
        </section>

        {sessionId && (
          <p
            className={`${jetbrainsMono.className} mb-4 text-xs text-[#7A8A94]`}
          >
            session: {sessionId}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          {/* Day Rail — horizontal on mobile, sticky sidebar on desktop */}
          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[280px]">
            <div className="rounded-xl border border-[#1C232B] bg-[#12161B] p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-[#E8EDF0]">
                  {selectedCandidate?.member.name ?? "Candidate"}
                </h2>
                <p className="mt-0.5 text-xs text-[#7A8A94]">
                  {selectedCandidate?.member.jobRole ?? "—"}
                </p>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#7A8A94]">
                  Day Rail
                </span>
                <span
                  className={`${jetbrainsMono.className} text-xs text-[#22D3EE]`}
                >
                  {Math.min(questionsAsked, 8)}/8 questions
                </span>
              </div>

              {/* Two columns: 1–15 | 16–31, no scroll */}
              <div className="grid grid-cols-2 gap-x-4">
                <DayRailColumn days={DAYS_LEFT} askedDays={askedDays} />
                <DayRailColumn days={DAYS_RIGHT} askedDays={askedDays} />
              </div>
            </div>
          </aside>

          {/* Chat column */}
          <div className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl border border-[#1C232B] bg-[#12161B]">
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {!started && !loading && !error && (
                <p className="py-12 text-center text-sm text-[#7A8A94]">
                  Select a candidate and click Start Interview to begin.
                </p>
              )}

              {messages.map((m) => {
                const day = extractDayTag(m.content);
                const displayContent =
                  m.role === "interviewer" ? stripDayPrefix(m.content) : m.content;
                const codeLike = looksLikeCode(displayContent);

                return (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.role === "candidate" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                        m.role === "candidate"
                          ? "rounded-br-md border border-[#0E7A8C]/40 bg-[#0E7A8C]/25 text-[#E8EDF0]"
                          : "rounded-bl-md bg-[#1A1F26] text-[#E8EDF0]"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7A8A94]">
                          {m.role === "candidate" ? "You" : "Interviewer"}
                        </p>
                        {day != null && (
                          <span
                            className={`${jetbrainsMono.className} rounded bg-[#0E7A8C]/30 px-1.5 py-0.5 text-[10px] text-[#22D3EE]`}
                          >
                            Day {day}
                          </span>
                        )}
                      </div>
                      <p
                        className={`whitespace-pre-wrap break-words ${
                          codeLike
                            ? `${jetbrainsMono.className} text-xs leading-5 text-[#C8D4DA]`
                            : "text-sm font-normal"
                        }`}
                      >
                        {displayContent}
                      </p>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[#1A1F26] px-3.5 py-2.5 text-sm text-[#7A8A94]">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#22D3EE] [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#22D3EE] [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#22D3EE]" />
                    </span>
                    Thinking…
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-3 text-sm text-red-200">
                  <p className="font-semibold">Something went wrong</p>
                  <p className="mt-1 text-red-300/90">{error}</p>
                  {retryAction && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={loading}
                      className="mt-3 rounded-md bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {done && feedback && (
                <div className="mt-2 rounded-xl border border-[#1C232B] border-l-4 border-l-[#22D3EE] bg-[#0A0D10] p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#22D3EE]">
                    Interview feedback
                  </h2>
                  <p className="mt-3 text-sm font-normal leading-relaxed text-[#E8EDF0]">
                    {feedback.summary}
                  </p>

                  <FeedbackList
                    label="Strengths"
                    items={feedback.strengths}
                    tone="strength"
                  />
                  <FeedbackList
                    label="Gaps"
                    items={feedback.gaps}
                    tone="gap"
                  />
                  <FeedbackList
                    label="Next"
                    items={feedback.next}
                    tone="next"
                  />
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {showComposer && (
              <form
                onSubmit={onSubmit}
                className="flex items-end gap-2 border-t border-[#1C232B] p-3 sm:p-4"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Type your answer… (Shift+Enter for newline)"
                  disabled={loading}
                  rows={3}
                  wrap="soft"
                  spellCheck={true}
                  className="max-h-[9.5rem] min-h-[4.5rem] flex-1 resize-none overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#1C232B] bg-[#0A0D10] px-3 py-2.5 text-sm leading-5 text-[#E8EDF0] outline-none placeholder:text-[#7A8A94]/70 focus:border-[#22D3EE] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-[#22D3EE] px-4 py-2.5 text-sm font-semibold text-[#0A0D10] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayRailColumn({
  days,
  askedDays,
}: {
  days: number[];
  askedDays: Set<number>;
}) {
  return (
    <ul className="space-y-1">
      {days.map((day) => {
        const active = askedDays.has(day);
        return (
          <li key={day} className="flex items-center gap-2 py-0.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                active ? "bg-[#22D3EE]" : "bg-[#2A3440]"
              }`}
            />
            <span
              className={`${jetbrainsMono.className} text-[11px] ${
                active ? "font-medium text-[#22D3EE]" : "text-[#3D4A55]"
              }`}
            >
              {day}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FeedbackList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "strength" | "gap" | "next";
}) {
  const toneClass =
    tone === "strength"
      ? "text-[#34D399]"
      : tone === "gap"
        ? "text-[#F59E0B]"
        : "text-[#7A8A94]";

  const bulletClass =
    tone === "strength"
      ? "marker:text-[#34D399]"
      : tone === "gap"
        ? "marker:text-[#F59E0B]"
        : "marker:text-[#7A8A94]";

  return (
    <div className="mt-4 border-t border-[#1C232B] pt-3">
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${toneClass}`}
      >
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[#7A8A94]">None noted.</p>
      ) : (
        <ul
          className={`mt-1.5 list-disc space-y-1 pl-5 text-sm text-[#E8EDF0] ${bulletClass}`}
        >
          {items.map((item, i) => (
            <li key={`${label}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
