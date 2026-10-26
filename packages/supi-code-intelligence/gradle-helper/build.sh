#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$HERE/lib"
SOURCE="$HERE/src/GradleObservation.java"
mkdir -p "$LIB_DIR"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

download_verified() {
  local filename="$1" expected="$2" url="$3" destination="$LIB_DIR/$1"
  local current temporary actual
  if [[ -f "$destination" ]]; then
    current="$(sha256 "$destination")"
    if [[ "$current" == "$expected" ]]; then
      chmod 644 "$destination"
      return
    fi
    printf 'Checksum mismatch for cached %s; downloading a fresh copy.\n' "$filename" >&2
  fi
  temporary="$(mktemp "$LIB_DIR/.${filename}.XXXXXX")"
  trap 'rm -f "$temporary"' RETURN
  curl --fail --location --silent --show-error "$url" --output "$temporary"
  actual="$(sha256 "$temporary")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'SHA-256 mismatch for %s: expected %s, got %s\n' "$filename" "$expected" "$actual" >&2
    return 1
  fi
  chmod 644 "$temporary"
  mv "$temporary" "$destination"
  trap - RETURN
}

REPOSITORY=https://repo.gradle.org/gradle/libs-releases
download_verified \
  gradle-tooling-api-9.4.0.jar \
  18e900ab3fcdf77a8076ccee1897b89789f1eac654585ec33b308619b9d3f1ef \
  "$REPOSITORY/org/gradle/gradle-tooling-api/9.4.0/gradle-tooling-api-9.4.0.jar"
download_verified \
  slf4j-api-2.0.17.jar \
  7b751d952061954d5abfed7181c1f645d336091b679891591d63329c622eb832 \
  "$REPOSITORY/org/slf4j/slf4j-api/2.0.17/slf4j-api-2.0.17.jar"
download_verified \
  slf4j-simple-2.0.17.jar \
  ddfea59ac074c6d3e24ac2c38622d2d963895e17f70b38ed4bdae4d780be6964 \
  "$REPOSITORY/org/slf4j/slf4j-simple/2.0.17/slf4j-simple-2.0.17.jar"

BUILD_DIR="$(mktemp -d "$HERE/.build.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir -p "$BUILD_DIR/classes"
javac --release 17 -encoding UTF-8 -classpath "$LIB_DIR/*" -d "$BUILD_DIR/classes" "$SOURCE"
printf 'Manifest-Version: 1.0\nMain-Class: GradleObservation\n\n' > "$BUILD_DIR/MANIFEST.MF"

set --
while IFS= read -r class_file; do
  set -- "$@" -C "$BUILD_DIR/classes" "${class_file#./}"
done < <(cd "$BUILD_DIR/classes" && find . -type f -print | LC_ALL=C sort)
jar --create \
  --file "$BUILD_DIR/supi-gradle-observation.jar" \
  --date=2020-01-01T00:00:00Z \
  --manifest "$BUILD_DIR/MANIFEST.MF" \
  "$@"
chmod 644 "$BUILD_DIR/supi-gradle-observation.jar"
mv "$BUILD_DIR/supi-gradle-observation.jar" "$LIB_DIR/supi-gradle-observation.jar"
printf 'Built Java 17 helper: %s\n' "$LIB_DIR/supi-gradle-observation.jar"
printf 'SHA-256: %s\n' "$(sha256 "$LIB_DIR/supi-gradle-observation.jar")"
