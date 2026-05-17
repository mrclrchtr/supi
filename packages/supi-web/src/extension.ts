import docsExtension from "./docs.ts";
import webExtension from "./web.ts";

export default function extension(pi: Parameters<typeof webExtension>[0]): void {
  webExtension(pi);
  docsExtension(pi);
}
