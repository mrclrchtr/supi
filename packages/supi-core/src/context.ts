// supi-core context domain — context providers and XML tags.
export type { ContextProvider } from "./context/context-provider-registry.ts";
export {
  clearRegisteredContextProviders,
  getRegisteredContextProviders,
  registerContextProvider,
} from "./context/context-provider-registry.ts";
export { wrapExtensionContext } from "./context/context-tag.ts";
