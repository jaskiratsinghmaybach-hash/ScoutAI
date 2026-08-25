import { ScoutApp } from "@/components/scout/ScoutApp";

export default async function ChatPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <ScoutApp key={id} chatId={id} />;
}