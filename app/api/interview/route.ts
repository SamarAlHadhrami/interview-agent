import { NextRequest, NextResponse } from "next/server";
import { addEpisode } from "@/lib/breeth";
import type { Candidate } from "@/lib/data";

type InterviewBody = {
  sessionId?: string;
  candidate?: Candidate;
  message?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as InterviewBody;

  if (body.candidate && !body.message) {
    const sessionId = body.sessionId;
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    await addEpisode(
      JSON.stringify(body.candidate),
      sessionId,
      false
    );

    return NextResponse.json({
      reply: `Welcome ${body.candidate.member.name}, let's begin your technical interview.`,
      done: false,
    });
  }

  if (body.message) {
    // TODO: interview turn logic
    console.log("TODO: handle interview message", body.message);
    return NextResponse.json({ reply: "TODO", done: false });
  }

  return NextResponse.json(
    { error: "Request must include candidate or message" },
    { status: 400 }
  );
}
