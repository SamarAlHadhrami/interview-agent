import type { Candidate, CurriculumDay, Mission } from "@/lib/data";
import { candidates, curriculum } from "@/lib/data";
import type { MemoryEdge, SessionEpisode } from "@/lib/breeth";

export type TranscriptEpisode = {
  content: string;
  created_at: string;
};

export type InterviewFeedback = {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
};

export type InterviewState = {
  candidate: Candidate;
  transcript: TranscriptEpisode[];
  questionsAsked: number;
  daysCovered: Set<number>;
  plannedDays: number[];
  memoryFacts: string[];
};

const INTERVIEWER_RE = /^INTERVIEWER\s*\[day=(\d+)\]\s*:\s*([\s\S]*)$/i;

export function formatInterviewerEpisode(day: number, question: string): string {
  return `INTERVIEWER [day=${day}]: ${question}`;
}

export function formatCandidateEpisode(
  candidateName: string,
  message: string
): string {
  return `CANDIDATE ${candidateName}: ${message}`;
}

export function isStrongMission(m: Mission): boolean {
  return Boolean(m.passed) && !m.skipped && (m.attempts ?? 99) <= 2;
}

export function isWeakMission(m: Mission): boolean {
  if (m.skipped) return true;
  if (m.passed && (m.attempts ?? 0) >= 3) return true;
  if (m.passed === false) return true;
  return false;
}

/** Pick >= 4 days, weighted toward weak, with 1–2 strong. */
export function selectInterviewDays(candidate: Candidate): number[] {
  const strong: number[] = [];
  const weak: number[] = [];

  for (const m of candidate.missions) {
    if (isWeakMission(m)) weak.push(m.day);
    else if (isStrongMission(m)) strong.push(m.day);
  }

  const strongPick = strong.slice(0, Math.min(2, strong.length || 0));
  const remainingSlots = Math.max(4 - strongPick.length, 2);
  const weakPick = weak.slice(0, Math.max(remainingSlots, Math.min(weak.length, 5)));

  const selected: number[] = [];
  for (const d of [...weakPick, ...strongPick]) {
    if (!selected.includes(d)) selected.push(d);
  }

  if (selected.length < 4) {
    for (const d of [...weak, ...strong]) {
      if (!selected.includes(d)) selected.push(d);
      if (selected.length >= 4) break;
    }
  }

  return selected;
}

export function getCurriculumDay(day: number): CurriculumDay | undefined {
  return curriculum.days.find((d) => d.day === day);
}

export function lookupCandidateById(id: string): Candidate | undefined {
  return candidates.candidates.find((c) => c.member.id === id);
}

function extractCandidateId(content: string): string | null {
  const match = content.match(/"id"\s*:\s*"(CAND-[^"]+)"/);
  return match?.[1] ?? null;
}

function parseCandidate(content: string): Candidate | null {
  try {
    const parsed = JSON.parse(content) as Candidate;
    if (parsed?.member?.id && parsed?.member?.name) return parsed;
  } catch {
    // truncated JSON — fall through to id lookup
  }
  const id = extractCandidateId(content);
  if (id) return lookupCandidateById(id) ?? null;
  return null;
}

