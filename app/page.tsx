import db from "@/lib/db";
import { getOrCreateSession } from "@/lib/session";
import ChatContainer from "./components/ChatContainer";
import { getApiKeysStatus } from "./actions/settings";
import { getFreeTrialStatus } from "./actions/chat";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const sessionId = await getOrCreateSession();
  
  // Fetch all conversations under this session
  const conversations = await db.conversation.findMany({
    where: { sessionId },
    orderBy: { updatedAt: "desc" },
  });
  
  let activeId = searchParams.c;
  let messages: any[] = [];
  
  if (activeId) {
    const verified = conversations.some((c) => c.id === activeId);
    if (verified) {
      messages = await db.message.findMany({
        where: { conversationId: activeId },
        orderBy: { createdAt: "asc" },
      });
    } else {
      activeId = undefined;
    }
  } else if (conversations.length > 0) {
    // Automatically load the latest conversation for returning users
    activeId = conversations[0].id;
    messages = await db.message.findMany({
      where: { conversationId: activeId },
      orderBy: { createdAt: "asc" },
    });
  }
  
  const apiKeysStatus = await getApiKeysStatus();
  const trialStatus = await getFreeTrialStatus();
  
  return (
    <ChatContainer
      initialConversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        modelProvider: c.modelProvider,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))}
      initialActiveId={activeId}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }))}
      apiKeysStatus={apiKeysStatus}
      trialStatus={trialStatus}
    />
  );
}
