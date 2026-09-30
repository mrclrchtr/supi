import { dirname, join } from "node:path";

/** Resolve the package fixture directory from one integration-test directory. */
export function fixtureDirectory(testDirectory: string): string {
  return join(dirname(testDirectory), "fixtures");
}
