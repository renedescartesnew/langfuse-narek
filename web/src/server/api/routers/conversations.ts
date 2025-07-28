import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { MessageSender } from "@prisma/client";
import {
  fetchLLMCompletion,
  LLMApiKeySchema,
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  decryptAndParseExtraHeaders,
} from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";

const CreateConversationSchema = z.object({
  projectId: z.string(),
});

const GetConversationSchema = z.object({
  projectId: z.string(),
  conversationId: z.string(),
});

const SendMessageSchema = z.object({
  projectId: z.string(),
  conversationId: z.string(),
  content: z.string().min(1),
});

export const conversationsRouter = createTRPCRouter({
  // GET /api/conversations - List all conversations for a project/user
  all: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversations = await prisma.conversation.findMany({
        where: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return conversations.map((conv) => ({
        id: conv.id,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv._count.messages,
        lastMessage: conv.messages[0] || null,
      }));
    }),

  // GET /api/conversations/:id - Get conversation with full message history
  byId: protectedProjectProcedure
    .input(GetConversationSchema)
    .query(async ({ ctx, input }) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: input.conversationId,
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return conversation;
    }),

  // POST /api/conversations - Create new conversation
  create: protectedProjectProcedure
    .input(CreateConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await prisma.conversation.create({
        data: {
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
      });

      return conversation;
    }),

  // POST /api/conversations/:id/messages - Send message and get AI response
  sendMessage: protectedProjectProcedure
    .input(SendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify conversation exists and belongs to user
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: input.conversationId,
          projectId: input.projectId,
          userId: ctx.session.user.id,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId: input.conversationId,
          sender: MessageSender.USER,
          content: input.content,
        },
      });

      // Get conversation history for context
      const conversationHistory = await prisma.message.findMany({
        where: {
          conversationId: input.conversationId,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 20, // Last 20 messages for context
      });

      // Check if LLM API key exists
      const llmApiKey = await prisma.llmApiKeys.findFirst({
        where: {
          projectId: input.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let assistantResponse: string;

      if (llmApiKey) {
        try {
          // Parse the API key
          const parsedKey = LLMApiKeySchema.safeParse(llmApiKey);
          if (!parsedKey.success) {
            throw new Error(
              `Invalid API key configuration: ${parsedKey.error.message}`,
            );
          }

          // Build conversation context
          const messages: ChatMessage[] = [
            {
              type: ChatMessageType.System,
              role: ChatMessageRole.System,
              content:
                "You are a helpful AI assistant integrated into Langfuse. Provide clear, helpful responses to user questions. Keep your responses concise and relevant.",
            },
          ];

          // Add conversation history
          conversationHistory.forEach((msg) => {
            if (msg.sender === MessageSender.USER) {
              messages.push({
                type: ChatMessageType.User,
                role: ChatMessageRole.User,
                content: msg.content,
              });
            } else {
              messages.push({
                type: ChatMessageType.AssistantText,
                role: ChatMessageRole.Assistant,
                content: msg.content,
              });
            }
          });

          // Add current user message
          messages.push({
            type: ChatMessageType.User,
            role: ChatMessageRole.User,
            content: input.content,
          });

          // Determine model parameters
          const modelParams = {
            provider: parsedKey.data.provider,
            adapter: parsedKey.data.adapter,
            model: "gpt-3.5-turbo", // Default model - could be made configurable
            temperature: 0.7,
            max_tokens: 1000,
          };

          // Call LLM
          const { completion } = await fetchLLMCompletion({
            streaming: false,
            apiKey: decrypt(parsedKey.data.secretKey),
            extraHeaders: decryptAndParseExtraHeaders(
              parsedKey.data.extraHeaders,
            ),
            baseURL: parsedKey.data.baseURL || undefined,
            messages,
            modelParams,
            config: parsedKey.data.config,
            maxRetries: 1,
          });

          assistantResponse =
            typeof completion === "string"
              ? completion
              : "I apologize, but I couldn't generate a proper response. Please try again.";
        } catch (error) {
          console.error("LLM API error:", error);
          assistantResponse = `I'm sorry, but I encountered an error while processing your request. The error was: ${error instanceof Error ? error.message : "Unknown error"}

Please check your LLM API configuration in ⚙️ Settings → "LLM Connections" and try again.`;
        }
      } else {
        assistantResponse = `Hello! I received your message: "${input.content}".

To enable AI-powered responses:

🔑 **Step 1: Add LLM API Key**
1. Go to ⚙️ Settings → "LLM Connections"
2. Click "Add New API Key"
3. Choose your provider:
   • **OpenAI**: Get key from https://platform.openai.com/api-keys
   • **Google AI**: Get key from https://aistudio.google.com/app/apikey

🤖 **Step 2: Configure Model**
• Select your preferred model (e.g., gpt-3.5-turbo, gemini-pro)
• Save the configuration

Once configured, I'll provide intelligent AI responses to all your questions!`;
      }

      // Save assistant response
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: input.conversationId,
          sender: MessageSender.ASSISTANT,
          content: assistantResponse,
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        userMessage,
        assistantMessage,
      };
    }),
});
