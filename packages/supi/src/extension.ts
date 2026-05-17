import askUser from "@mrclrchtr/supi-ask-user/extension";
import bashTimeout from "@mrclrchtr/supi-bash-timeout/extension";
import claudeMd from "@mrclrchtr/supi-claude-md/extension";
import codeIntelligence from "@mrclrchtr/supi-code-intelligence/extension";
import context from "@mrclrchtr/supi-context/extension";
import core from "@mrclrchtr/supi-core/extension";
import debug from "@mrclrchtr/supi-debug/extension";
import extras from "@mrclrchtr/supi-extras/extension";
import lsp from "@mrclrchtr/supi-lsp/extension";
import treeSitter from "@mrclrchtr/supi-tree-sitter/extension";

export default function extension(pi: Parameters<typeof askUser>[0]): void {
  core(pi);
  extras(pi);
  askUser(pi);
  bashTimeout(pi);
  claudeMd(pi);
  lsp(pi);
  debug(pi);
  context(pi);
  treeSitter(pi);
  codeIntelligence(pi);
}
