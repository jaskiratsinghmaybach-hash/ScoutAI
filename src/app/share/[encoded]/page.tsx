import { SharePreview } from "@/components/scout/SharePreview";

export default async function SharePage({
    params,
}: {
    params: Promise<{ encoded: string }>;
}) {
    const { encoded } = await params;

    return <SharePreview encodedFromPath={encoded} />;
}
