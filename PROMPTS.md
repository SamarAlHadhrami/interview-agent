# AI Usage Log — Interview Agent (ABTalks ViCodathon)

Two tools used: Claude (planning, decisions, writing the prompts fed into 
Cursor, reviewing test results) and Cursor's own chat (code generation).

---
=====August 8th  2026=====

## ~08:45 AM — Getting started

**What I told Claude:** "I have taken part in this online hackathon, can 
you help me." Shared screenshots of my ABTalks dashboard — solo entry, 
kickoff time, submission checklist, Breeth Pro perk.

**Outcome:** Claude explained what to prep before the problem statement 
dropped — claim Breeth, set up a repo, get a deploy account ready, start a 
PROMPTS.md — and asked what stack I wanted to use.

---

## ~09:15 AM — Tooling decisions

**What I told Claude:** I don't have a Claude Pro plan, only a ChatGPT Go 
plan — asked what I should actually use to build, Codex or something else.

**Outcome:** Claude recommended Cursor's free tier as the main driver 
(since it supports MCP, which Breeth plugs into directly), with Codex/ChatGPT 
as backup once Cursor's free limit runs out.

---

## ~10:30 AM — Breeth docs

**What I told Claude:** Shared the Breeth docs link and asked it to read 
through everything, including connected pages.

**Outcome:** Claude read the docs and gave me the real API shape (episodes/
search endpoints, intent extraction), corrected an earlier wrong guess about 
the base URL, and gave me exact MCP config steps for Cursor.

---

## ~11:00 AM — Full problem statement + rules

**What I told Claude:** Uploaded the ViCodathon Participant Q&A PDF with all 
3 problem statements and the full rules/evaluation process, and asked Claude 
to go through everything and not miss anything, since I hadn't started 
building yet.

**Outcome:** Claude summarized the 4-stage judging process and the 3 
problem statement options, and asked which one I wanted to build.

---

## ~11:15 AM — Choosing the problem statement

**What I told Claude:** Said I wasn't sure, asked Claude to decide for me.

**Outcome:** Claude recommended Problem #2, The Interview Agent, citing my 
background with an AI hiring and career-optimization platform FYP and a CV-
screening FYP, and that it was the strongest genuine fit for Breeth's 
sponsor track.

---

## ~11:30 AM — Provided project files

**What I told Claude:** Uploaded candidates.json, curriculum.json, and 
technical-spec.md from the hackathon's submission page.

**Outcome:** Claude reviewed all three, identified that the API is 
stateless but must hold conversation state, and proposed using Breeth as 
the session store. We agreed on the architecture: Next.js 14 + TypeScript, 
Groq for interview LLM calls, Breeth for session memory.

---

## ~11:47 AM — GitHub + repo setup

**What I did:** Created the public GitHub repo, set up the project folder 
in Cursor, connected Git, fixed a few issues along the way with Claude's 
guidance until the first clean commit was pushed.

**What I told Claude:** Told Claude the repo was created and pushed, ready 
for the first real build prompt.

**Claude's response:** Gave me Prompt 1, the project scaffold prompt.

---

## Cursor Prompt 1 — 12:33 PM

**What I did:** Pasted this into Cursor's chat:

"Set up a Next.js 14 App Router project with TypeScript and Tailwind. Create 
/lib/groq.ts: a function askGroq(messages, jsonMode?) that calls Groq's chat 
completions API (model llama-3.3-70b-versatile) and returns the response 
text, with an optional JSON-mode flag. Create /lib/breeth.ts: addEpisode and 
searchMemory functions against TheBreeth API. Load curriculum.json and 
candidates.json as typed modules. Create app/api/interview/route.ts with a 
POST handler: if the body has a candidate field (session start), store it 
in Breeth under group_id = sessionId and return a welcome reply; if it has 
message, return a placeholder for now."

**Outcome (from Cursor):** Scaffolded Next.js 14 + TypeScript + Tailwind, 
lib/groq.ts, lib/breeth.ts, lib/data.ts, and app/api/interview/route.ts 
with session-start logic.

**What I told Claude (~12:40 PM):** "Done" — pasted Cursor's summary.

