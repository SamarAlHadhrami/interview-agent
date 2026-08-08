"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { candidates, type Candidate } from "@/lib/data";

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

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const [retryAction, setRetryAction] = useState<"start" | "send" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef("");

  const selectedCandidate =
    candidateList.find((c) => c.member.id === selectedId) ?? candidateList[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, feedback, error]);

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

    const text = (messageOverride ?? input).trim();
    if (!text) return;

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

  function handleRetry() {
    if (retryAction === "start") {
      void startInterview();
    } else if (retryAction === "send") {
      void sendMessage(pendingMessageRef.current || input);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage();
  }

  const started = sessionId !== null && messages.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-6 border-b border-zinc-800 pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Interview Agent
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pick a candidate and run a live technical interview demo.
          </p>
        </header>

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="text-zinc-400">Candidate</span>
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
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

          <button
            type="button"
            onClick={() => void startInterview()}
            disabled={loading || !selectedCandidate}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {started ? "Restart Interview" : "Start Interview"}
          </button>
        </section>

        {sessionId && (
          <p className="mb-3 font-mono text-xs text-zinc-500">
            session: {sessionId}
          </p>
        )}

        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            {!started && !loading && !error && (
              <p className="py-12 text-center text-sm text-zinc-500">
                Select a candidate and click Start Interview to begin.
              </p>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "candidate" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "candidate"
                      ? "rounded-br-md bg-emerald-700 text-white"
                      : "rounded-bl-md bg-zinc-800 text-zinc-100"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">
                    {m.role === "candidate" ? "You" : "Interviewer"}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-300">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                  </span>
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-3 text-sm text-red-200">
                <p className="font-medium">Something went wrong</p>
                <p className="mt-1 text-red-300/90">{error}</p>
                {retryAction && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={loading}
                    className="mt-3 rounded-md bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {done && feedback && (
              <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950/80 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                  Interview feedback
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-200">
                  {feedback.summary}
                </p>

                <FeedbackList label="Strengths" items={feedback.strengths} />
                <FeedbackList label="Gaps" items={feedback.gaps} />
                <FeedbackList label="Next" items={feedback.next} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {started && !done && (
            <form
              onSubmit={onSubmit}
              className="flex gap-2 border-t border-zinc-800 p-3 sm:p-4"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your answer…"
                disabled={loading}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackList({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">None noted.</p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-zinc-200">
          {items.map((item, i) => (
            <li key={`${label}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
