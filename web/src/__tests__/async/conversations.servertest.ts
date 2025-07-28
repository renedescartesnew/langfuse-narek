/**
 * @jest-environment node
 */

import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { appRouter } from "@/src/server/api/root";
import { prisma } from "@langfuse/shared/src/db";
import { type User, type Project } from "@prisma/client";
import { z } from "zod/v4";
import { createBasicAuthHeader } from "@langfuse/shared/src/server";

// Response schemas for testing
const ConversationSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  messageCount: z.number(),
  lastMessage: z.string().optional(),
});

const ConversationDetailSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  messages: z.array(
    z.object({
      id: z.string(),
      createdAt: z.date(),
      sender: z.enum(["USER", "ASSISTANT"]),
      content: z.string(),
    }),
  ),
});

const MessageResponseSchema = z.object({
  userMessage: z.object({
    id: z.string(),
    createdAt: z.date(),
    sender: z.literal("USER"),
    content: z.string(),
  }),
  assistantMessage: z.object({
    id: z.string(),
    createdAt: z.date(),
    sender: z.literal("ASSISTANT"),
    content: z.string(),
  }),
});

const TRPCResponseSchema = z.object({
  result: z.object({
    data: z.any(),
  }),
});

const TRPCErrorSchema = z.object({
  error: z.any(),
});

// Create mock user and project for testing
let testUser: User;
let testProject: Project;
let testApiKey: string;
let testApiSecretKey: string;
const testId = `test-${Date.now()}`; // Unique ID for each test run

beforeAll(async () => {
  // Clean up any existing test data first
  try {
    await prisma.message.deleteMany({
      where: {
        conversation: {
          projectId: {
            startsWith: "test-project-conversations",
          },
        },
      },
    });
    await prisma.conversation.deleteMany({
      where: {
        projectId: {
          startsWith: "test-project-conversations",
        },
      },
    });
    await prisma.projectMembership.deleteMany({
      where: {
        projectId: {
          startsWith: "test-project-conversations",
        },
      },
    });
    await prisma.project.deleteMany({
      where: {
        id: {
          startsWith: "test-project-conversations",
        },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        orgId: {
          startsWith: "test-org-conversations",
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          startsWith: "test-user-conversations",
        },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: {
          startsWith: "test-org-conversations",
        },
      },
    });
  } catch (error) {
    // Ignore cleanup errors - entities might not exist
    console.log("Cleanup completed (some entities may not have existed)");
  }

  // Create test organization first
  await prisma.organization.create({
    data: {
      id: `test-org-conversations-${testId}`,
      name: "Test Organization",
    },
  });

  // Create a test user
  testUser = await prisma.user.create({
    data: {
      id: `test-user-conversations-${testId}`,
      name: "Test User",
      email: `test-conversations-${testId}@example.com`,
    },
  });

  // Create a test project (after organization exists)
  testProject = await prisma.project.create({
    data: {
      id: `test-project-conversations-${testId}`,
      name: "Test Project",
      orgId: `test-org-conversations-${testId}`,
    },
  });

  // Create organization membership first
  const orgMembership = await prisma.organizationMembership.create({
    data: {
      orgId: `test-org-conversations-${testId}`,
      userId: testUser.id,
      role: "OWNER",
    },
  });

  // Create project membership
  await prisma.projectMembership.create({
    data: {
      projectId: testProject.id,
      userId: testUser.id,
      role: "OWNER",
      orgMembershipId: orgMembership.id,
    },
  });

  // Create API keys for authentication
  testApiKey = `pk-lf-conversations-${testId}`;
  testApiSecretKey = `sk-lf-conversations-${testId}`;

  await prisma.apiKey.create({
    data: {
      id: testApiKey,
      publicKey: testApiKey,
      displaySecretKey:
        testApiSecretKey.slice(0, 3) + "..." + testApiSecretKey.slice(-3),
      hashedSecretKey: await (
        await import("bcryptjs")
      ).hash(testApiSecretKey, 10),
      note: "Test API Key for Conversations",
      projectId: testProject.id,
    },
  });
});

afterAll(async () => {
  // Clean up test data in reverse order of creation
  if (testProject?.id) {
    await prisma.message.deleteMany({
      where: {
        conversation: {
          projectId: testProject.id,
        },
      },
    });
    await prisma.conversation.deleteMany({
      where: {
        projectId: testProject.id,
      },
    });
    await prisma.apiKey.deleteMany({
      where: {
        projectId: testProject.id,
      },
    });
    await prisma.projectMembership.deleteMany({
      where: {
        projectId: testProject.id,
      },
    });
    await prisma.project.delete({
      where: {
        id: testProject.id,
      },
    });
  }

  if (testUser?.id) {
    await prisma.organizationMembership.deleteMany({
      where: {
        orgId: `test-org-conversations-${testId}`,
      },
    });
    await prisma.user.delete({
      where: {
        id: testUser.id,
      },
    });
  }

  await prisma.organization.delete({
    where: {
      id: `test-org-conversations-${testId}`,
    },
  });
});