**Claude's response:** Gave me a local test — run the dev server, then test 
with:
`Invoke-RestMethod -Uri "http://localhost:3000/api/interview" -Method POST -ContentType "application/json" -Body '{"sessionId":"test1","candidate":{"member":{"name":"Test"}}}'`
I ran it and got a correct welcome reply back.

**What I told Claude:** Test Done. Please give second prompt.

**Claude's response:** Gave me Prompt 2.
---

## Cursor Prompt 2 — 12:46 PM

**What I did:** Pasted this into Cursor's chat:

"Implement the full conversation logic in app/api/interview/route.ts. On 
every message-turn, reconstruct the session (candidate profile + transcript 
so far) via Breeth searchMemory, sorted chronologically. Track 
questionsAsked and distinct daysCovered from the transcript. On the first 
real question, select target days from the candidate's missions — weighted 
toward weak days (attempts >= 3 or skipped), with 1-2 strong days mixed in, 
covering >= 4 distinct days. Each turn: write the candidate's answer as a 
Breeth episode (extract_intent true if it reveals clear understanding or a 
clear gap), then either ask a follow-up or move to the next planned day via 
Groq, until >= 8 questions and >= 4 days are covered — then generate 
structured JSON feedback ({summary, strengths, gaps, next}) and return 
done: true."

**Outcome (from Cursor):** Message-turn logic wired end-to-end, with 
lib/interview.ts added for question selection/state, and 
listSessionEpisodes added to lib/breeth.ts for transcript rebuild.

**What I told Claude:** Reported done, pasted Cursor's summary.

**Claude's response:** Gave me a test with a real candidate, since the first 
attempt used a fake candidate with no mission data and produced generic 
questions. Had me test with Emily Chen (CAND-003) instead:
`$body = @{ sessionId = "test-real-1"; candidate = (Get-Content data/candidates.json | ConvertFrom-Json).candidates[2] } | ConvertTo-Json -Depth 10`
followed by a message-turn call. That test correctly produced a curriculum-
grounded question (embeddings/vector search). Continuing further turns to 
reach completion.

**What I told Claude:** Test Done. Please give third prompt.

**Claude's response:** Gave me Prompt 3.

---

## Cursor Prompt 3 — 14:06 PM

**What I did:** Pasted prompt 3 into Cursor's chat:

"Build a simple chat interface in app/page.tsx for testing/demoing the interview agent.

Requirements:
- A dropdown to pick one of the candidates from data/candidates.json (show name + jobRole)
- A "Start Interview" button that generates a random sessionId, POSTs 
  { sessionId, candidate } to /api/interview, and shows the welcome reply
- A chat-style message list (candidate's answers right-aligned, interviewer's 
  questions left-aligned), styled with Tailwind, dark theme
- A text input + send button once the interview has started: POSTs 
  { sessionId, message } to /api/interview, appends both the sent message and 
  the reply to the chat
- When a response comes back with done: true, stop showing the input, and 
  instead render the feedback object clearly: summary as a paragraph, 
  strengths/gaps/next each as a labeled bullet list
- Show a loading indicator while waiting for a response (since Groq calls 
  take a few seconds)
- Basic error handling: if a fetch fails, show a retry-able error message 
  instead of crashing

Keep it a single client component, no extra libraries needed."

**Outcome (from Cursor):** Built a working chat interface in app/page.tsx — 
candidate selector, session start, message flow, structured feedback display.

**What I told Claude (14:18 PM):** Shared screenshots of a full interview run 
in the browser (Emily Chen, complete flow through to feedback).

**Claude's response:** Full flow confirmed working end-to-end, but flagged 
that the interview questions looked off-curriculum (e.g. Pinecone, Matplotlib, 
healthcare SQL) compared to Emily's mission list, and gave Prompt 4 to 
tighten curriculum grounding.

---

## Cursor Prompt 4 — 14:28 PM

**What I did:** Pasted prompt 4 into Cursor's chat:

"The interview questions are not grounded in curriculum.json — they're generic 
ML trivia (Pinecone, Matplotlib, healthcare SQL) instead of matching the actual 
day objectives/tools for the selected candidate.

Fix the prompt construction in lib/interview.ts / route.ts:
- For the CURRENT target day, explicitly pull that day's title, objectives, and 
  tools array from curriculum.json and inject them verbatim into the system 
  prompt as the ONLY source of topic material for that question
