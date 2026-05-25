// supi-core context domain — context messages, providers, and XML tags.
export type { ContextMessageLike } from "./context/context-messages.ts";
export {
  findLastUserMessageIndex,
  getContextToken,
  getPromptContent,
  pruneAndReorderContextMessages,
  restorePromptContent,
} from "./context/context-messages.ts";
export type { ContextProvider } from "./context/context-provider-registry.ts";
export {
  clearRegisteredContextProviders,
  getRegisteredContextProviders,
  registerContextProvider,
} from "./context/context-provider-registry.ts";
export { wrapExtensionContext } from "./context/context-tag.ts";
