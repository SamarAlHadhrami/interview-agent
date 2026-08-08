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

const INTERVIEWER_RE =
  /^(?:\[Day\s*\d+\]\s*)?INTERVIEWER\s*\[day=(\d+)\]\s*:\s*([\s\S]*)$/i;

/** Common tech names that models invent; blocked unless on the day's list. */
const EXTERNAL_TECH = [
  "pinecone",
  "matplotlib",
  "seaborn",
  "plotly",
  "tensorflow",
  "pytorch",
  "keras",
  "scikit-learn",
  "sklearn",
  "aws",
  "azure",
  "gcp",
  "sagemaker",
  "redis",
  "mongodb",
  "postgres",
  "postgresql",
  "mysql",
  "spark",
  "hadoop",
  "kafka",
  "airflow",
  "dbt",
  "snowflake",
  "databricks",
  "chroma",
  "chromadb",
  "weaviate",
  "qdrant",
  "milvus",
  "faiss",
  "llamaindex",
  "llama index",
  "openai",
  "anthropic",
  "claude",
  "chatgpt",
  "hugging face",
  "huggingface",
  "numpy",
  "scipy",
  "tableau",
  "power bi",
  "kubernetes",
  "k8s",
  "terraform",
  "ansible",
  "jenkins",
  "graphql",
  "grpc",
  "elasticsearch",
  "opensearch",
  "neo4j",
  "cassandra",
  "dynamodb",
  "bigquery",
  "redshift",
];

export function formatInterviewerEpisode(day: number, question: string): string {
  return `[Day ${day}] INTERVIEWER [day=${day}]: ${question}`;
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

/** Decide which curriculum day this turn's question must target. */
export function resolveTargetDay(
  state: InterviewState,
  latestMessage?: string
): number {
  if (state.questionsAsked === 0) return nextTargetDay(state);

  const current = currentDayFromTranscript(state);
  if (current == null) return nextTargetDay(state);

  if (latestMessage && shouldFollowUpOnDay(latestMessage)) {
    return current;
  }

  return nextTargetDay(state);
}

function shouldFollowUpOnDay(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 80) return true;
  if (
    /\b(i don't know|i do not know|not sure|no idea|unsure|never used|didn't cover|skipped)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  return false;
}

function formatDayMaterials(dayInfo: CurriculumDay): string {
  return `Day number: ${dayInfo.day}
Title: ${dayInfo.title}
Type: ${dayInfo.type}

Tools (verbatim from curriculum.json):
${dayInfo.tools.map((t) => `- ${t}`).join("\n")}

Objectives (verbatim from curriculum.json):
${dayInfo.objectives.map((o) => `- ${o}`).join("\n")}`;
}

export function buildInterviewerSystemPrompt(
  state: InterviewState,
  targetDay: number,
  options?: { stricter?: boolean }
): string {
  const dayInfo = getCurriculumDay(targetDay);
  const materials = dayInfo
    ? formatDayMaterials(dayInfo)
    : `Day number: ${targetDay}\n(No curriculum entry found — ask a general question about the candidate's work on this day number only.)`;

  const stricterBlock = options?.stricter
    ? `
STRICT REGENERATION MODE:
- Your previous question was rejected for mentioning off-curriculum technology or topics.
- Rewrite using ONLY the tools and objectives listed below.
- Do not name any library, product, database, cloud service, or framework that is not explicitly listed under Tools or Objectives.`
    : "";

  return `You are a rigorous but fair technical interviewer for an AI engineering cohort.

Candidate profile:
- Name: ${state.candidate.member.name}
- Role: ${state.candidate.member.jobRole}
- Experience: ${state.candidate.member.yearsExperience} years
- Education: ${state.candidate.member.education}

Questions asked so far: ${state.questionsAsked}
Days covered so far: ${Array.from(state.daysCovered).join(", ") || "none"}
This question MUST target Day ${targetDay} only.

=== CURRICULUM MATERIALS FOR DAY ${targetDay} (ONLY source of topic material) ===
${materials}
=== END CURRICULUM MATERIALS ===
${stricterBlock}

Grounding rules (mandatory):
- Only ask about tools, concepts, or objectives listed above for this day.
- Do not introduce outside technologies (e.g. do not mention Pinecone, Matplotlib, SQL, or any tool not listed) unless it appears in this day's tools/objectives.
- The curriculum block above is the ONLY source of topic material for this question.
- Ask ONE question only. No preamble, no feedback essay, no markdown headings.
- Prefer a practical, scenario-based question tied directly to the listed tools/objectives.
- Keep the question under 400 characters.
- Do not reveal scoring plans or bucket labels.
- Do not ask about other curriculum days.`;
}

function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+.#]+/g, " ").trim();
}

function buildAllowedPhrases(dayInfo: CurriculumDay): Set<string> {
  const allowed = new Set<string>();
  const add = (raw: string) => {
    const n = normalizePhrase(raw);
    if (n) allowed.add(n);
  };

  add(dayInfo.title);
  for (const tool of dayInfo.tools) add(tool);
  for (const obj of dayInfo.objectives) {
    add(obj);
    // also allow meaningful chunks from objectives
    for (const part of obj.split(/[,:;]/)) {
      const n = normalizePhrase(part);
      if (n.length >= 4) allowed.add(n);
    }
  }
  return allowed;
}

function phraseAllowed(phrase: string, allowed: Set<string>): boolean {
  const n = normalizePhrase(phrase);
  if (!n) return true;
  if (allowed.has(n)) return true;
  // Allow when the curriculum text itself mentions this tool/phrase
  for (const a of Array.from(allowed)) {
    if (a.includes(n)) return true;
  }
  return false;
}

/**
 * Returns true if the question appears to reference tools/topics outside
 * this day's curriculum tools + objectives.
 */
export function questionReferencesOffCurriculum(
  question: string,
  dayInfo: CurriculumDay
): boolean {
  const allowed = buildAllowedPhrases(dayInfo);
  const q = normalizePhrase(question);

  // Any tool from another curriculum day that isn't allowed here
  for (const day of curriculum.days) {
    for (const tool of day.tools) {
      const t = normalizePhrase(tool);
      if (t.length < 3) continue;
      if (!q.includes(t)) continue;
      if (!phraseAllowed(tool, allowed)) return true;
    }
  }

  for (const banned of EXTERNAL_TECH) {
    const b = normalizePhrase(banned);
    if (b.length < 3) continue;
    if (!q.includes(b)) continue;
    if (!phraseAllowed(banned, allowed)) return true;
  }

  return false;
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

