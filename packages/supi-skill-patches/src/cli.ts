import { splitCombinedPatch, validatePatchBundle, writeCombinedPatch } from "./patch-bundle.ts";
import { syncSkillMirror, validateSkillMirror } from "./skill-mirror.ts";

const command = process.argv[2];

switch (command) {
  case "compose":
    writeCombinedPatch();
    break;
  case "split":
    splitCombinedPatch();
    break;
  case "sync":
    syncSkillMirror();
    break;
  case "check": {
    const errors = [...validatePatchBundle(), ...validateSkillMirror()];
    if (errors.length > 0) throw new Error(errors.join("\n"));
    break;
  }
  default:
    throw new Error(`Expected compose, split, sync, or check; received ${command ?? "nothing"}`);
}
