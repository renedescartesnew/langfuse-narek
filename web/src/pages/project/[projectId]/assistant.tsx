import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Head from "next/head";
import { ConversationList } from "@/src/features/assistant/components/ConversationList";
import { ChatView } from "@/src/features/assistant/components/ChatView";

export default function AssistantPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Create a new conversation and select it
  const createConversation = api.conversations.create.useMutation({
    onSuccess: (data) => {
      setSelectedConversationId(data.id);
    },
  });

  const handleNewConversation = () => {
    if (projectId) {
      createConversation.mutate({ projectId });
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  return (
    <>
      <Head>
        <title>Assistant | Langfuse</title>
      </Head>
      <div className="flex h-full">
        {/* Conversation List Sidebar */}
        <div className="w-80 border-r bg-background">
          <ConversationList
            projectId={projectId}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            isCreating={createConversation.isLoading}
          />
        </div>

        {/* Main Chat View */}
        <div className="flex-1">
          {selectedConversationId ? (
            <ChatView
              projectId={projectId}
              conversationId={selectedConversationId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <h3 className="text-lg font-medium">Welcome to Assistant</h3>
                <p className="mt-2">Select a conversation or start a new one to begin chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 