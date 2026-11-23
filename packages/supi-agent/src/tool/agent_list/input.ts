import { Type } from "typebox";

export const AGENT_LIST_PAGE_SIZE = 50;

/** Parameter schema for agent_list, shared by its spec and execution. */
export const agentListParameters = Type.Object(
  {
    offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100_000 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: AGENT_LIST_PAGE_SIZE })),
  },
  { additionalProperties: false },
);
