#!/usr/bin/env python3
"""Run the bundled Gradle observation helper against pinned real Gradle fixtures."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_ROOT = REPO_ROOT / "packages/supi-code-intelligence/__tests__/fixtures/gradle"
HELPER_LIB = REPO_ROOT / "packages/supi-code-intelligence/gradle-helper/lib"
HELPER_JAR = HELPER_LIB / "supi-gradle-observation.jar"
JAVA = os.environ.get("JAVA", "java")
EXPECTED_ROOTS = {
    "groovy": "fixture-groovy-renamed-root",
    "kotlin": "fixture-kotlin-renamed-root",
}
EXPECTED_INCLUDED = {
    "groovy": "fixture-groovy-included-sibling",
    "kotlin": "fixture-kotlin-included-sibling",
}


def canonical(path: Path) -> str:
    return str(path.resolve())


def wrapper_distribution(root: Path) -> str:
    properties = root / "gradle/wrapper/gradle-wrapper.properties"
    for line in properties.read_text(encoding="utf-8").splitlines():
        if line.startswith("distributionUrl="):
            value = line.split("=", 1)[1]
            return re.sub(r"\\(.)", r"\1", value)
    raise RuntimeError(f"No distributionUrl in {properties}")


def cached_gradle_installation() -> Path | None:
    gradle_home = Path(os.environ.get("GRADLE_USER_HOME", str(Path.home() / ".gradle"))).expanduser()
    candidates = sorted(
        path.parent.parent
        for path in (gradle_home / "wrapper/dists").glob("gradle-9.4.0-*/**/bin/gradle")
        if path.is_file() and path.parent.parent.name == "gradle-9.4.0"
    )
    return candidates[0] if candidates else None


def expected_projects(root: Path, root_name: str) -> dict[str, dict[str, str | None]]:
    return {
        ":": {"name": root_name, "directory": canonical(root), "parentPath": None},
        ":groups": {
            "name": "groups",
            "directory": canonical(root / "groups"),
            "parentPath": ":",
        },
        ":groups:alpha": {
            "name": "alpha",
            "directory": canonical(root / "groups/alpha"),
            "parentPath": ":groups",
        },
        ":groups:alpha:shared": {
            "name": "shared",
            "directory": canonical(root / "custom/alpha/shared-project"),
            "parentPath": ":groups:alpha",
        },
        ":groups:beta": {
            "name": "beta",
            "directory": canonical(root / "groups/beta"),
            "parentPath": ":groups",
        },
        ":groups:beta:shared": {
            "name": "shared",
            "directory": canonical(root / "custom/beta/shared-project"),
            "parentPath": ":groups:beta",
        },
        ":products": {
            "name": "products",
            "directory": canonical(root / "products"),
            "parentPath": ":",
        },
        ":products:store-api": {
            "name": "store-api",
            "directory": canonical(root / "custom/catalog"),
            "parentPath": ":products",
        },
    }


def assert_fixture(dsl: str, runtime_kind: str, installation: Path | None = None) -> None:
    with tempfile.TemporaryDirectory(prefix=f"supi-gradle-{dsl}-") as temporary:
        fixture = Path(temporary) / dsl
        shutil.copytree(FIXTURE_ROOT / dsl, fixture)
        root = fixture / "root"
        included_root = fixture / "included-sibling"
        command = [
            JAVA,
            "-cp",
            os.pathsep.join((str(HELPER_JAR), f"{HELPER_LIB}/*")),
            "GradleObservation",
            canonical(root),
            runtime_kind,
            wrapper_distribution(root) if runtime_kind == "distribution" else str(installation),
            str(int(time.time() * 1000) + 300_000),
        ]
        completed = subprocess.run(
            command,
            input="",
            capture_output=True,
            text=True,
            timeout=330,
            check=False,
        )
        if completed.returncode != 0:
            raise AssertionError(
                f"{dsl} helper exited {completed.returncode}; stderr:\n{completed.stderr}\n"
                f"stdout:\n{completed.stdout}"
            )
        if (
            len(completed.stdout.encode("utf-8")) > 1_048_576
            or not completed.stdout.endswith("\n")
            or completed.stdout.count("\n") != 1
        ):
            raise AssertionError(f"{dsl} helper stdout must be one JSON line bounded to 1 MiB")
        try:
            result = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise AssertionError(
                f"{dsl} helper did not emit one JSON document: {error}; stdout={completed.stdout!r}; "
                f"stderr={completed.stderr!r}"
            ) from error

        if result.get("status") != "complete":
            raise AssertionError(f"{dsl} expected complete observation, got {result!r}")
        if result.get("gradleVersion") != "9.4.0":
            raise AssertionError(f"{dsl} expected pinned Gradle 9.4.0, got {result.get('gradleVersion')!r}")
        if result.get("buildRoot") != canonical(root):
            raise AssertionError(f"{dsl} wrong build root: {result.get('buildRoot')!r}")

        actual_projects = result.get("projects")
        if not isinstance(actual_projects, list):
            raise AssertionError(f"{dsl} projects must be an array")
        actual_by_path = {project["path"]: project for project in actual_projects}
        expected_by_path = expected_projects(root, EXPECTED_ROOTS[dsl])
        if set(actual_by_path) != set(expected_by_path):
            raise AssertionError(
                f"{dsl} logical project paths differ: expected {sorted(expected_by_path)}, "
                f"got {sorted(actual_by_path)}"
            )
        for path, expected in expected_by_path.items():
            project = actual_by_path[path]
            for key, value in expected.items():
                if project.get(key) != value:
                    raise AssertionError(
                        f"{dsl} {path} {key}: expected {value!r}, got {project.get(key)!r}"
                    )
            if project.get("buildRoot") != canonical(root):
                raise AssertionError(f"{dsl} {path} has incorrect buildRoot")
        if actual_by_path[":groups:alpha:shared"]["name"] != actual_by_path[":groups:beta:shared"]["name"]:
            raise AssertionError(f"{dsl} fixture failed to preserve duplicate leaf names")
        if actual_by_path[":groups:alpha:shared"]["directory"] == actual_by_path[":groups:beta:shared"]["directory"]:
            raise AssertionError(f"{dsl} duplicate names did not map to distinct directories")

        expected_included = [{"buildRoot": canonical(included_root)}]
        if result.get("includedBuilds") != expected_included:
            raise AssertionError(
                f"{dsl} included-build references differ: expected {expected_included!r}, "
                f"got {result.get('includedBuilds')!r}"
            )
        print(f"PASS {dsl}: {len(actual_projects)} projects, included sibling, Gradle 9.4.0")


def assert_failures(installation: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="supi-gradle-failures-") as temporary:
        root = Path(temporary)
        (root / "settings.gradle").write_text('throw new GradleException("fixture-initialization-failure")\n', encoding="utf-8")
        for expected, stdin, duration in [
            ("initialization", "", 60_000),
            ("interrupted", "cancel\n", 60_000),
            ("timeout", "", -1),
        ]:
            completed = subprocess.run(
                [JAVA, "-cp", f"{HELPER_LIB}/*", "GradleObservation", canonical(root),
                 "installation", str(installation), str(int(time.time() * 1000) + duration)],
                input=stdin, capture_output=True, text=True, timeout=70, check=True,
            )
            result = json.loads(completed.stdout)
            accepted = {"unavailable", "failed"} if expected == "initialization" else {expected}
            if result.get("status") not in accepted or "projects" in result:
                raise AssertionError(f"{expected} returned misleading evidence: {result!r}")
            print(f"PASS {expected}: {result['status']}, no project evidence")


def main() -> int:
    if not HELPER_JAR.is_file():
        print(f"Missing helper jar: {HELPER_JAR}", file=sys.stderr)
        return 2
    assert_fixture("groovy", "distribution")
    installation = cached_gradle_installation()
    if installation is None:
        raise RuntimeError("Gradle 9.4.0 installation was not found in GRADLE_USER_HOME/wrapper/dists")
    assert_fixture("kotlin", "installation", installation)
    assert_failures(installation)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError, subprocess.SubprocessError, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1) from error