- Instruct the model explicitly: "Only ask about tools, concepts, or objectives 
  listed below for this day. Do not introduce outside technologies (e.g. do not 
  mention Pinecone, Matplotlib, SQL, or any tool not listed) unless it appears 
  in this day's tools/objectives."
- Log which day number each question targets (add this to what gets written to 
  Breeth, e.g. prefix the episode content with "[Day X]") so it's verifiable 
  during testing
- After generating each question, do a quick check: does the question text 
  reference something not in that day's tools/objectives list? If so, regenerate 
  once with a stricter reminder.

Keep everything else (state tracking, feedback generation, Breeth writes) as is."

**Outcome (from Cursor):** Added day-tagging (`[Day X]`) to generated 
questions and a validation/regeneration step for grounding.

**What I told Claude:** Shared a second test run with the day-tagging live, 
and pasted the actual curriculum.json content when asked to verify.

**Claude's response (15:25 PM):** On reviewing the real curriculum.json, 
confirmed the original questions were already correctly grounded — the 
course is specifically a healthcare RAG chatbot build, so Pinecone, 
ChromaDB, SQLite, and Matplotlib are genuinely listed as that day's tools, 
not off-topic. Corrected the earlier flag as a false alarm, but kept 
Prompt 4's day-tagging since it makes grounding independently verifiable 
going forward. Confirmed ready to commit and move to deployment.

---

## ~16:00 PM — Pre-finalization check

**What I asked Claude:** What else needs to be tested before we consider 
the core logic finished.

**Claude's response:** Suggested testing a "weak" candidate profile (heavy 
skips/high attempts) in addition to the strong one already tested, to 
verify the day-weighting logic actually adapts to a struggling candidate, 
not just a strong one.

---

## ~16:10 PM — Weak profile test review

**What I did:** Ran a full interview with David Miller (7 of 10 missions 
weak/skipped) and shared screenshots of the complete flow with Claude.

**Claude's response:** Confirmed it was a strong result — 8 questions 
across 6 distinct curriculum days, correct skip-handling, and feedback that 
accurately reflected the weaker performance. Confirmed no further changes 
needed to the core interview logic.

---

## Cursor Prompt 5 — 16:56 PM

**What I told Claude (~16:49 PM):** Noticed that typing or pasting code/
answers into the chat input collapsed everything onto one line — pasted 
code lost all its line breaks and indentation. Asked for this to be fixed.

**Claude's response:** It gave me prompt 5

**What I did:** Pasted Claude's fix prompt 5 into Cursor's chat — replacing 
the single-line input with a growable textarea, and preserving whitespace/
line breaks in both the input and the rendered messages.

Prompt:

"Fix text input and message rendering in app/page.tsx to properly preserve 
formatting for pasted code and multi-line answers.

1. Replace the single-line <input> with a <textarea> (auto-growing height, 
   3-6 rows, Enter submits / Shift+Enter for newline — standard chat 
   behavior). Make sure paste events keep all whitespace, newlines, and 
   indentation exactly as pasted — don't trim or collapse them.

2. When rendering each message bubble (both interviewer and candidate), 
   preserve whitespace and line breaks exactly as stored — apply 
   white-space: pre-wrap (or the Tailwind whitespace-pre-wrap class) so 
   multi-line text and indentation display correctly instead of collapsing 
   into one paragraph.

3. If a message looks like a code block (e.g. contains multiple lines with 
   leading whitespace, or starts with common code patterns), render it in 
   the monospace font at a slightly smaller size for readability — otherwise 
   render as normal body text.

Don't change any API/backend logic — this is a frontend rendering fix only."

**Outcome (from Cursor):** Input now preserves formatting; pasted code 
keeps its indentation and line breaks in both the textarea and the chat 
bubbles.

**What I told Claude (16:58 PM):** Confirmed the fix worked, then asked 
about visual design — whether to mirror ABTalks' own site style or design 
something more original that still fulfills the brief and doesn't blend in.

**Claude's response:** Recommended against mirroring ABTalks' branding, 
proposed a distinct direction instead — a "Day Rail" showing curriculum-day 
coverage as the signature visual element, a cyan/charcoal palette, and 
Inter + monospace typography — and wrote Prompt 6 for it.

---

## Cursor Prompt 6 — 17:02 PM

