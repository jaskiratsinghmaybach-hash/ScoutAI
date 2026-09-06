import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    // Vertex AI auth is via ADC (local) or a service account
    // (production), not an API key — "configured" here just means the
    // required project id is set, since that's what genAI in
    // src/lib/agent.ts needs to construct the client.
    vertex_configured: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
    parallel_configured: Boolean(process.env.PARALLEL_API_KEY),
  });
}
