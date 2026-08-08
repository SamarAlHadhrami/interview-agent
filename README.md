# Interview Agent

An AI Interview Agent that runs personalized technical interviews against the AI Cohort's 31-day curriculum. Questions adapt to each candidate's real mission history — weak and skipped days are weighted higher — so the session probes actual gaps while still verifying depth on stronger days. Built for the ABTalks Vibe Code Hackathon.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in GROQ_API_KEY and BREETH_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- One endpoint: `POST /api/interview` (session start with `{ sessionId, candidate }`, turns with `{ sessionId, message }`, early exit with `message: "__END_INTERVIEW__"`).
- The API is stateless — every turn reconstructs the candidate profile and Q&A transcript from Breeth.
- Questions are grounded in `data/curriculum.json` (that day's title, tools, and objectives only).
- Interviews aim for at least **8 questions** across **4+ distinct curriculum days**, then return structured feedback JSON: `{ summary, strengths, gaps, next }`.

## Why Breeth

Breeth is not just a write log. It is the **session persistence layer** that makes the stateless interview API workable: each turn searches/writes episodes for that `sessionId` instead of keeping server-side session memory. High-signal answers are written with `extract_intent: true` so Breeth can capture *why* a response showed understanding or a gap — not only that the exchange happened.

## Live demo

[https://interview-agent-eight-orcin.vercel.app/](https://interview-agent-eight-orcin.vercel.app/)

## AI usage log

See [PROMPTS.md](./PROMPTS.md) for the prompt / agent usage log for this project.
