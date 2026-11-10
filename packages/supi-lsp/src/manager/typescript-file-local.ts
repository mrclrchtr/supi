import * as fs from "node:fs";
import ts from "typescript";

/**
 * Whether the identifier at `position` names a top-level declaration that only
 * its own file can reference: the file is an ES module and the declaration is
 * neither exported by a modifier nor by an export clause or assignment.
 *
 * Other TypeScript projects can then hold no references or implementations,
 * so a project coverage gap cannot apply. Script files (no import or export),
 * members, unreadable files, and non-declaration positions return false.
 *
 * @param position Zero-based LSP position.
 */
export function isFileLocalTopLevelDeclaration(
  filePath: string,
  position: { readonly line: number; readonly character: number },
): boolean {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return false;
  }
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  if (!ts.isExternalModule(sourceFile)) return false;
  let offset: number;
  try {
    offset = ts.getPositionOfLineAndCharacter(sourceFile, position.line, position.character);
  } catch {
    return false;
  }
  const statement = sourceFile.statements.find(
    (candidate) => candidate.getStart(sourceFile) <= offset && offset < candidate.end,
  );
  if (!statement) return false;
  const name = topLevelDeclarationNameAt(statement, offset, sourceFile);
  return name !== null && !hasExportModifier(statement) && !exportedByName(sourceFile, name);
}

/** Name of the declaration `statement` declares at `offset`, or null. */
function topLevelDeclarationNameAt(
  statement: ts.Statement,
  offset: number,
  sourceFile: ts.SourceFile,
): string | null {
  const names: ts.Identifier[] = [];
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) {
    if (statement.name) names.push(statement.name);
  } else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.push(declaration.name);
    }
  }
  const hit = names.find((name) => name.getStart(sourceFile) <= offset && offset <= name.end);
  return hit ? hit.text : null;
}

function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DeclareKeyword,
    )
  );
}

/** `export { name }`, `export default name`, or `export = name` in this file. */
function exportedByName(sourceFile: ts.SourceFile, name: string): boolean {
  return sourceFile.statements.some((statement) => {
    if (ts.isExportAssignment(statement)) {
      return ts.isIdentifier(statement.expression) && statement.expression.text === name;
    }
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) return false;
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return false;
    return clause.elements.some((element) => (element.propertyName ?? element.name).text === name);
  });
}
