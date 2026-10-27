// biome-ignore-all lint/style/noExcessiveLinesPerFile: the complete native contract is declared together for auditing
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  ConfidenceSchema,
  EvidenceListSchema,
  NavigationTargetSchema,
  ReadNextSchema,
  RecoveryRangeSchema,
} from "../result/structured.ts";

const nullableString = Type.Union([Type.String(), Type.Null()]);
const coordinate = { description: "One-based line and UTF-16 character; end is exclusive." };
const SourceItem = Type.Object(
  {
    startLine: Type.Integer(),
    startCharacter: Type.Integer(),
    endLine: Type.Integer(),
    endCharacter: Type.Integer(),
  },
  coordinate,
);
const Project = Type.Object(
  {
    id: Type.String(),
    manifestPath: Type.String(),
    kind: StringEnum(["node-package", "python-project", "rust-package", "go-module"]),
    directory: Type.String(),
    name: nullableString,
    nameField: nullableString,
    description: nullableString,
    descriptionField: nullableString,
  },
  { additionalProperties: false },
);
const Relationship = Type.Object(
  {
    from: Type.String(),
    to: Type.String(),
    manifestPath: Type.String(),
    field: Type.String(),
    value: Type.Unknown(),
  },
  { additionalProperties: false },
);
const Provenance = Type.Object(
  {
    source: StringEnum([
      "semantic",
      "structural",
      "filesystem",
      "manifest",
      "configuration",
      "runtime",
    ]),
    capability: Type.Optional(Type.String()),
    detail: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
const SourceListFields = {
  status: StringEnum(["complete", "partial", "unavailable"]),
  reason: nullableString,
  collectedCount: Type.Integer(),
  omittedCount: Type.Integer(),
};
const Observation = Type.Union([
  Type.Object(
    { status: Type.Literal("complete"), reason: Type.Null() },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: StringEnum(["partial", "unavailable", "withheld"]), reason: Type.String() },
    { additionalProperties: false },
  ),
]);
const ContextDefinitionEntries = {
  entries: Type.Array(
    Type.Object(
      { uri: Type.String(), range: RecoveryRangeSchema },
      { additionalProperties: false },
    ),
  ),
  collectedCount: Type.Integer({
    description: "Collected locations; a partial observation may have an unknown remainder.",
  }),
  omittedCount: Type.Integer({
    description: "Collected locations omitted by the requested selection limit.",
  }),
};
const ContextDefinitions = Type.Union([
  Type.Object(
    { status: Type.Literal("complete"), reason: Type.Null(), ...ContextDefinitionEntries },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: Type.Literal("partial"), reason: Type.String(), ...ContextDefinitionEntries },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: StringEnum(["unavailable", "withheld"]), reason: Type.String() },
    { additionalProperties: false },
  ),
]);
const Facts = Type.Object(
  {
    fileSizeBytes: Type.Optional(Type.Integer()),
    package: Type.Optional(
      Type.Object(
        {
          name: nullableString,
          description: nullableString,
          manifestPath: Type.String(),
          directory: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    manifestFields: Type.Optional(
      Type.Array(
        Type.Object(
          { field: Type.String(), value: Type.Unknown() },
          { additionalProperties: false },
        ),
      ),
    ),
    dependencies: Type.Optional(
      Type.Array(
        Type.Object(
          { field: Type.String(), name: Type.String(), value: Type.Unknown() },
          { additionalProperties: false },
        ),
      ),
    ),
    relationships: Type.Optional(Type.Array(Relationship)),
    outline: Type.Optional(
      Type.Array(
        Type.Object(
          { ...SourceItem.properties, name: Type.String(), kind: Type.String() },
          { additionalProperties: false, ...coordinate },
        ),
      ),
    ),
    imports: Type.Optional(
      Type.Array(
        Type.Object(
          { ...SourceItem.properties, moduleSpecifier: Type.String() },
          { additionalProperties: false, ...coordinate },
        ),
      ),
    ),
    exports: Type.Optional(
      Type.Array(
        Type.Object(
          {
            ...SourceItem.properties,
            name: Type.String(),
            kind: Type.String(),
            moduleSpecifier: Type.Optional(Type.String()),
          },
          { additionalProperties: false, ...coordinate },
        ),
      ),
    ),
    diagnosticSnapshot: Type.Optional(
      Type.Array(
        Type.Object(
          {
            file: Type.String(),
            total: Type.Integer(),
            errors: Type.Integer(),
            warnings: Type.Integer(),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    snapshotCurrent: Type.Optional(Type.Boolean()),
    node: Type.Optional(
      Type.Union([
        Type.Null(),
        Type.Object(
          {
            type: Type.String(),
            text: Type.String(),
            startLine: Type.Integer(),
            startCharacter: Type.Integer(),
            endLine: Type.Integer(),
            endCharacter: Type.Integer(),
            ancestry: Type.Array(
              Type.Object(
                { ...SourceItem.properties, type: Type.String() },
                { additionalProperties: false, ...coordinate },
              ),
            ),
          },
          { additionalProperties: false, ...coordinate },
        ),
      ]),
    ),
    nodeObservation: Type.Optional(Observation),
    hoverObservation: Type.Optional(Observation),
    hover: Type.Optional(
      Type.Union([
        Type.Null(),
        Type.Object(
          { contents: Type.String(), range: Type.Optional(RecoveryRangeSchema) },
          { additionalProperties: false },
        ),
      ]),
    ),
    definitions: Type.Optional(
      Type.Array(
        Type.Object(
          { file: Type.String(), range: RecoveryRangeSchema },
          { additionalProperties: false },
        ),
      ),
    ),
    contextDefinitions: Type.Optional(ContextDefinitions),
    recovery: Type.Optional(
      Type.Array(
        Type.Object(
          {
            operation: Type.String(),
            file: Type.String(),
            reason: Type.String(),
            errorRanges: Type.Array(RecoveryRangeSchema),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    sourceContext: Type.Optional(
      Type.Object(
        {
          outline: Type.Object(
            {
              ...SourceListFields,
              entries: Type.Array(
                Type.Object(
                  {
                    name: Type.String(),
                    kind: Type.String(),
                    startLine: Type.Integer(),
                    endLine: Type.Integer(),
                  },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
          imports: Type.Object(
            {
              ...SourceListFields,
              entries: Type.Array(
                Type.Object({ moduleSpecifier: Type.String() }, { additionalProperties: false }),
              ),
            },
            { additionalProperties: false },
          ),
          exports: Type.Object(
            {
              ...SourceListFields,
              entries: Type.Array(
                Type.Object(
                  { name: Type.String(), kind: Type.String() },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
        },
        {
          additionalProperties: false,
          description:
            "Best-effort source lists; collectedCount is not a completeness claim when status is partial or unavailable.",
        },
      ),
    ),
    documentation: Type.Optional(Type.Array(Type.String())),
    diagnostics: Type.Optional(
      Type.Array(
        Type.Object(
          {
            range: RecoveryRangeSchema,
            severity: Type.Union([Type.Integer(), Type.Null()]),
            message: Type.String(),
            source: nullableString,
            code: Type.Union([Type.String(), Type.Number(), Type.Null()]),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  {
    additionalProperties: false,
    description:
      "Named observations, not rendered text. Ranges use zero-based UTF-16 positions; source-item coordinates are one-based.",
  },
);
const Section = Type.Object(
  {
    key: Type.String(),
    status: StringEnum(["complete", "partial", "unavailable"]),
    reason: nullableString,
    confidence: ConfidenceSchema,
    provenance: Type.Array(Provenance),
    evidenceLists: Type.Array(EvidenceListSchema),
    errorRanges: Type.Optional(Type.Array(RecoveryRangeSchema)),
    facts: Type.Optional(Facts),
  },
  { additionalProperties: false },
);
const Instruction = Type.Object(
  {
    path: Type.String(),
    shownLines: Type.Integer(),
    totalLines: Type.Integer(),
    truncated: Type.Boolean(),
    content: Type.String(),
  },
  { additionalProperties: false },
);
const GradleBase = {
  selectedRoot: Type.String(),
  query: Type.Literal("GradleBuild/BasicGradleProject"),
  runtime: Type.Optional(
    Type.Object(
      {
        kind: StringEnum(["distribution", "installation"]),
        source: Type.String(),
        version: Type.String(),
      },
      { additionalProperties: false },
    ),
  ),
};
const Gradle = Type.Union([
  Type.Object(
    {
      ...GradleBase,
      status: Type.Literal("complete"),
      gradleVersion: Type.String(),
      buildRoot: Type.String(),
      projects: Type.Array(
        Type.Object(
          {
            buildRoot: Type.String(),
            path: Type.String(),
            name: Type.String(),
            directory: Type.String(),
            parentPath: nullableString,
          },
          { additionalProperties: false },
        ),
      ),
      includedBuilds: Type.Array(
        Type.Object({ buildRoot: Type.String() }, { additionalProperties: false }),
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...GradleBase,
      status: StringEnum([
        "blocked",
        "unavailable",
        "unsupported",
        "failed",
        "interrupted",
        "timeout",
        "oversized",
      ]),
      gradleVersion: Type.Optional(Type.String()),
      stage: StringEnum(["authorization", "prerequisites", "query", "unknown"]),
      reason: Type.String(),
    },
    { additionalProperties: false },
  ),
]);
const Workspace = Type.Object(
  {
    root: Type.String(),
    focus: Type.String(),
    directFiles: Type.Array(
      Type.Object(
        { path: Type.String(), kind: StringEnum(["file", "symlink"]) },
        { additionalProperties: false },
      ),
    ),
    directories: Type.Array(
      Type.Object(
        { path: Type.String(), entryCount: Type.Integer() },
        { additionalProperties: false },
      ),
    ),
    extensions: Type.Array(
      Type.Object(
        { extension: Type.String(), fileCount: Type.Integer() },
        { additionalProperties: false },
      ),
    ),
    containingProjects: Type.Array(Project),
    projects: Type.Array(Project),
    memberships: Type.Array(
      Type.Object(
        {
          projectId: Type.String(),
          kind: Type.String(),
          manifestPath: Type.String(),
          field: Type.String(),
          value: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    declaredPaths: Type.Array(
      Type.Object(
        {
          projectId: Type.String(),
          paths: Type.Array(
            Type.Object(
              { path: Type.String(), fields: Type.Array(Type.String()) },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    relationships: Type.Array(Relationship),
    dependencies: Type.Array(
      Type.Object(
        {
          projectId: Type.String(),
          field: Type.String(),
          name: Type.String(),
          value: Type.Unknown(),
        },
        { additionalProperties: false },
      ),
    ),
    workspaceDeclarations: Type.Array(
      Type.Object(
        {
          kind: Type.String(),
          manifestPath: Type.String(),
          directory: Type.String(),
          field: Type.String(),
          patterns: Type.Array(Type.String()),
          excludeField: nullableString,
          excludes: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    inventory: Type.Object(
      {
        fileCount: Type.Integer(),
        symlinkCount: Type.Integer(),
        source: StringEnum(["git", "filesystem"]),
        exclude: Type.Array(Type.String()),
        includeIgnored: Type.Boolean(),
        symlinks: Type.Literal("not-followed"),
        directoryNamesExcluded: Type.Literal(false),
      },
      {
        additionalProperties: false,
        description: "Counts refer to the collected inventory, which may be incomplete.",
      },
    ),
    collection: Type.Object(
      {
        status: StringEnum(["complete", "partial"]),
        stopReason: StringEnum(["complete", "entry-limit", "deadline"]),
        prioritizedDirectory: nullableString,
        limits: Type.Object(
          { maxEntries: Type.Integer(), deadline: Type.Union([Type.Number(), Type.Null()]) },
          { additionalProperties: false },
        ),
        errors: Type.Array(
          Type.Object(
            { stage: Type.String(), path: nullableString, reason: Type.String() },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    metadata: Type.Object(
      {
        documents: Type.Array(
          Type.Object(
            {
              path: Type.String(),
              kind: Type.String(),
              status: Type.String(),
              reason: nullableString,
            },
            { additionalProperties: false },
          ),
        ),
        issues: Type.Array(
          Type.Object(
            {
              path: Type.String(),
              field: nullableString,
              kind: Type.String(),
              reason: Type.String(),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    gradle: Type.Optional(Gradle),
    selections: Type.Array(EvidenceListSchema),
  },
  {
    additionalProperties: false,
    description:
      "root and focus are absolute. Direct inventory paths are relative to focus; project and metadata paths are relative to root. Selection counts exclude text-budget reductions.",
  },
);

const Common = {
  confidence: ConfidenceSchema,
  sections: Type.Array(Section),
  targets: Type.Array(NavigationTargetSchema),
  candidates: Type.Array(
    Type.Object(
      {
        handle: Type.String(),
        name: Type.String(),
        kind: nullableString,
        container: nullableString,
        file: Type.String(),
        line: Type.Integer(),
        character: Type.Integer(),
        rank: Type.Integer(),
        anchorKind: Type.Optional(StringEnum(["name", "declaration"])),
      },
      { additionalProperties: false, description: "One-based line and UTF-16 character." },
    ),
  ),
  evidenceLists: Type.Array(EvidenceListSchema),
  nextQueries: Type.Array(Type.String()),
  readNext: Type.Array(ReadNextSchema),
  instructions: Type.Array(Instruction),
  observationLimitations: Type.Array(Type.String()),
};
const Snapshot = Type.Object(
  {
    path: Type.String(),
    limitation: Type.Literal("Reading this snapshot does not refresh the captured observation."),
  },
  { additionalProperties: false },
);

/** Native orientation data. Snapshot paths refer to captured facts, never a fresh observation. */
export const OrientationOutputSchema = Type.Union([
  Type.Object(
    {
      ...Common,
      kind: Type.Literal("completed"),
      focusKind: StringEnum(["workspace", "directory", "module"]),
      focus: Type.Union([Type.String(), Type.Null()]),
      workspace: Workspace,
      snapshot: Type.Optional(Snapshot),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...Common,
      kind: Type.Literal("completed"),
      focusKind: StringEnum(["file", "symbol"]),
      focus: Type.Union([Type.String(), Type.Null()]),
    },
    { additionalProperties: false },
  ),
  Type.Object({ ...Common, kind: Type.Literal("disambiguation") }, { additionalProperties: false }),
  Type.Object(
    { ...Common, kind: Type.Literal("kind-mismatch"), requestedKind: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...Common,
      kind: Type.Literal("invalid-input"),
      message: Type.String(),
      symlinkRejection: Type.Optional(
        Type.Object(
          { requestedPath: Type.String(), blockedPath: Type.String() },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
]);
