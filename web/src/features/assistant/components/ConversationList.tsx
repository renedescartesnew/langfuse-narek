import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Plus, MessageCircle, Clock } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { formatDistanceToNow } from "date-fns";

interface ConversationListProps {
  projectId: string;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  isCreating: boolean;
}

export function ConversationList({
  projectId,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  isCreating,
}: ConversationListProps) {
  const { data: conversations, isLoading } = api.conversations.all.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const getConversationPreview = (conversation: any) => {
    if (conversation.lastMessage) {
      return conversation.lastMessage.content.slice(0, 50) + 
        (conversation.lastMessage.content.length > 50 ? "..." : "");
    }
    return "No messages yet";
  };

  const getConversationTitle = (conversation: any) => {
    if (conversation.lastMessage && conversation.lastMessage.sender === "USER") {
      return conversation.lastMessage.content.slice(0, 30) + 
        (conversation.lastMessage.content.length > 30 ? "..." : "");
    }
    return "New Conversation";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Button
          onClick={onNewConversation}
          disabled={isCreating}
          className="mt-2 w-full"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          {isCreating ? "Creating..." : "New Conversation"}
        </Button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading conversations...
          </div>
        ) : conversations && conversations.length > 0 ? (
          <div className="space-y-2 p-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  selectedConversationId === conversation.id
                    ? "bg-accent text-accent-foreground border-accent-foreground/20"
                    : "bg-background"
                )}
              >
                <div className="flex items-start gap-2">
                  <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {getConversationTitle(conversation)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {getConversationPreview(conversation)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(conversation.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <span className="ml-auto">
                        {conversation.messageCount} messages
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            <MessageCircle className="mx-auto h-12 w-12 opacity-50" />
            <h3 className="mt-2 text-sm font-medium">No conversations yet</h3>
            <p className="mt-1 text-xs">Start a new conversation to get started</p>
          </div>
        )}
      </div>
    </div>
  );
} 