**What I did:** Pasted the design-pass prompt 6 into Cursor's chat — new 
color palette, typography, two-column layout with a Day Rail sidebar 
tracking which curriculum days have been covered, and a restyled feedback 
card.

Prompt:

"Redesign the visual styling of app/page.tsx only — do not touch any API logic 
or backend files.

New palette: background #0A0D10, panel #12161B, text #E8EDF0, muted text 
#7A8A94, accent #22D3EE, accent-dim #0E7A8C, success/strength #34D399, 
warning/gap #F59E0B.

Typography: import Inter for body/UI text, and JetBrains Mono (via Google 
Fonts) for the session ID, day tags, and any text that looks like code. Use 
Inter at font-weight 600 for headings, 400 for body.

Layout: two-column on desktop (lg breakpoint) — left column (~280px, sticky) 
shows: candidate name/role, a "Day Rail" — a vertical list of tick marks for 
days 1-31, each a small dot, dimmed by default, filled accent-cyan and 
labeled with its day number once that day has been asked about in the 
current session (derive this from the [Day X] tags already in messages), 
plus a small "X/8 questions asked" counter. Right column is the existing 
chat, restyled with the new palette — muted-panel bubbles for the 
interviewer, accent-tinted bubbles for the candidate. On mobile, the Day 
Rail collapses to a horizontal scrollable strip above the chat.

Give the feedback card (on done: true) a distinct treatment: accent-cyan left 
border, clearly separated strengths (green accent)/gaps (amber accent)/next 
(neutral) sections.

Keep all existing functionality (candidate select, restart, message sending) 
exactly as-is — this is a styling pass only."

**Outcome (from Cursor):** UI restyled with the new palette/typography and 
Day Rail sidebar added (initially as a scrolling list).

---

## Cursor Prompt 7 — 17:30 PM

**What I told Claude:** The Day Rail wasn't highlighting any days even 
after questions were asked, and asked to remove the scrolling list in 
favor of a two-column layout showing all 31 days at once.

**Claude's response:** It gave me prompt 7.

**What I did:** Pasted Claude's combined fix prompt 7 into Cursor's chat — 
correct the highlighting logic to parse [Day X] tags from the conversation, 
and switch to a no-scroll two-column (1–15 / 16–31) layout.

Prompt:

"The Day Rail shows all 31 days but none highlight as accent-cyan even 
though questions have been asked. Fix the logic: parse the [Day X] tags 
from the assistant messages in state, build a Set of day numbers that have 
actually been asked about, and apply the accent-cyan filled style + label 
color to only those day numbers in the rail. Verify by checking that after 
2 questions, exactly 2 (or however many distinct days) dots are lit, not 
zero.

Replace the Day Rail's vertical scrolling list with a two-column layout, no 
scroll: days 1-15 in the left sub-column, 16-31 in the right sub-column, 
side by side. Keep each day as a small dot + number, same highlight logic 
(accent-cyan fill for days that have been asked about, dimmed gray 
otherwise). Remove the fixed-height/overflow-scroll container — the rail 
should size to fit its content naturally."

**Outcome (from Cursor):** Day Rail now correctly highlights the specific 
days being tested in real time, laid out in two columns with no scrolling.

**Verification:** Tested with Sarah Johnson — confirmed the first question 
correctly targeted Day 12 (her single weakest mission, 4 attempts), 
matching the candidate-weighting logic as intended.

---

## Cursor Prompt 8 — 17:56 PM

**What I told Claude (17:54 PM):** Asked whether an "End Interview" button 
was needed, since Restart didn't work mid-interview and there was no way 
to stop an interview partway through.

**Claude's response :** Agreed it was worth adding — better UX for anyone testing the demo, and useful for testing without running the full 8 questions every time. Wrote a prompt 8 for it.

**What I did:** Pasted Claude's prompt 8 into Cursor's chat — added an End 
Interview button that sends a special message to end the session early, 
returning a plain "ended early, N questions answered" message rather than 
full structured feedback (revised once to make this distinction explicit).

**Outcome (from Cursor):** End Interview button now ends a session 
mid-way with a clear early-exit message, while a normal full run still 
produces real structured feedback as before.

**What I told Claude:** Confirmed all this are tested and working.

**Claude's response:** Confirmed ready to do final commit.