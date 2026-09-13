#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the Home Assistant host." >&2
  exit 1
fi

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HA_CONFIG=${HA_CONFIG:-/var/lib/homeassistant}

install -d -o homeassistant -g homeassistant "$HA_CONFIG/custom_components/reolink_baichuan_stream"
install -m 0644 -o homeassistant -g homeassistant \
  "$ROOT/custom_components/reolink_baichuan_stream/__init__.py" \
  "$ROOT/custom_components/reolink_baichuan_stream/manifest.json" \
  "$HA_CONFIG/custom_components/reolink_baichuan_stream/"
install -d -o homeassistant -g homeassistant "$HA_CONFIG/www"
install -m 0644 -o homeassistant -g homeassistant \
  "$ROOT/frontend/reolink-webrtc-first.js" "$HA_CONFIG/www/"
install -m 0644 "$ROOT/systemd/go2rtc.service" /etc/systemd/system/go2rtc.service

echo "Files installed. Add the documented YAML entries, install the pinned go2rtc binary, then restart services."
