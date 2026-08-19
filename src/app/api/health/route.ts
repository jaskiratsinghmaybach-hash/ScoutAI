import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    gemini_configured: Boolean(process.env.GEMINI_API_KEY),
    parallel_configured: Boolean(process.env.PARALLEL_API_KEY),
  });
}
