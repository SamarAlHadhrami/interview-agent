import { NextRequest, NextResponse } from "next/server";
import { addEpisode, listSessionEpisodes, searchMemory } from "@/lib/breeth";
import { askGroq } from "@/lib/groq";
import type { Candidate, CurriculumDay } from "@/lib/data";
import {
  buildFeedbackSystemPrompt,
  buildInterviewerSystemPrompt,
  buildTranscriptText,
  deriveState,
  formatCandidateEpisode,
  formatInterviewerEpisode,
  getCurriculumDay,
  normalizeEpisodes,
  parseFeedback,
  questionReferencesOffCurriculum,
  resolveTargetDay,
  shouldExtractIntent,
} from "@/lib/interview";

type InterviewBody = {
  sessionId?: string;
  candidate?: Candidate;
  message?: string;
};

function fallbackQuestion(dayInfo: CurriculumDay | undefined): string {
  if (!dayInfo) {
    return "Can you walk me through how you approached this day's work?";
  }
  const tool = dayInfo.tools[0];
  const objective = dayInfo.objectives[0];
  if (tool && objective) {
    return `For "${dayInfo.title}", how did you use ${tool} when working on: ${objective}?`;
  }
  if (objective) {
    return `Walk me through how you completed this objective: ${objective}`;
  }
  return `What did you actually build or configure for ${dayInfo.title}?`;
}

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

  const endEarly = message === "__END_INTERVIEW__";

  // Early end: skip candidate write + question loop, generate feedback now
  if (endEarly) {
    const transcriptText = buildTranscriptText(state);
    return generateFeedbackResponse(state, transcriptText, sessionId, {
      endedEarly: true,
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
    const targetDay = resolveTargetDay(state, message);
    const dayInfo = getCurriculumDay(targetDay);
    console.log(
      `[interview] targeting Day ${targetDay}${
        dayInfo ? ` (${dayInfo.title})` : ""
      }`
    );

    let question: string;
    try {
      question = await askGroq([
        {
          role: "system",
          content: buildInterviewerSystemPrompt(state, targetDay),
        },
        {
          role: "user",
          content: `Interview transcript so far:\n\n${transcriptText}\n\nAsk the next interview question for Day ${targetDay} now. Use ONLY that day's curriculum tools/objectives.`,
        },
      ]);
      question = question.trim() || fallbackQuestion(dayInfo);

      if (
        dayInfo &&
        questionReferencesOffCurriculum(question, dayInfo)
      ) {
        console.warn(
          `[interview] Day ${targetDay} question off-curriculum, regenerating once:`,
          question
        );
        const regenerated = await askGroq([
          {
            role: "system",
            content: buildInterviewerSystemPrompt(state, targetDay, {
              stricter: true,
            }),
          },
          {
            role: "user",
            content: `Your previous question was rejected because it referenced tools or topics outside Day ${targetDay}'s curriculum materials.

Rejected question:
${question}

Allowed tools:
${dayInfo.tools.map((t) => `- ${t}`).join("\n")}

Allowed objectives:
${dayInfo.objectives.map((o) => `- ${o}`).join("\n")}

Interview transcript so far:
${transcriptText}

Regenerate ONE question that stays strictly inside those tools/objectives.`,
          },
        ]);
        question = regenerated.trim() || question;
      }
    } catch (err) {
      console.error("askGroq(question) failed:", err);
      return NextResponse.json({
        reply: `[Day ${targetDay}] ${fallbackQuestion(dayInfo)}`,
        done: false,
      });
    }

    console.log(`[interview] Day ${targetDay} question:`, question);
    const episodeContent = formatInterviewerEpisode(targetDay, question);

    try {
      await addEpisode(episodeContent, sessionId, false);
    } catch (err) {
      console.error("addEpisode(interviewer question) failed:", err);
    }

    return NextResponse.json({
      reply: `[Day ${targetDay}] ${question}`,
      done: false,
    });
  }

  // 4. Wrap up with structured feedback
  return generateFeedbackResponse(state, transcriptText, sessionId);
}

async function generateFeedbackResponse(
  state: NonNullable<ReturnType<typeof deriveState>>,
  transcriptText: string,
  sessionId: string,
  options?: { endedEarly?: boolean }
) {
  const earlyNote = options?.endedEarly
    ? `\n\nNote: The interview was ended early after ${state.questionsAsked} question(s) covering day(s): ${
        Array.from(state.daysCovered).join(", ") || "none"
      }. Generate fair feedback based only on the transcript gathered so far.`
    : "";

  try {
    const raw = await askGroq(
      [
        { role: "system", content: buildFeedbackSystemPrompt() },
        {
          role: "user",
          content: `Candidate profile:\n${JSON.stringify(state.candidate, null, 2)}\n\nFull transcript:\n${transcriptText}${earlyNote}\n\nReturn the feedback JSON now.`,
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
        summary: options?.endedEarly
          ? "The interview was ended early, but automated feedback generation failed."
          : "The interview reached its coverage goals, but automated feedback generation failed.",
        strengths: [],
        gaps: [],
        next: ["Retry feedback generation or review the transcript manually."],
      },
    });
  }
}
