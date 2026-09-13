"""Use Reolink's native Baichuan stream with the Home Assistant go2rtc provider."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import ipaddress
import logging
from typing import Any
from urllib.parse import quote

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.go2rtc import WebRTCProvider
from homeassistant.components.go2rtc.util import get_camera_identifier
from homeassistant.components.reolink.camera import ReolinkCamera
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.typing import ConfigType

DOMAIN = "reolink_baichuan_stream"
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)

_LOGGER = logging.getLogger(__name__)
_PATCH_MARKER = "_reolink_baichuan_stream_original"
_SUPPORTED_STREAMS = {"main", "sub"}
_STREAM_LOCKS: dict[str, asyncio.Lock] = {}
_ZOOM_LOCKS: dict[str, asyncio.Lock] = {}


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/zoom",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def websocket_zoom(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Read the current camera-controlled zoom position directly from the camera."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    if (
        entity is None
        or entity.platform != "reolink"
        or not entity.unique_id.endswith("_zoom")
        or entity.config_entry_id is None
    ):
        connection.send_error(msg["id"], "not_found", "Reolink zoom entity not found")
        return
    config_entry = hass.config_entries.async_get_entry(entity.config_entry_id)
    if config_entry is None or config_entry.domain != "reolink":
        connection.send_error(msg["id"], "not_found", "Reolink device not found")
        return

    host = config_entry.runtime_data.host
    channel = 0
    if host.api.is_nvr:
        unique_prefix = entity.unique_id.removesuffix("_zoom")
        for candidate in host.api.channels:
            if unique_prefix.endswith(f"_{candidate}"):
                channel = candidate
                break
    try:
        async with _ZOOM_LOCKS.setdefault(entity.config_entry_id, asyncio.Lock()):
            response = await host.api.send(
                [
                    {
                        "cmd": "GetZoomFocus",
                        "action": 0,
                        "param": {"channel": channel},
                    }
                ],
                expected_response_type="json",
            )
            value = response[0]["value"]["ZoomFocus"]["zoom"]["pos"]
            host.api.map_channels_json_response(response, [channel], [-1])
            config_entry.runtime_data.device_coordinator.async_set_updated_data(None)
            zoom_range = host.api.zoom_range(channel)["zoom"]
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Unable to read current Reolink zoom position")
        connection.send_error(msg["id"], "zoom_unavailable", "Unable to read zoom")
        return
    connection.send_result(
        msg["id"],
        {"value": value, "min": zoom_range["min"], "max": zoom_range["max"]},
    )


def _format_host(host: str) -> str:
    """Add URL brackets around IPv6 addresses."""
    try:
        return f"[{host}]" if ipaddress.ip_address(host).version == 6 else host
    except ValueError:
        return host


def _sources(
    hass: HomeAssistant, camera: ReolinkCamera, identifier: str
) -> list[str] | None:
    """Build video, talkback and browser-audio sources for one camera."""
    stream = camera.entity_description.stream
    if stream not in _SUPPORTED_STREAMS:
        return None

    host = str(camera._host.api.host)
    for entry in hass.config_entries.async_entries("reolink"):
        if str(entry.data.get(CONF_HOST)) != host:
            continue
        username = entry.data.get(CONF_USERNAME)
        password = entry.data.get(CONF_PASSWORD)
        if not isinstance(username, str) or not isinstance(password, str):
            return None
        prefix = (
            f"reolink://{quote(username, safe='')}:{quote(password, safe='')}"
            f"@{_format_host(host)}"
        )
        video = f"{prefix}/{stream}?channel={camera._channel}"
        # Standalone multi-lens cameras expose their physical speaker on channel 0.
        # NVR channels represent separate cameras and keep their own channel number.
        talkback_channel = camera._channel if camera._host.api.is_nvr else 0
        talkback_query = f"channel={talkback_channel}"
        if stream == "main" or camera._channel != talkback_channel:
            # Keep this source audio-only. Otherwise clients without H.265 can
            # silently select its low-resolution H.264 video while in HI mode.
            talkback_query += "&video=false"
        talkback = f"{prefix}/sub?{talkback_query}"
        sources = [video]
        if talkback != video:
            sources.append(talkback)
        sources.append(f"ffmpeg:{identifier}#audio=opus#query=log_level=debug")
        return sources
    return None


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Feed Baichuan only to go2rtc; retain RTSP for HA's optional HLS fallback."""
    del config
    if hasattr(WebRTCProvider, _PATCH_MARKER):
        return True

    websocket_api.async_register_command(hass, websocket_zoom)

    original: Callable = WebRTCProvider._update_stream_source

    async def update_stream_source(self: WebRTCProvider, camera) -> None:
        if not isinstance(camera, ReolinkCamera):
            await original(self, camera)
            return
        identifier = get_camera_identifier(camera)
        if not (sources := _sources(hass, camera, identifier)):
            await original(self, camera)
            return
        if not self.async_is_supported(sources[0]):
            await original(self, camera)
            return
        lock = _STREAM_LOCKS.setdefault(identifier, asyncio.Lock())
        async with lock:
            # The go2rtc fork adds fields unsupported by the typed HA client.
            # Reading JSON directly avoids decoding fields unused here.
            stream_client = self._rest_client.streams
            response = await stream_client._client.request(  # noqa: SLF001
                "GET", stream_client.PATH
            )
            streams = await response.json()
            if isinstance(streams, dict) and identifier in streams:
                return
            await stream_client.add(identifier, sources)

    setattr(WebRTCProvider, _PATCH_MARKER, original)
    WebRTCProvider._update_stream_source = update_stream_source
    _LOGGER.info("Reolink WebRTC streams will use the native Baichuan source")
    return True
