import { NextRequest, NextResponse } from "next/server";
import { addEpisode, listSessionEpisodes, searchMemory } from "@/lib/breeth";
import { askGroq } from "@/lib/groq";
import type { Candidate } from "@/lib/data";
import {
  buildFeedbackSystemPrompt,
  buildInterviewerSystemPrompt,
  buildTranscriptText,
  deriveState,
  formatCandidateEpisode,
  formatInterviewerEpisode,
  inferDayForQuestion,
  normalizeEpisodes,
  parseFeedback,
  shouldExtractIntent,
} from "@/lib/interview";

type InterviewBody = {
  sessionId?: string;
  candidate?: Candidate;
  message?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InterviewBody;

    if (body.candidate && !body.message) {
      return handleSessionStart(body);
    }

    if (body.message) {
      return handleMessageTurn(body);
    }

    return NextResponse.json(
      { error: "Request must include candidate or message" },
      { status: 400 }
    );
  } catch (err) {
    console.error("interview route error:", err);
    return NextResponse.json(
      {
        reply:
          "Sorry, something went wrong on our side. Please try that again.",
        done: false,
      },
      { status: 200 }
    );
  }
}

async function handleSessionStart(body: InterviewBody) {
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  try {
    await addEpisode(JSON.stringify(body.candidate), sessionId, false);
  } catch (err) {
    console.error("session start addEpisode failed:", err);
  }

  return NextResponse.json({
    reply: `Welcome ${body.candidate!.member.name}, let's begin your technical interview.`,
    done: false,
  });
}

async function handleMessageTurn(body: InterviewBody) {
  const sessionId = body.sessionId;
  const message = body.message!.trim();

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  // 1. Reconstruct transcript + state
  let edges: Awaited<ReturnType<typeof searchMemory>> = [];
  let graphEpisodes: Awaited<ReturnType<typeof listSessionEpisodes>> = [];

  try {
    edges = await searchMemory("interview transcript", sessionId, 50);
  } catch (err) {
    console.error("searchMemory failed:", err);
  }

  try {
    graphEpisodes = await listSessionEpisodes(sessionId);
  } catch (err) {
    console.error("listSessionEpisodes failed:", err);
  }

  const episodes = normalizeEpisodes(edges, graphEpisodes);
  const memoryFacts = edges
    .map((e) => e.fact ?? e.content)
    .filter((f): f is string => Boolean(f));

  let state = deriveState(episodes, memoryFacts);

  // Fallback: client may resend candidate if memory is still warming up
  if (!state && body.candidate) {
    state = deriveState(
      [
        {
          content: JSON.stringify(body.candidate),
          created_at: "0",
        },
        ...episodes,
      ],
      memoryFacts
    );
  }

  if (!state) {
    return NextResponse.json({
      reply:
        "I couldn't load this interview session yet. Please restart the session.",
      done: false,
    });
  }

  // 2. Persist the candidate's latest message
  try {
    await addEpisode(
      formatCandidateEpisode(state.candidate.member.name, message),
      sessionId,
      shouldExtractIntent(message)
    );
  } catch (err) {
    console.error("addEpisode(candidate message) failed:", err);
  }

  const transcriptText = buildTranscriptText(state, message);
  const shouldContinue =
    state.questionsAsked < 8 || state.daysCovered.size < 4;

  // 3. Ask next question
  if (shouldContinue) {
    let question: string;
    try {
      question = await askGroq([
        { role: "system", content: buildInterviewerSystemPrompt(state) },
        {
          role: "user",
          content: `Interview transcript so far:\n\n${transcriptText}\n\nAsk the next interview question now.`,
        },
      ]);
      question = question.trim() || "Could you walk me through your approach?";
    } catch (err) {
      console.error("askGroq(question) failed:", err);
      return NextResponse.json({
        reply:
          "Thanks — let's continue. Can you elaborate on your most recent answer with a concrete example?",
        done: false,
      });
    }

    const day = inferDayForQuestion(state, question);
    const episodeContent = formatInterviewerEpisode(day, question);

    try {
      await addEpisode(episodeContent, sessionId, false);
    } catch (err) {
      console.error("addEpisode(interviewer question) failed:", err);
    }

    return NextResponse.json({ reply: question, done: false });
  }

  // 4. Wrap up with structured feedback
  try {
    const raw = await askGroq(
      [
        { role: "system", content: buildFeedbackSystemPrompt() },
        {
          role: "user",
          content: `Candidate profile:\n${JSON.stringify(state.candidate, null, 2)}\n\nFull transcript:\n${transcriptText}\n\nReturn the feedback JSON now.`,
        },
      ],
      true
    );

    const feedback = parseFeedback(raw);

    try {
      await addEpisode(
        `FEEDBACK: ${JSON.stringify(feedback)}`,
        sessionId,
        true
      );
    } catch (err) {
      console.error("addEpisode(feedback) failed:", err);
    }

    return NextResponse.json({
      reply: "Interview completed.",
      done: true,
      feedback,
    });
  } catch (err) {
    console.error("askGroq(feedback) failed:", err);
    return NextResponse.json({
      reply: "Interview completed.",
      done: true,
      feedback: {
        summary:
          "The interview reached its coverage goals, but automated feedback generation failed.",
        strengths: [],
        gaps: [],
        next: ["Retry feedback generation or review the transcript manually."],
      },
    });
  }
}
