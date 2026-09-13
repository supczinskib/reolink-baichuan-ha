#!/bin/sh
set -eu

BASE_COMMIT=78de4806a929e2bd77d7acad07e337ef53c09fd2
DELAY_FIX_COMMIT=092ae6e2eca3afb3f439ecbd69a99785c816d953
REPOSITORY=https://github.com/fzurita/go2rtc.git
OUTPUT=${1:-./go2rtc}
case "$OUTPUT" in
  /*) ;;
  *) OUTPUT="$(pwd)/$OUTPUT" ;;
esac

WORK=$(mktemp -d "${TMPDIR:-/tmp}/go2rtc-reolink-build.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
git clone --filter=blob:none "$REPOSITORY" "$WORK"
git -C "$WORK" checkout --detach "$BASE_COMMIT"
git -C "$WORK" cherry-pick "$DELAY_FIX_COMMIT"
(cd "$WORK" && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$OUTPUT" .)
"$OUTPUT" -version
