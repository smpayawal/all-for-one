#!/usr/bin/env sh
set -eu

REPOSITORY="${AFO_REPOSITORY:-smpayawal/all-for-one}"
API_URL="${AFO_RELEASE_API_URL:-https://api.github.com/repos/${REPOSITORY}/releases?per_page=20}"
DOWNLOAD_BASE="${AFO_RELEASE_DOWNLOAD_BASE:-https://github.com/${REPOSITORY}/releases/download}"
INSTALL_DIR="${AFO_INSTALL_DIR:-${HOME}/.local/share/all-for-one}"
BIN_DIR="${AFO_BIN_DIR:-${HOME}/.local/bin}"

fail() {
	printf 'All-For-One install failed: %s\n' "$1" >&2
	exit 1
}

download() {
	url="$1"
	output="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$output"
	elif command -v wget >/dev/null 2>&1; then
		wget -qO "$output" "$url"
	else
		fail "curl or wget is required"
	fi
}

download_stdout() {
	url="$1"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url"
	elif command -v wget >/dev/null 2>&1; then
		wget -qO- "$url"
	else
		fail "curl or wget is required"
	fi
}

resolve_tag() {
	if [ -n "${AFO_VERSION:-}" ]; then
		case "$AFO_VERSION" in
			afo-v*) printf '%s\n' "$AFO_VERSION" ;;
			*) printf 'afo-v%s\n' "$AFO_VERSION" ;;
		esac
		return
	fi

	releases="$(download_stdout "$API_URL")"
	tag="$(printf '%s\n' "$releases" | sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\(afo-v[^"]*\)".*/\1/p' | head -n 1)"
	[ -n "$tag" ] || fail "no published All-For-One release was found"
	printf '%s\n' "$tag"
}

case "$(uname -s)" in
	Darwin) platform="darwin" ;;
	Linux) platform="linux" ;;
	*) fail "unsupported operating system: $(uname -s)" ;;
esac

case "$(uname -m)" in
	x86_64|amd64) architecture="x64" ;;
	arm64|aarch64) architecture="arm64" ;;
	*) fail "unsupported architecture: $(uname -m)" ;;
esac

tag="$(resolve_tag)"
case "$tag" in
	afo-v*[!0-9A-Za-z.-]*|afo-v) fail "invalid release version: $tag" ;;
	afo-v*) ;;
	*) fail "invalid release version: $tag" ;;
esac
asset="all-for-one-${platform}-${architecture}.tar.gz"
release_url="${DOWNLOAD_BASE}/${tag}"

temp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t all-for-one)"
cleanup() {
	rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

archive="$temp_dir/$asset"
checksums="$temp_dir/SHA256SUMS"
download "$release_url/$asset" "$archive"
download "$release_url/SHA256SUMS" "$checksums"

expected="$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset { print $1; exit }' "$checksums")"
[ -n "$expected" ] || fail "checksum for $asset was not found"

if command -v sha256sum >/dev/null 2>&1; then
	actual="$(sha256sum "$archive" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
	actual="$(shasum -a 256 "$archive" | awk '{ print $1 }')"
else
	fail "sha256sum or shasum is required"
fi

[ "$actual" = "$expected" ] || fail "checksum verification failed for $asset"

tar -xzf "$archive" -C "$temp_dir"
[ -x "$temp_dir/allforone/allforone" ] || fail "release archive does not contain the allforone executable"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"
BIN_DIR="$(cd "$BIN_DIR" && pwd)"
target="$INSTALL_DIR/$tag"
rm -rf "$target"
mv "$temp_dir/allforone" "$target"
rm -rf "$INSTALL_DIR/current"
ln -s "$target" "$INSTALL_DIR/current"
ln -sfn "$INSTALL_DIR/current/allforone" "$BIN_DIR/allforone"
ln -sfn "$INSTALL_DIR/current/afo" "$BIN_DIR/afo"

if [ "${AFO_INSTALL_PI_ALIAS:-0}" = "1" ] || ! command -v pi >/dev/null 2>&1; then
	ln -sfn "$INSTALL_DIR/current/pi" "$BIN_DIR/pi"
fi

printf 'Installed All-For-One %s\n' "${tag#afo-v}"
printf 'Run: %s/allforone\n' "$BIN_DIR"

case ":${PATH:-}:" in
	*":$BIN_DIR:"*) ;;
	*) printf 'Add %s to PATH to run allforone from any directory.\n' "$BIN_DIR" ;;
esac
