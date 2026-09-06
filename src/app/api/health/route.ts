import { NextResponse } from "next/server";

export async function GET() {
  // Vertex AI auth is via ADC (local dev) or Workload Identity
  // Federation (production, via Vercel OIDC — see src/lib/agent.ts) —
  // never an API key or a downloadable service account key file.
  // "configured" here just means the right project/env vars are
  // present for whichever path applies, not that a real Vertex AI
  // call has actually been made successfully.
  const hasLocalAdcConfig = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  const hasProductionWifConfig = Boolean(
    process.env.GCP_PROJECT_ID &&
      process.env.GCP_PROJECT_NUMBER &&
      process.env.GCP_SERVICE_ACCOUNT_EMAIL &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
  );

  return NextResponse.json({
    status: "ok",
    vertex_configured: hasLocalAdcConfig || hasProductionWifConfig,
    parallel_configured: Boolean(process.env.PARALLEL_API_KEY),
  });
}
