#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_INSTALL=false
SKIP_DEPS=false
SKIP_BUILD=false
PLATFORM=""
OUTPUT_DIR="packages/coding-agent/allforone-binaries"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --platform)
            PLATFORM="${2:-}"
            [[ -n "$PLATFORM" ]] || { echo "--platform requires a value" >&2; exit 1; }
            shift 2
            ;;
        --out)
            OUTPUT_DIR="${2:-}"
            [[ -n "$OUTPUT_DIR" ]] || { echo "--out requires a value" >&2; exit 1; }
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ "$OUTPUT_DIR" != /* ]]; then
    OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"
fi

if [[ "$SKIP_INSTALL" == "false" ]]; then
    npm ci --ignore-scripts
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
    npm run build
fi

BUN_ENTRYPOINT="packages/coding-agent/dist/bun/cli.js"
AFO_ENTRYPOINT="packages/coding-agent/dist/bun/allforone-cli.js"

[[ -f "$BUN_ENTRYPOINT" ]] || { echo "Missing built Pi Bun entrypoint: $BUN_ENTRYPOINT" >&2; exit 1; }
[[ -f "$AFO_ENTRYPOINT" ]] || { echo "Missing built All-For-One Bun entrypoint: $AFO_ENTRYPOINT" >&2; exit 1; }

TEMP_DIR="$(mktemp -d)"
BASE_OUTPUT="$TEMP_DIR/pi-binaries"
ENTRYPOINT_BACKUP="$TEMP_DIR/cli.js"
cp "$BUN_ENTRYPOINT" "$ENTRYPOINT_BACKUP"

cleanup() {
    cp "$ENTRYPOINT_BACKUP" "$BUN_ENTRYPOINT" 2>/dev/null || true
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Reuse Pi's established cross-platform packaging path with the branded Bun entrypoint.
cp "$AFO_ENTRYPOINT" "$BUN_ENTRYPOINT"

build_args=(--skip-install --skip-build --out "$BASE_OUTPUT")
if [[ "$SKIP_DEPS" == "true" ]]; then
    build_args+=(--skip-deps)
fi
if [[ -n "$PLATFORM" ]]; then
    build_args+=(--platform "$PLATFORM")
fi
./scripts/build-binaries.sh "${build_args[@]}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

if [[ -n "$PLATFORM" ]]; then
    PLATFORMS=("$PLATFORM")
else
    PLATFORMS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64 windows-arm64)
fi

create_unix_alias() {
    local target_dir="$1"
    local alias_name="$2"
    cat > "$target_dir/$alias_name" <<'EOF'
#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIR/allforone" "$@"
EOF
    chmod +x "$target_dir/$alias_name"
}

for platform in "${PLATFORMS[@]}"; do
    source_dir="$BASE_OUTPUT/$platform"
    target_dir="$OUTPUT_DIR/$platform"
    [[ -d "$source_dir" ]] || { echo "Missing base binary directory: $source_dir" >&2; exit 1; }
    cp -R "$source_dir" "$target_dir"

    if [[ "$platform" == windows-* ]]; then
        mv "$target_dir/pi.exe" "$target_dir/allforone.exe"
        printf '@ECHO off\r\n"%%~dp0allforone.exe" %%*\r\n' > "$target_dir/afo.cmd"
        printf '@ECHO off\r\n"%%~dp0allforone.exe" %%*\r\n' > "$target_dir/pi.cmd"
        (
            cd "$target_dir"
            zip -qr "$OUTPUT_DIR/all-for-one-$platform.zip" .
        )
    else
        mv "$target_dir/pi" "$target_dir/allforone"
        create_unix_alias "$target_dir" afo
        create_unix_alias "$target_dir" pi
        (
            cd "$OUTPUT_DIR"
            mv "$platform" allforone
            tar -czf "all-for-one-$platform.tar.gz" allforone
            mv allforone "$platform"
        )
    fi
done

printf '\nAll-For-One binary archives:\n'
find "$OUTPUT_DIR" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.zip' \) -print | sort
