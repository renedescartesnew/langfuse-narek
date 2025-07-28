import { useState, useRef, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { formatDistanceToNow } from "date-fns";

interface ChatViewProps {
  projectId: string;
  conversationId: string;
}

interface Message {
  id: string;
  sender: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
}

export function ChatView({ projectId, conversationId }: ChatViewProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversation, isLoading } = api.conversations.byId.useQuery(
    { projectId, conversationId },
    { enabled: !!projectId && !!conversationId },
  );

  const sendMessage = api.conversations.sendMessage.useMutation({
    onSuccess: () => {
      setInput("");
      // Refetch conversation to get updated messages
      void utils.conversations.byId.invalidate({ projectId, conversationId });
    },
  });

  const utils = api.useUtils();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || sendMessage.isLoading) return;

    sendMessage.mutate({
      projectId,
      conversationId,
      content: trimmedInput,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.sender === "USER";

    return (
      <div
        key={message.id}
        className={cn(
          "flex gap-3 p-4",
          isUser ? "bg-background" : "bg-muted/30",
        )}
      >
        <div className="flex-shrink-0">
          {isUser ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Bot className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isUser ? "You" : "Assistant"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(message.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <div className="prose prose-sm max-w-none text-foreground">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Loading conversation...
          </p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Conversation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="mx-auto h-12 w-12 opacity-50" />
              <h3 className="mt-2 text-lg font-medium">
                Start the conversation
              </h3>
              <p className="mt-1 text-sm">Ask me anything to get started</p>
            </div>
          </div>
        ) : (
          <div>
            {conversation.messages.map((message) => renderMessage(message))}
            {sendMessage.isLoading && (
              <div className="flex gap-3 bg-muted/30 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Assistant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-background p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="max-h-[200px] min-h-[60px] resize-none"
              disabled={sendMessage.isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sendMessage.isLoading}
            className="h-[60px] w-[60px] flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