export function normalizeEpisodes(
  edges: MemoryEdge[],
  graphEpisodes: SessionEpisode[]
): TranscriptEpisode[] {
  if (graphEpisodes.length > 0) {
    return graphEpisodes
      .map((ep) => ({
        content: String(ep.content_excerpt ?? ep.content ?? "").trim(),
        created_at: String(ep.valid_at ?? ep.created_at ?? ""),
      }))
      .filter((ep) => ep.content)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return edges
    .map((edge, i) => ({
      content: String(edge.content ?? edge.fact ?? "").trim(),
      created_at: String(
        edge.created_at ?? edge.valid_at ?? String(i).padStart(6, "0")
      ),
    }))
    .filter((ep) => ep.content)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function deriveState(
  episodes: TranscriptEpisode[],
  memoryFacts: string[]
): InterviewState | null {
  if (episodes.length === 0) return null;

  const candidate = parseCandidate(episodes[0].content);
  if (!candidate) return null;

  const transcript = episodes.slice(1);
  const daysCovered = new Set<number>();
  let questionsAsked = 0;

  for (const ep of transcript) {
    const match = ep.content.match(INTERVIEWER_RE);
    if (match) {
      questionsAsked += 1;
      daysCovered.add(Number(match[1]));
    }
  }

  return {
    candidate,
    transcript,
    questionsAsked,
    daysCovered,
    plannedDays: selectInterviewDays(candidate),
    memoryFacts,
  };
}

export function nextTargetDay(state: InterviewState): number {
  const uncovered = state.plannedDays.filter((d) => !state.daysCovered.has(d));
  if (uncovered.length > 0) return uncovered[0];

  const last = Array.from(state.daysCovered).pop();
  if (last != null) return last;

  return state.plannedDays[0] ?? state.candidate.missions[0]?.day ?? 1;
}

export function currentDayFromTranscript(state: InterviewState): number | null {
  for (let i = state.transcript.length - 1; i >= 0; i--) {
    const match = state.transcript[i].content.match(INTERVIEWER_RE);
    if (match) return Number(match[1]);
  }
  return null;
}

export function shouldExtractIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length < 40) return true;
  if (
    /\b(i don't know|i do not know|not sure|no idea|unsure|never used|didn't cover|skipped)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (trimmed.length >= 120) return true;
  return false;
}

export function buildTranscriptText(
  state: InterviewState,
  latestMessage?: string
): string {
  const lines: string[] = [];
  for (const ep of state.transcript) {
    lines.push(ep.content);
  }
  if (latestMessage) {
    lines.push(
      formatCandidateEpisode(state.candidate.member.name, latestMessage)
    );
  }
  return lines.join("\n\n");
}

export function buildInterviewerSystemPrompt(state: InterviewState): string {
  const day = currentDayFromTranscript(state) ?? nextTargetDay(state);
  const targetDay =
    state.questionsAsked === 0 ? nextTargetDay(state) : day;
  const nextDay = nextTargetDay(state);
  const dayInfo = getCurriculumDay(targetDay);
  const nextInfo = getCurriculumDay(nextDay);

  const dayBlock = dayInfo
    ? `Current/target day ${dayInfo.day}: ${dayInfo.title}
Type: ${dayInfo.type}
Tools: ${dayInfo.tools.join(", ")}
Objectives:\n- ${dayInfo.objectives.join("\n- ")}`
    : `Target day: ${targetDay}`;

  const nextBlock =
    nextInfo && nextInfo.day !== dayInfo?.day
      ? `Next planned day ${nextInfo.day}: ${nextInfo.title} (tools: ${nextInfo.tools.join(", ")})`
      : "";

  const plan = state.plannedDays
    .map((d) => {
      const info = getCurriculumDay(d);
      const bucket = state.candidate.missions.find((m) => m.day === d);
      const label = isWeakMission(bucket ?? { day: d, title: "" })
        ? "weak"
        : "strong";
      return `Day ${d}${info ? ` (${info.title})` : ""} [${label}]`;
    })
    .join(", ");

  return `You are a rigorous but fair technical interviewer for an AI engineering cohort.

Candidate profile:
- Name: ${state.candidate.member.name}
- Role: ${state.candidate.member.jobRole}
- Experience: ${state.candidate.member.yearsExperience} years
- Education: ${state.candidate.member.education}
- Signals: ${JSON.stringify(state.candidate.signals)}

Interview plan (cover these days; prefer probing weak days): ${plan}
Questions asked so far: ${state.questionsAsked}
Days covered so far: ${Array.from(state.daysCovered).join(", ") || "none"}

${dayBlock}
${nextBlock}

Memory facts from this session:
${state.memoryFacts.length ? state.memoryFacts.map((f) => `- ${f}`).join("\n") : "- (none yet)"}

Instructions:
- Ask ONE question only. No preamble, no feedback essay, no markdown headings.
- If the candidate's latest answer is incomplete, shallow, or interesting, ask an intelligent follow-up on the SAME day.
- Otherwise move to the next planned day that still needs coverage.
- Prefer practical, scenario-based questions tied to the day's tools/objectives.
- Keep the question under 400 characters.
- Do not reveal the scoring plan or bucket labels.`;
}

export function buildFeedbackSystemPrompt(): string {
  return `You are evaluating a technical interview for an AI engineering cohort.
Given the candidate profile and full transcript, respond with ONLY valid JSON matching this schema:
{
  "summary": string,
  "strengths": string[],
  "gaps": string[],
  "next": string[]
}
No markdown, no commentary outside the JSON object.`;
}

export function parseFeedback(raw: string): InterviewFeedback {
  try {
    const parsed = JSON.parse(raw) as InterviewFeedback;
    return {
      summary: String(parsed.summary ?? ""),
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map(String)
        : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
      next: Array.isArray(parsed.next) ? parsed.next.map(String) : [],
    };
  } catch {
    return {
      summary: raw.slice(0, 500) || "Interview completed.",
      strengths: [],
      gaps: [],
      next: [],
    };
  }
}

/** Best-effort day tag for a newly generated question. */
export function inferDayForQuestion(
  state: InterviewState,
  question: string
): number {
  const dayMention = question.match(/\bday\s*(\d+)\b/i);
  if (dayMention) return Number(dayMention[1]);

  for (const d of state.plannedDays) {
    const info = getCurriculumDay(d);
    if (!info) continue;
    if (
      question.toLowerCase().includes(info.title.toLowerCase().slice(0, 18))
    ) {
      return d;
    }
  }

  if (state.questionsAsked === 0) return nextTargetDay(state);

  const current = currentDayFromTranscript(state);
  // If we still need new days, prefer next uncovered; else stay on current
  const uncovered = state.plannedDays.filter((d) => !state.daysCovered.has(d));
  if (uncovered.length > 0 && state.daysCovered.size < 4) {
    return uncovered[0];
  }
  return current ?? nextTargetDay(state);
}
