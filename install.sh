#!/usr/bin/env bash
# Install the latest lilac-tui binary from GitHub Releases.
#
# The lilac-tui binary has the lilac CLI embedded inside it — no separate
# lilac install required.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tarkaai/lilac-tui/main/install.sh | bash
#   curl -fsSL .../install.sh | VERSION=v0.1.0 bash
#   curl -fsSL .../install.sh | PREFIX=$HOME/.local bash
set -euo pipefail

REPO="tarkaai/lilac-tui"
VERSION="${VERSION:-latest}"
PREFIX="${PREFIX:-/usr/local}"
BIN_DIR="$PREFIX/bin"

os="$(uname -s)"
if [ "$os" != "Linux" ]; then
  echo "lilac-tui releases are Linux-only (detected: $os)" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) arch="x64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

asset="lilac-tui-linux-$arch"
if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$VERSION/$asset"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "downloading $asset from $VERSION…"
curl -fsSL -o "$tmp/lilac-tui" "$url"
curl -fsSL -o "$tmp/lilac-tui.sha256" "$url.sha256" || true

if [ -s "$tmp/lilac-tui.sha256" ]; then
  (cd "$tmp" && sha256sum -c lilac-tui.sha256 >/dev/null) && echo "checksum ok"
fi

chmod +x "$tmp/lilac-tui"

if [ -w "$BIN_DIR" ] 2>/dev/null || { [ ! -e "$BIN_DIR" ] && mkdir -p "$BIN_DIR" 2>/dev/null; }; then
  mv "$tmp/lilac-tui" "$BIN_DIR/lilac-tui"
else
  echo "installing to $BIN_DIR requires sudo…"
  sudo mkdir -p "$BIN_DIR"
  sudo mv "$tmp/lilac-tui" "$BIN_DIR/lilac-tui"
fi

echo "installed: $BIN_DIR/lilac-tui"
command -v lilac-tui >/dev/null || echo "note: $BIN_DIR is not on PATH — add it to your shell profile."