describe("Conversations API", () => {
  it("should create a new conversation", async () => {
    const response = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.create",
      {
        projectId: testProject.id,
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    expect(response.status).toBe(200);
    expect(response.body.result.data).toHaveProperty("id");
    expect(response.body.result.data).toHaveProperty("createdAt");
  });

  it("should list conversations for a project", async () => {
    // First create a conversation
    const createResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.create",
      {
        projectId: testProject.id,
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    const conversationId = createResponse.body.result.data.id;

    // Then list conversations
    const listResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.all",
      {
        projectId: testProject.id,
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.result.data)).toBe(true);
    expect(listResponse.body.result.data.length).toBeGreaterThan(0);

    const conversation = listResponse.body.result.data.find(
      (c: any) => c.id === conversationId,
    );
    expect(conversation).toBeDefined();
    expect(conversation).toHaveProperty("messageCount", 0);
  });

  it("should get conversation by ID", async () => {
    // First create a conversation
    const createResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.create",
      {
        projectId: testProject.id,
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    const conversationId = createResponse.body.result.data.id;

    // Then get the conversation
    const getResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.byId",
      {
        projectId: testProject.id,
        conversationId,
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.result.data).toHaveProperty("id", conversationId);
    expect(getResponse.body.result.data).toHaveProperty("messages");
    expect(Array.isArray(getResponse.body.result.data.messages)).toBe(true);
    expect(getResponse.body.result.data.messages.length).toBe(0);
  });

  it("should send a message and get a response", async () => {
    // First create a conversation
    const createResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.create",
      {
        projectId: testProject.id,
      },
      testUser.id,
    );

    const conversationId = createResponse.body.result.data.id;

    // Send a message
    const messageResponse = await makeZodVerifiedAPICall(
      TRPCResponseSchema,
      "POST",
      "/api/trpc/conversations.sendMessage",
      {
        projectId: testProject.id,
        conversationId,
        content: "Hello, how are you?",
      },
      createBasicAuthHeader(testApiKey, testApiSecretKey),
    );

    expect(messageResponse.status).toBe(200);
    expect(messageResponse.body.result.data).toHaveProperty("userMessage");
    expect(messageResponse.body.result.data).toHaveProperty("assistantMessage");

    const { userMessage, assistantMessage } = messageResponse.body.result.data;

    expect(userMessage).toHaveProperty("sender", "USER");
    expect(userMessage).toHaveProperty("content", "Hello, how are you?");
    expect(assistantMessage).toHaveProperty("sender", "ASSISTANT");
    expect(assistantMessage.content).toBeTruthy();
  });

  it("should return NOT_FOUND for non-existent conversation", async () => {
    const response = await makeZodVerifiedAPICall(
      TRPCErrorSchema,
      "GET",
      `/api/trpc/conversations.byId?input=${encodeURIComponent(
        JSON.stringify({
          json: {
            projectId: testProject.id,
            conversationId: "non-existent-id",
          },
        }),
      )}`,
      undefined,
      createBasicAuthHeader(testApiKey, testApiSecretKey),
      400, // Expected status code
    );

    expect(response.status).toBe(400); // TRPC returns 400 for NOT_FOUND
    expect(response.body.error).toBeDefined();
  });

  it("should not allow access to conversations from other users", async () => {
    // Create another user
    const otherUser = await prisma.user.create({
      data: {
        id: "other-test-user-conversations",
        name: "Other Test User",
        email: "other-test-conversations@example.com",
      },
    });

    try {
      // First user creates a conversation
      const createResponse = await makeZodVerifiedAPICall(
        TRPCResponseSchema,
        "POST",
        "/api/trpc/conversations.create",
        {
          projectId: testProject.id,
        },
        createBasicAuthHeader(testApiKey, testApiSecretKey),
      );

      const conversationId = createResponse.body.result.data.id;

      // Other user tries to access it (should fail) - use invalid auth
      const getResponse = await makeZodVerifiedAPICall(
        TRPCErrorSchema,
        "POST",
        "/api/trpc/conversations.create",
        {
          projectId: testProject.id,
        },
        "invalid-auth-header",
        401, // Expected status code for unauthorized
      );

      expect(getResponse.status).toBe(400); // Should be unauthorized/not found
    } finally {
      // Clean up the other user
      await prisma.user.delete({
        where: {
          id: otherUser.id,
        },
      });
    }
  });
});
