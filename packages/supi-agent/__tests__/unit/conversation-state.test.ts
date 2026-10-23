import { describe, expect, it } from "vitest";
import { DelegationConversationState } from "../../src/delegation/conversation-state.ts";

describe("delegation conversation startup reservations", () => {
  it("locks saved conversations until asynchronous batch startup completes", () => {
    const state = new DelegationConversationState();
    const target = { taskId: "follow-up", conversationId: "saved-conversation" };
    const release = state.reserveStarting([target]);

    expect(() => state.assertAvailable([target], [], [], () => true)).toThrow(
      'Conversation "saved-conversation" already has an active Agent Run.',
    );
    release();
    expect(() => state.assertAvailable([target], [], [], () => true)).not.toThrow();
  });
});
