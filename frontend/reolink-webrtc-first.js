const PATCH = Symbol("reolink-webrtc-first");
const CONTROLS_PENDING = Symbol("reolink-controls-pending");
const HLS_ALLOWED = Symbol("reolink-hls-allowed");
const HLS_DEFERRED = Symbol("reolink-hls-deferred");
const HLS_STARTED = Symbol("reolink-hls-started");
const AUDIO_OUTPUT = Symbol("reolink-audio-output");
const MICROPHONE = Symbol("reolink-microphone");
const TRANSCEIVER_PATCH = Symbol("reolink-audio-transceiver");
const QUALITY_MODE = Symbol("reolink-quality-mode");
const QUALITY_ENTITIES = Symbol("reolink-quality-entities");
const DIGITAL_ZOOM = Symbol("reolink-digital-zoom");
const DIGITAL_PAN = Symbol("reolink-digital-pan");
const VIDEO_GESTURE_BIND = Symbol("reolink-video-gesture-bind");
const VIDEO_GESTURE_BOUND = Symbol("reolink-video-gesture-bound");
const CONTROL_SYNC = Symbol("reolink-control-sync");
const QUALITY_TRANSITION = Symbol("reolink-quality-transition");
const ZOOM_REFRESH_STOP = Symbol("reolink-zoom-refresh-stop");
const KEYBOARD_STOP = Symbol("reolink-keyboard-stop");
const INITIAL_COVER = Symbol("reolink-initial-cover");
const INITIAL_FRAME_SHOWN = Symbol("reolink-initial-frame-shown");
const LAYOUT_START = Symbol("reolink-layout-start");
const LAYOUT_STOP = Symbol("reolink-layout-stop");
const FULLSCREEN_STATE = Symbol("reolink-fullscreen-state");
const THUMBNAIL_RETRY = Symbol("reolink-thumbnail-retry");
const THUMBNAIL_PATCH = Symbol("reolink-thumbnail-patch");
const HISTORY_PATCH = Symbol("reolink-history-patch");
const SHEET_GESTURE_STOP = Symbol("reolink-sheet-gesture-stop");
const NAVIGATION_TRAIL_KEY = "reolink-ha-navigation-trail";
const MAX_NAVIGATION_TRAIL = 32;
const lensNamePatches = new WeakMap();
let resumeTimers = [];

const TEXT = {
  pl: {
    clearImage: "Pełny obraz", fluentImage: "Płynny obraz",
    lightOn: "Włącz białe światło", lightOff: "Wyłącz białe światło",
    soundOn: "Włącz dźwięk", soundOff: "Wycisz dźwięk",
    microphoneOn: "Włącz mikrofon", microphoneOff: "Wyłącz mikrofon",
    fullscreen: "Pełny ekran", fullscreenExit: "Wyjdź z pełnego ekranu",
    up: "Góra", down: "Dół", left: "Lewo", right: "Prawo",
    controlPoint: "Punkt kontrolny", zoomOut: "Oddal", zoomIn: "Przybliż",
    profileUnavailable: "Profil {profile} nie jest dostępny",
    noAudio: "Ta kamera nie przekazała ścieżki dźwiękowej",
    audioError: "Nie można włączyć dźwięku",
    connectionPending: "Połączenie z kamerą nie jest jeszcze gotowe",
    microphoneError: "Nie można uruchomić mikrofonu",
    wideLens: "Obiektyw – szeroki", zoomLens: "Obiektyw – zoom",
  },
  en: {
    clearImage: "Clear image", fluentImage: "Fluent image",
    lightOn: "Turn on white light", lightOff: "Turn off white light",
    soundOn: "Turn on sound", soundOff: "Mute sound",
    microphoneOn: "Turn on microphone", microphoneOff: "Turn off microphone",
    fullscreen: "Full screen", fullscreenExit: "Exit full screen",
    up: "Up", down: "Down", left: "Left", right: "Right",
    controlPoint: "Monitoring point", zoomOut: "Zoom out", zoomIn: "Zoom in",
    profileUnavailable: "The {profile} profile is unavailable",
    noAudio: "The camera did not provide an audio track",
    audioError: "Unable to turn on sound",
    connectionPending: "The camera connection is not ready yet",
    microphoneError: "Unable to turn on the microphone",
    wideLens: "Wide lens", zoomLens: "Zoom lens",
  },
};

const languageFor = (hass) => {
  const language = hass?.language || hass?.locale?.language ||
    document.documentElement.lang || navigator.language || "en";
  return language.toLowerCase().startsWith("pl") ? "pl" : "en";
};
const textFor = (hass, key, values = {}) => {
  let value = TEXT[languageFor(hass)][key] || TEXT.en[key] || key;
  Object.entries(values).forEach(([name, replacement]) => {
    value = value.replace(`{${name}}`, replacement);
  });
  return value;
};

const rawHass = () => document.querySelector("home-assistant")?.hass;
const patchLensNames = (hass) => {
  if (!hass?.entities || !hass?.devices) return;
  const language = languageFor(hass);
  const previous = lensNamePatches.get(hass);
  if (previous?.language === language && previous.entities === hass.entities) return;
  Object.entries(hass.entities).forEach(([entityId, entry]) => {
    if (entry.platform !== "reolink" || !entityId.startsWith("camera.")) return;
    const model = String(hass.devices[entry.device_id]?.model || "").toLowerCase();
    let name;
    if (model.includes("trackmix") && /_lens_0$/.test(entry.translation_key || "")) {
      name = textFor(hass, "wideLens");
    } else if (model.includes("trackmix") && /_lens_1$/.test(entry.translation_key || "")) {
      name = textFor(hass, "zoomLens");
    } else if (model.includes("e1 zoom") && /^(main|sub)$/.test(entry.translation_key || "")) {
      name = textFor(hass, "zoomLens");
    }
    if (name && entry.name !== name) {
      try {
        hass.entities[entityId] = { ...entry, name };
      } catch (_err) {
        // A frozen registry retains the native entity label.
      }
    }
  });
  lensNamePatches.set(hass, { language, entities: hass.entities });
};

const peerConnections = [];
const NativePeerConnection = window.RTCPeerConnection;
const WEBRTC_AVAILABLE = typeof NativePeerConnection === "function";
if (NativePeerConnection && !NativePeerConnection[PATCH]) {
  const nativeAddTransceiver = NativePeerConnection.prototype.addTransceiver;
  if (!nativeAddTransceiver[TRANSCEIVER_PATCH]) {
    const audioReadyAddTransceiver = function (trackOrKind, init) {
      if (trackOrKind === "audio" && init?.direction === "recvonly") {
        return nativeAddTransceiver.call(this, trackOrKind, { ...init, direction: "sendrecv" });
      }
      return nativeAddTransceiver.call(this, trackOrKind, init);
    };
    audioReadyAddTransceiver[TRANSCEIVER_PATCH] = true;
    NativePeerConnection.prototype.addTransceiver = audioReadyAddTransceiver;
  }
  const TrackedPeerConnection = new Proxy(NativePeerConnection, {
    construct(Target, args) {
      const peer = Reflect.construct(Target, args);
      peerConnections.push(peer);
      peer.addEventListener("connectionstatechange", () => {
        if (peer.connectionState === "closed") {
          const index = peerConnections.indexOf(peer);
          if (index !== -1) peerConnections.splice(index, 1);
        }
      });
      return peer;
    },
  });
  TrackedPeerConnection[PATCH] = true;
  window.RTCPeerConnection = TrackedPeerConnection;
}

let registryPromise;
const getHass = () => {
  const hass = rawHass();
  patchLensNames(hass);
  return hass;
};
const t = (key, values) => textFor(getHass(), key, values);
const getRegistry = (hass) =>
  (registryPromise ??= hass.callWS({ type: "config/entity_registry/list" }));

let thumbnailEntities;
let thumbnailEntitiesPromise;
const thumbnailSources = new Map();
const getThumbnailEntities = (hass) =>
  (thumbnailEntitiesPromise ??= getRegistry(hass).then((registry) => {
    const streams = new Map();
    registry.forEach((entry) => {
      if (entry.platform !== "reolink" || !entry.entity_id.startsWith("camera.")) return;
      const match = entry.unique_id?.match(/^(.*)_(main|sub)$/);
      if (!match) return;
      const pair = streams.get(match[1]) || {};
      pair[match[2]] = entry.entity_id;
      streams.set(match[1], pair);
    });
    const preferred = new Map();
    streams.forEach((pair) => {
      if (pair.main && pair.sub) preferred.set(pair.main, pair.sub);
    });
    thumbnailEntities = preferred;
    return preferred;
  }));

const composedClosest = (element, selector) => {
  let current = element;
  while (current) {
    if (current.matches?.(selector)) return current;
    current = current.assignedSlot || current.parentElement || current.getRootNode?.()?.host;
  }
  return undefined;
};

const protectCameraGestures = (stream) => {
  if (stream[SHEET_GESTURE_STOP]) return;
  const camera = composedClosest(stream, "more-info-camera");
  if (!camera) return;
  const stop = (event) => event.stopPropagation();
  camera.addEventListener("touchstart", stop, { passive: true });
  stream[SHEET_GESTURE_STOP] = () => camera.removeEventListener("touchstart", stop);
};

const visitOpenRoots = (root, visitor) => {
  root.querySelectorAll?.("*").forEach((element) => {
    visitor(element);
    if (element.shadowRoot) visitOpenRoots(element.shadowRoot, visitor);
  });
};

const refreshVisibleThumbnails = () => {
  if (document.hidden) return;
  visitOpenRoots(document, (element) => {
    if (element.localName !== "hui-image" || !element.cameraImage ||
        element.cameraView === "live") return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 ||
        rect.top >= innerHeight || rect.left >= innerWidth) return;
    Promise.resolve(element._updateCameraImageSrc?.()).catch(() => {});
  });
};

const recoverAfterResume = () => {
  if (document.hidden) return;
  resumeTimers.forEach(clearTimeout);
  resumeTimers = [
    setTimeout(refreshVisibleThumbnails, 250),
    setTimeout(refreshVisibleThumbnails, 2000),
    setTimeout(refreshVisibleThumbnails, 5000),
  ];
};

const currentRoute = () => `${location.pathname}${location.search}${location.hash}`;
const loadNavigationTrail = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(NAVIGATION_TRAIL_KEY) || "[]");
    if (Array.isArray(stored)) {
      return stored.filter((route) => typeof route === "string" && route.startsWith("/"))
        .slice(-MAX_NAVIGATION_TRAIL);
    }
  } catch (_err) {}
  return [];
};
const navigationTrail = loadNavigationTrail();
let lastKnownRoute = currentRoute();
if (navigationTrail.at(-1) !== lastKnownRoute) navigationTrail.push(lastKnownRoute);
const saveNavigationTrail = () => {
  if (navigationTrail.length > MAX_NAVIGATION_TRAIL) {
    navigationTrail.splice(0, navigationTrail.length - MAX_NAVIGATION_TRAIL);
  }
  try {
    sessionStorage.setItem(NAVIGATION_TRAIL_KEY, JSON.stringify(navigationTrail));
  } catch (_err) {}
};
saveNavigationTrail();

const recordNavigation = (replace = false) => {
  const route = currentRoute();
  if (route === lastKnownRoute) return;
  if (replace && navigationTrail.length) navigationTrail[navigationTrail.length - 1] = route;
  else navigationTrail.push(route);
  lastKnownRoute = route;
  saveNavigationTrail();
};

const recordHistoryTraversal = () => {
  const route = currentRoute();
  const previousIndex = navigationTrail.lastIndexOf(route, navigationTrail.length - 2);
  if (previousIndex >= 0) navigationTrail.splice(previousIndex + 1);
  else if (navigationTrail.at(-1) !== route) navigationTrail.push(route);
  lastKnownRoute = route;
  saveNavigationTrail();
};

let backAttempt = 0;
const installHistoryRecovery = () => {
  if (History.prototype[HISTORY_PATCH]) return;
  const nativeBack = History.prototype.back;
  History.prototype.back = function (...args) {
    if (this !== window.history) return nativeBack.apply(this, args);
    const beforeRoute = currentRoute();
    if (navigationTrail.at(-1) !== beforeRoute) {
      navigationTrail.push(beforeRoute);
      lastKnownRoute = beforeRoute;
      saveNavigationTrail();
    }
    const fallbackRoute = navigationTrail.at(-2) || "/";
    const beforeState = this.state;
    const attempt = ++backAttempt;
    const result = nativeBack.apply(this, args);
    setTimeout(() => {
      if (attempt !== backAttempt || document.hidden || currentRoute() !== beforeRoute ||
          history.state !== beforeState) return;
      const targetIndex = navigationTrail.lastIndexOf(fallbackRoute, navigationTrail.length - 2);
      if (targetIndex >= 0) navigationTrail.splice(targetIndex + 1);
      else navigationTrail.splice(0, navigationTrail.length, fallbackRoute);
      lastKnownRoute = fallbackRoute;
      saveNavigationTrail();
      history.replaceState(history.state?.root ? { root: true } : null, "", fallbackRoute);
      window.dispatchEvent(new CustomEvent("location-changed", {
        detail: { replace: true },
      }));
    }, 500);
    return result;
  };
  History.prototype[HISTORY_PATCH] = true;
};
installHistoryRecovery();

const cacheThumbnailSource = (image) => {
  const source = image?._loadedImageSrc || image?._cameraImageSrc;
  if (!source || !image.cameraImage) return;
  thumbnailSources.set(image.cameraImage, source);
  if (!thumbnailEntities) return;
  for (const [main, sub] of thumbnailEntities) {
    if (image.cameraImage === main || image.cameraImage === sub) {
      thumbnailSources.set(main, source);
      thumbnailSources.set(sub, source);
      break;
    }
  }
};

const preferLowResolutionThumbnail = async (image) => {
  const entityId = image.cameraImage;
  const hass = getHass();
  if (!entityId || !hass || image.cameraView === "live" ||
      !composedClosest(image, "ha-panel-security")) return;
  try {
    const entities = thumbnailEntities || await getThumbnailEntities(hass);
    const preferred = entities.get(entityId);
    if (preferred && image.isConnected && image.cameraImage === entityId) {
      image.cameraImage = preferred;
    }
  } catch (_err) {}
};
const callButton = (hass, entityId) => {
  if (entityId) hass.callService("button", "press", { entity_id: entityId });
};

const notify = (stream, message) => stream.dispatchEvent(new CustomEvent("hass-notification", {
  bubbles: true,
  composed: true,
  detail: { message },
}));

const iconButton = (className, label, icon) => {
  const button = document.createElement("ha-icon-button");
  button.className = className;
  button.label = label;
  const glyph = document.createElement("ha-icon");
  glyph.setAttribute("icon", icon);
  button.append(glyph);
  return button;
};

const setIconButton = (button, icon, label, selected = false) => {
  button.querySelector("ha-icon")?.setAttribute("icon", icon);
  button.label = label;
  button.selected = selected;
};

const qualityButton = () => {
  const button = document.createElement("ha-icon-button");
  button.className = "rw-quality";
  const glyph = document.createElement("span");
  glyph.className = "rw-quality-glyph";
  button.append(glyph);
  return button;
};

const setQualityButton = (button, mode) => {
  button.querySelector(".rw-quality-glyph").textContent = mode === "main" ? "HI" : "LO";
  button.label = mode === "main" ? t("clearImage") : t("fluentImage");
  button.selected = false;
};

const livePlayer = (stream) => {
  const webrtc = stream.shadowRoot?.querySelector("ha-web-rtc-player");
  const hls = stream.shadowRoot?.querySelector("ha-hls-player");
  if (webrtc && !webrtc.classList.contains("hidden")) return webrtc;
  if (hls && !hls.classList.contains("hidden")) return hls;
  return webrtc || hls;
};
const liveVideo = (stream) => livePlayer(stream)?.shadowRoot?.querySelector("video");
const peerForStream = (stream) => {
  const playerPeer = livePlayer(stream)?._peerConnection;
  if (playerPeer?.connectionState === "connected") return playerPeer;
  const videoTrack = liveVideo(stream)?.srcObject?.getVideoTracks?.()[0];
  return videoTrack && [...peerConnections].reverse().find(
    (item) => item.connectionState === "connected" &&
      item.getReceivers().some((receiver) => receiver.track === videoTrack)
  );
};

const digitalPanLimits = (player, video, value) => {
  const rect = player.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const aspect = video.videoWidth && video.videoHeight
    ? video.videoWidth / video.videoHeight
    : rect.width / rect.height;
  let pictureWidth = rect.width;
  let pictureHeight = pictureWidth / aspect;
  if (pictureHeight > rect.height) {
    pictureHeight = rect.height;
    pictureWidth = pictureHeight * aspect;
  }
  return {
    x: Math.max(0, (pictureWidth * value - rect.width) / 2),
    y: Math.max(0, (pictureHeight * value - rect.height) / 2),
  };
};

const applyDigitalZoom = (stream, animate = true, selectedPlayer) => {
  const player = selectedPlayer || livePlayer(stream);
  const video = player?.shadowRoot?.querySelector("video");
  if (!player || !video) return;
  const value = stream[DIGITAL_ZOOM] || 1;
  const pan = stream[DIGITAL_PAN] ??= { x: 0, y: 0 };
  const limits = digitalPanLimits(player, video, value);
  pan.x = value === 1 ? 0 : Math.max(-limits.x, Math.min(limits.x, pan.x));
  pan.y = value === 1 ? 0 : Math.max(-limits.y, Math.min(limits.y, pan.y));
  player.style.overflow = "hidden";
  video.style.transform = value === 1
    ? ""
    : `translate3d(${pan.x}px,${pan.y}px,0) scale(${value})`;
  video.style.transformOrigin = "center";
  video.style.transition = animate ? "transform 160ms ease-out" : "none";
  video.style.touchAction = value > 1 ? "none" : "";
  video.style.cursor = value > 1 ? "grab" : "";
};

const bindDigitalPan = (stream, video) => {
  if (video[VIDEO_GESTURE_BOUND]) return;
  video[VIDEO_GESTURE_BOUND] = true;
  let drag;
  const stop = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = undefined;
    video.style.cursor = (stream[DIGITAL_ZOOM] || 1) > 1 ? "grab" : "";
    applyDigitalZoom(stream);
  };
  video.addEventListener("pointerdown", (event) => {
    if ((stream[DIGITAL_ZOOM] || 1) <= 1 || (event.pointerType === "mouse" && event.button !== 0)) return;
    const pan = stream[DIGITAL_PAN] ??= { x: 0, y: 0 };
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    video.setPointerCapture?.(event.pointerId);
    video.style.cursor = "grabbing";
    event.preventDefault();
  });
  video.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pan = stream[DIGITAL_PAN] ??= { x: 0, y: 0 };
    pan.x = drag.panX + event.clientX - drag.startX;
    pan.y = drag.panY + event.clientY - drag.startY;
    applyDigitalZoom(stream, false);
    event.preventDefault();
  });
  video.addEventListener("pointerup", stop);
  video.addEventListener("pointercancel", stop);
};

const releaseQualityTransition = (stream) => {
  const transition = stream[QUALITY_TRANSITION];
  if (!transition) return;
  clearTimeout(transition.timer);
  transition.cover.remove();
  Object.assign(stream.style, transition.streamStyle);
  Object.assign(transition.controls.style, transition.controlsStyle);
  stream[QUALITY_TRANSITION] = undefined;
};

const holdQualityFrame = (stream, targetEntity) => {
  const existing = stream[QUALITY_TRANSITION];
  if (existing) {
    existing.targetEntity = targetEntity;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => releaseQualityTransition(stream), 12000);
    return;
  }
  const player = livePlayer(stream);
  const video = liveVideo(stream);
  const controls = stream.shadowRoot?.querySelector(".rw-controls");
  if (!player || !video || !controls) return;
  const streamRect = stream.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();
  if (!streamRect.height || !playerRect.height) return;

  const cover = document.createElement("div");
  cover.className = "rw-quality-cover";
  Object.assign(cover.style, {
    position: "absolute",
    left: `${playerRect.left - streamRect.left}px`,
    top: `${playerRect.top - streamRect.top}px`,
    width: `${playerRect.width}px`,
    height: `${playerRect.height}px`,
    background: "#000",
    pointerEvents: "none",
    zIndex: "2",
  });
  const fallback = document.createElement("img");
  fallback.alt = "";
  Object.assign(fallback.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transform: video.style.transform,
    transformOrigin: video.style.transformOrigin || "center",
  });
  const fallbackSource = initialPosterForStream(stream);
  if (fallbackSource) {
    fallback.src = fallbackSource;
    cover.append(fallback);
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || Math.max(1, Math.round(playerRect.width));
  canvas.height = video.videoHeight || Math.max(1, Math.round(playerRect.height));
  Object.assign(canvas.style, {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transform: video.style.transform,
    transformOrigin: video.style.transformOrigin || "center",
    transition: "none",
  });
  try {
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const points = [
      [0.25, 0.25], [0.5, 0.25], [0.75, 0.25],
      [0.25, 0.5], [0.5, 0.5], [0.75, 0.5],
      [0.25, 0.75], [0.5, 0.75], [0.75, 0.75],
    ];
    const hasPicture = context && points.some(([x, y]) => {
      const pixel = context.getImageData(
        Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1
      ).data;
      return pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 12;
    });
    if (hasPicture) cover.append(canvas);
  } catch (_err) {}
  stream.shadowRoot.append(cover);

  const transition = {
    cover,
    controls,
    targetEntity,
    oldPlayer: player,
    oldSource: video.srcObject || video.currentSrc || video.src,
    streamStyle: {
      position: stream.style.position,
      height: stream.style.height,
      minHeight: stream.style.minHeight,
      overflow: stream.style.overflow,
    },
    controlsStyle: {
      position: controls.style.position,
      left: controls.style.left,
      right: controls.style.right,
      bottom: controls.style.bottom,
      zIndex: controls.style.zIndex,
    },
  };
  Object.assign(stream.style, {
    position: "relative",
    height: `${streamRect.height}px`,
    minHeight: `${streamRect.height}px`,
    overflow: "hidden",
  });
  Object.assign(controls.style, {
    position: "absolute",
    left: "0",
    right: "0",
    bottom: "0",
    zIndex: "3",
  });
  transition.timer = setTimeout(() => releaseQualityTransition(stream), 12000);
  stream[QUALITY_TRANSITION] = transition;
};

const releaseQualityFrameWhenReady = (stream) => {
  const transition = stream[QUALITY_TRANSITION];
  const player = livePlayer(stream);
  const video = liveVideo(stream);
  if (!transition || !player || !video || stream.stateObj?.entity_id !== transition.targetEntity) return;
  const sourceChanged = player !== transition.oldPlayer ||
    (video.srcObject || video.currentSrc || video.src) !== transition.oldSource;
  if (!sourceChanged || transition.waitingForFrame) return;
  transition.waitingForFrame = true;
  const release = () => {
    if (stream[QUALITY_TRANSITION] !== transition || transition.releasing) return;
    transition.releasing = true;
    if (stream[DIGITAL_ZOOM] != null) applyDigitalZoom(stream, false);
    requestAnimationFrame(() => requestAnimationFrame(() => releaseQualityTransition(stream)));
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(release);
  } else {
    video.addEventListener("loadeddata", release, { once: true });
  }
};

const ensureQuality = (stream) => {
  const mode = stream[QUALITY_MODE];
  const entities = stream[QUALITY_ENTITIES];
  if (!mode || !entities) return true;
  const target = getHass()?.states[entities[mode]];
  if (!target || stream.stateObj?.entity_id === target.entity_id) return true;
  stream.stateObj = target;
  return false;
};

const addControls = async (stream) => {
  const entityId = stream.stateObj?.entity_id;
  const hass = getHass();
  if (!entityId || !hass || stream[CONTROLS_PENDING] || stream.shadowRoot?.querySelector(".rw-controls")) return;
  stream[CONTROLS_PENDING] = true;
  let registry;
  try {
    registry = await getRegistry(hass);
  } catch (_err) {
    stream[CONTROLS_PENDING] = false;
    return;
  }
  const camera = registry.find((entry) => entry.entity_id === entityId);
  if (!camera?.device_id || camera.platform !== "reolink") {
    stream[CONTROLS_PENDING] = false;
    return;
  }
  const entries = registry.filter(
    (entry) => entry.device_id === camera.device_id && entry.platform === "reolink"
  );
  const bySuffix = (suffix) =>
    entries.find((entry) => entry.unique_id?.endsWith(suffix))?.entity_id;
  const cameraPrefix = camera.unique_id?.replace(/_(main|sub)$/, "");
  const quality = {
    main: entries.find((entry) => entry.unique_id === `${cameraPrefix}_main`)?.entity_id,
    sub: entries.find((entry) => entry.unique_id === `${cameraPrefix}_sub`)?.entity_id,
  };
  const deviceZoom = entries.find((entry) => entry.unique_id?.endsWith("_zoom"));
  const digitalZoom = cameraPrefix?.endsWith("_0") && deviceZoom?.unique_id?.endsWith("_1_zoom");
  const ptz = {
    up: bySuffix("_ptz_up"), down: bySuffix("_ptz_down"),
    left: bySuffix("_ptz_left"), right: bySuffix("_ptz_right"),
    stop: bySuffix("_ptz_stop"), home: bySuffix("_guard_go_to"),
    zoom: entries.find((entry) => entry.unique_id === `${cameraPrefix}_zoom`),
  };
  const floodlight = entries.find((entry) => entry.unique_id?.endsWith("_floodlight"))?.entity_id;
  const supportsPtz = ptz.up && ptz.down && ptz.left && ptz.right && ptz.stop;
  const supportsZoom = Boolean(ptz.zoom || digitalZoom);

  if (quality.main && quality.sub) {
    stream[QUALITY_ENTITIES] = quality;
    stream[QUALITY_MODE] ??= "sub";
  }
  if (digitalZoom) stream[DIGITAL_ZOOM] ??= 1;

  const controls = document.createElement("section");
  controls.className = "rw-controls";
  controls.innerHTML = `
    <style>
      .rw-controls{display:block;color:var(--primary-text-color);background:var(--card-background-color);
        border-top:1px solid var(--divider-color);box-sizing:border-box}
      .rw-main{min-height:56px;display:flex;align-items:center;justify-content:center;gap:var(--ha-space-1,4px);
        padding:var(--ha-space-1,4px) var(--ha-space-3,12px);box-sizing:border-box}
      .rw-main ha-icon-button,.rw-ptz-panel ha-icon-button{color:var(--primary-text-color);--ha-icon-button-size:48px}
      .rw-main ha-icon-button[selected]{color:var(--primary-color)}
      .rw-main .rw-mic[selected]{color:var(--error-color)}
      .rw-main .rw-light[selected]{color:var(--state-light-active-color,var(--primary-color))}
      .rw-main .rw-light ha-icon{width:20px;height:20px;--mdc-icon-size:20px}
      .rw-quality-glyph{display:flex;align-items:center;justify-content:center;width:24px;height:24px;
        border:2.25px solid currentColor;border-radius:3px;box-sizing:border-box;font-size:10px;font-weight:900;
        letter-spacing:.02em;line-height:1;font-family:var(--ha-font-family-body,inherit);transform:scale(.72)}
      .rw-ptz-panel{display:flex;align-items:center;justify-content:center;gap:var(--ha-space-6,24px);
        padding:var(--ha-space-3,12px) var(--ha-space-4,16px) var(--ha-space-4,16px);
        background:var(--secondary-background-color);border-top:1px solid var(--divider-color)}
      .rw-ptz-panel[hidden]{display:none}
      .rw-dpad{position:relative;flex:none;width:168px;height:168px;border-radius:50%;
        background:var(--card-background-color);box-shadow:var(--ha-box-shadow-s,0 1px 3px rgba(0,0,0,.2))}
      .rw-dpad ha-icon-button{position:absolute}
      .rw-up{top:4px;left:60px}.rw-left{top:60px;left:4px}.rw-home{top:60px;left:60px}
      .rw-right{top:60px;right:4px}.rw-down{bottom:4px;left:60px}
      .rw-zoom{width:min(240px,42vw);display:flex;flex-direction:column;align-items:stretch;
        gap:var(--ha-space-1,4px)}
      .rw-zoom[hidden]{display:none}
      .rw-zoom-row{display:flex;align-items:center;gap:var(--ha-space-1,4px)}
      .rw-zoom-slider{flex:1;min-width:80px;height:40px;margin:0;accent-color:var(--primary-color);touch-action:none}
      .rw-zoom-value{min-height:20px;color:var(--primary-text-color);font-size:var(--ha-font-size-m,16px);
        font-weight:500;text-align:center;font-variant-numeric:tabular-nums}
      .rw-audio-output{display:none}
      :host(.rw-overlay-controls){position:relative;overflow:hidden;background:#000}
      :host(.rw-overlay-controls) .rw-controls{position:absolute;inset:0;z-index:3;pointer-events:none;
        background:transparent;border:0;overflow:hidden}
      :host(.rw-overlay-controls) .rw-main{position:absolute;right:0;bottom:8px;left:0;z-index:2;
        min-height:48px;padding:0 12px;pointer-events:none;background:transparent}
      :host(.rw-overlay-controls) .rw-main ha-icon-button,
      :host(.rw-overlay-controls) .rw-zoom ha-icon-button{pointer-events:auto;color:#fff!important;
        filter:drop-shadow(0 0 1px rgba(0,0,0,.5)) drop-shadow(0 1px 1px rgba(0,0,0,.5))}
      :host(.rw-overlay-controls) .rw-main ha-icon-button[selected]{color:#fff!important;
        background:rgba(0,0,0,.28);border-radius:50%}
      :host(.rw-overlay-controls) .rw-quality-glyph{color:#fff;text-shadow:0 0 1px rgba(0,0,0,.5)}
      :host(.rw-overlay-controls) .rw-ptz-panel{position:absolute;inset:0;display:block;padding:0;
        pointer-events:none;background:transparent;border:0}
      :host(.rw-overlay-controls) .rw-ptz-panel[hidden]{display:none}
      :host(.rw-overlay-controls) .rw-dpad{position:absolute;bottom:8px;left:8px;width:126px;height:126px;
        box-sizing:border-box;pointer-events:auto;background:rgba(0,0,0,.25);box-shadow:none}
      :host(.rw-overlay-controls) .rw-dpad ha-icon-button{color:#fff!important;--ha-icon-button-size:42px;
        filter:drop-shadow(0 0 1px rgba(0,0,0,.5)) drop-shadow(0 1px 1px rgba(0,0,0,.5))}
      :host(.rw-overlay-controls) .rw-up{top:0;left:42px}
      :host(.rw-overlay-controls) .rw-left{top:42px;left:0}
      :host(.rw-overlay-controls) .rw-home{top:42px;left:42px}
      :host(.rw-overlay-controls) .rw-right{top:42px;right:0}
      :host(.rw-overlay-controls) .rw-down{bottom:0;left:42px}
      :host(.rw-overlay-controls) .rw-zoom{position:absolute;right:8px;bottom:8px;width:min(300px,35%);
        height:48px;display:flex;flex-direction:row;align-items:center;gap:6px;box-sizing:border-box;
        padding:0;pointer-events:auto;background:transparent;box-shadow:none;color:#fff}
      :host(.rw-overlay-controls) .rw-zoom-row{width:auto;flex:1}
      :host(.rw-overlay-controls) .rw-zoom-slider{min-width:0;accent-color:#fff}
      :host(.rw-overlay-controls) .rw-zoom-value{min-width:34px;color:#fff;
        text-shadow:0 1px 1px rgba(0,0,0,.5)}
      :host(.rw-overlay-controls.rw-ptz-open) .rw-main{left:142px;right:min(312px,36%)}
      :host(.rw-dialog-fullscreen){position:relative!important;display:block!important;
        width:100vw!important;height:100dvh!important;min-height:100dvh!important;
        max-width:none!important;background:#000}
      :host(.rw-dialog-fullscreen) ha-web-rtc-player,
      :host(.rw-dialog-fullscreen) ha-hls-player{position:absolute!important;inset:0!important;
        width:100%!important;height:100%!important}
      :host(.rw-dialog-fullscreen) .rw-controls{position:absolute!important;inset:0!important;
        width:100%!important;height:100%!important}
      :host(.rw-dialog-fullscreen) .rw-main{left:0!important;right:0!important}
      :host(.rw-dialog-fullscreen.rw-force-landscape){position:absolute!important;
        inset:0!important;width:var(--rw-force-landscape-width)!important;
        min-width:var(--rw-force-landscape-width)!important;max-width:var(--rw-force-landscape-width)!important;
        height:var(--rw-force-landscape-height)!important;
        min-height:var(--rw-force-landscape-height)!important;max-height:var(--rw-force-landscape-height)!important;
        margin:0!important;transform:none!important;box-sizing:border-box}
      @media(orientation:landscape) and (max-width:740px){
        :host(.rw-overlay-controls.rw-ptz-open) .rw-main{gap:0}
        :host(.rw-overlay-controls.rw-ptz-open) .rw-main ha-icon-button{--ha-icon-button-size:40px}
      }
      @media(orientation:portrait){
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-controls{display:flex;
          position:absolute!important;inset:auto 0 auto 0!important;
          top:var(--rw-portrait-controls-top,calc(50% + 28.125vw))!important;
          width:100vw!important;height:auto!important;flex-direction:column;
          box-sizing:border-box;padding-bottom:max(12px,env(safe-area-inset-bottom,0px))}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-main{position:static!important;
          width:100%;min-height:56px;flex:none;padding:4px 12px}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-ptz-panel{position:static;
          inset:auto;display:flex;align-items:center;justify-content:center;gap:24px;
          flex:none;padding:12px 16px 16px;background:transparent}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-ptz-panel[hidden]{display:none}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-dpad{position:relative;
          inset:auto;flex:none}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-zoom{position:static;
          width:min(240px,42vw);height:auto;display:flex;flex-direction:column;
          align-items:stretch;gap:4px;flex:none}
        :host(.rw-dialog-fullscreen.rw-overlay-controls:not(.rw-force-landscape)) .rw-zoom-row{width:100%}
      }
      @media(max-width:480px){.rw-ptz-panel{justify-content:space-evenly;gap:var(--ha-space-2,8px);
        padding-inline:var(--ha-space-2,8px)}.rw-dpad{flex:none}}
      @media(max-width:350px){.rw-ptz-panel{flex-direction:column}}
    </style>
    <div class="rw-main"></div>
    <div class="rw-ptz-panel">
      <div class="rw-dpad"></div>
      <div class="rw-zoom">
        <span class="rw-zoom-value"></span>
        <div class="rw-zoom-row"><input class="rw-zoom-slider" type="range"></div>
      </div>
    </div>
    <audio class="rw-audio-output" playsinline></audio>`;

  const main = controls.querySelector(".rw-main");
  const qualityToggle = qualityButton();
  setQualityButton(qualityToggle, stream[QUALITY_MODE] || "main");
  const light = iconButton("rw-light", t("lightOn"), "mdi:flashlight-off");
  const speaker = iconButton("rw-speaker", t("soundOn"), "mdi:volume-off");
  const microphone = iconButton("rw-mic", t("microphoneOn"), "mdi:microphone-outline");
  const fullscreen = iconButton("rw-fullscreen", t("fullscreen"), "mdi:fullscreen");
  if (quality.main && quality.sub) main.append(qualityToggle);
  if (floodlight) main.append(light);
  main.append(speaker, microphone, fullscreen);

  const dpad = controls.querySelector(".rw-dpad");
  const directions = [
    ["rw-up", t("up"), "mdi:chevron-up", ptz.up],
    ["rw-left", t("left"), "mdi:chevron-left", ptz.left],
    ["rw-right", t("right"), "mdi:chevron-right", ptz.right],
    ["rw-down", t("down"), "mdi:chevron-down", ptz.down],
  ];
  directions.forEach(([className, label, icon, entity]) => {
    const button = iconButton(className, label, icon);
    dpad.append(button);
    const start = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      callButton(hass, entity);
    };
    const stop = (event) => {
      event.preventDefault();
      callButton(hass, ptz.stop);
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
  });

  const keyboardDirections = new Map([
    ["ArrowUp", ptz.up],
    ["ArrowDown", ptz.down],
    ["ArrowLeft", ptz.left],
    ["ArrowRight", ptz.right],
  ]);
  let activeKeyboardDirection;
  const isEditableEvent = (event) => event.composedPath().some(
    (target) => target instanceof Element &&
      target.matches("input, textarea, select, [contenteditable='true']")
  );
  const stopKeyboardDirection = () => {
    if (!activeKeyboardDirection) return;
    activeKeyboardDirection = undefined;
    callButton(getHass(), ptz.stop);
  };
  const onKeyDown = (event) => {
    const legacyCode = event.which || event.keyCode;
    const zoomDirection = event.key === "+" || event.key === "=" || event.key === "Add" ||
      event.code === "NumpadAdd" || event.code === "Equal" ||
      legacyCode === 107 || legacyCode === 187 ? 1 :
      event.key === "-" || event.key === "Subtract" ||
      event.code === "NumpadSubtract" || event.code === "Minus" ||
      legacyCode === 109 || legacyCode === 189 ? -1 : 0;
    if (zoomDirection && !isEditableEvent(event)) {
      event.preventDefault();
      changeZoom(zoomDirection);
      return;
    }
    const entity = keyboardDirections.get(event.key);
    if (!entity || isEditableEvent(event)) return;
    event.preventDefault();
    if (activeKeyboardDirection === event.key) return;
    if (activeKeyboardDirection) callButton(getHass(), ptz.stop);
    activeKeyboardDirection = event.key;
    callButton(getHass(), entity);
  };
  const onKeyUp = (event) => {
    if (event.key !== activeKeyboardDirection) return;
    event.preventDefault();
    stopKeyboardDirection();
  };
  if (supportsPtz || supportsZoom) {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", stopKeyboardDirection);
    stream[KEYBOARD_STOP] = () => {
      stopKeyboardDirection();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", stopKeyboardDirection);
    };
  }
  const home = iconButton("rw-home", t("controlPoint"), "mdi:crosshairs-gps");
  home.disabled = !ptz.home;
  dpad.append(home);

  const zoom = controls.querySelector(".rw-zoom");
  const zoomValue = controls.querySelector(".rw-zoom-value");
  const zoomSlider = controls.querySelector(".rw-zoom-slider");
  const zoomOut = iconButton("rw-minus", t("zoomOut"), "mdi:minus");
  const zoomIn = iconButton("rw-plus", t("zoomIn"), "mdi:plus");
  const capabilities = {
    ...(getHass()?.states[ptz.zoom?.entity_id]?.attributes || {}),
    ...(ptz.zoom?.capabilities || {}),
  };
  const min = digitalZoom ? 1 : Number(capabilities.min);
  const max = digitalZoom ? 2.5 : Number(capabilities.max);
  const step = digitalZoom ? 0.05 : Number(capabilities.step) || 1;
  if ([min, max, step].every(Number.isFinite)) {
    zoomSlider.min = String(min);
    zoomSlider.max = String(max);
    zoomSlider.step = String(step);
  }
  let zoomTimer;
  let optimisticZoomUntil = 0;
  const factorForZoom = (value) => {
    if (digitalZoom) return value;
    if (![value, min, max].every(Number.isFinite) || max === min) return undefined;
    return min >= 1000 ? value / 1000 : 1 + ((value - min) / (max - min)) * 2;
  };
  const showZoom = (value) => {
    const factor = factorForZoom(value);
    if (!Number.isFinite(factor)) {
      zoomValue.textContent = "";
      return;
    }
    zoomSlider.value = String(value);
    zoomValue.textContent = `${Number(factor.toFixed(2))}×`;
  };
  const sendHardwareZoom = (value, delay = 0) => {
    clearTimeout(zoomTimer);
    optimisticZoomUntil = Date.now() + 5000;
    zoomTimer = setTimeout(() => {
      getHass()?.callService("number", "set_value", {
        entity_id: ptz.zoom.entity_id,
        value,
      });
    }, delay);
  };
  const setZoom = (value, send = false, delay = 0) => {
    if (![value, min, max].every(Number.isFinite)) return;
    value = Math.min(max, Math.max(min, value));
    showZoom(value);
    if (digitalZoom) {
      stream[DIGITAL_ZOOM] = value;
      applyDigitalZoom(stream);
      return;
    }
    if (send && ptz.zoom?.entity_id) sendHardwareZoom(value, delay);
  };
  home.addEventListener("click", () => {
    if (digitalZoom) {
      stream[DIGITAL_PAN] = { x: 0, y: 0 };
      setZoom(1);
    }
    callButton(hass, ptz.home);
  });
  const changeZoom = (direction) => {
    const current = Number(zoomSlider.value);
    const increment = Math.max(step, Math.round((max - min) / 20 / step) * step);
    setZoom(current + direction * (digitalZoom ? 0.25 : increment), true, 180);
  };
  stream[VIDEO_GESTURE_BIND] = digitalZoom
    ? (video) => bindDigitalPan(stream, video)
    : undefined;
  stream.shadowRoot?.querySelectorAll("ha-web-rtc-player,ha-hls-player").forEach((player) => {
    player.updateComplete?.then(() => {
      const video = player.shadowRoot?.querySelector("video");
      if (video) stream[VIDEO_GESTURE_BIND]?.(video);
    });
  });
  zoomOut.disabled = !supportsZoom;
  zoomIn.disabled = !supportsZoom;
  zoomOut.addEventListener("click", () => changeZoom(-1));
  zoomIn.addEventListener("click", () => changeZoom(1));
  const zoomRow = controls.querySelector(".rw-zoom-row");
  zoomRow.prepend(zoomOut);
  zoomRow.append(zoomIn);
  let zoomDragging = false;
  zoomSlider.addEventListener("pointerdown", () => { zoomDragging = true; });
  zoomSlider.addEventListener("input", () => {
    zoomDragging = true;
    if (!digitalZoom) optimisticZoomUntil = Date.now() + 5000;
    showZoom(Number(zoomSlider.value));
  });
  zoomSlider.addEventListener("change", () => {
    zoomDragging = false;
    setZoom(Number(zoomSlider.value), true);
  });
  zoomSlider.addEventListener("pointercancel", () => {
    zoomDragging = false;
    if (digitalZoom) showZoom(stream[DIGITAL_ZOOM] || 1);
  });
  zoom.hidden = !supportsZoom;
  dpad.hidden = !supportsPtz;
  const ptzPanel = controls.querySelector(".rw-ptz-panel");
  ptzPanel.hidden = !supportsPtz && !supportsZoom;
  stream.classList.toggle("rw-ptz-open", !ptzPanel.hidden);

  let zoomRefreshTimer;
  let zoomRefreshPending = false;
  const refreshHardwareZoom = async () => {
    if (digitalZoom || !ptz.zoom?.entity_id || zoomRefreshPending) return;
    zoomRefreshPending = true;
    try {
      const result = await getHass()?.callWS({
        type: "reolink_baichuan_stream/zoom",
        entity_id: ptz.zoom.entity_id,
      });
      const value = Number(result?.value);
      if (controls.isConnected && Number.isFinite(value) && Date.now() >= optimisticZoomUntil) {
        showZoom(value);
      }
    } catch (_err) {} finally {
      zoomRefreshPending = false;
    }
  };
  const stopZoomRefresh = () => {
    clearInterval(zoomRefreshTimer);
    zoomRefreshTimer = undefined;
  };
  const startZoomRefresh = () => {
    stopZoomRefresh();
    refreshHardwareZoom();
    if (!digitalZoom && ptz.zoom?.entity_id) {
      zoomRefreshTimer = setInterval(refreshHardwareZoom, 2000);
    }
  };
  stream[ZOOM_REFRESH_STOP] = stopZoomRefresh;
  if (!ptzPanel.hidden) startZoomRefresh();

  const switchQuality = (mode) => {
    const entityId = stream[QUALITY_ENTITIES]?.[mode];
    const target = getHass()?.states[entityId];
    if (!target) {
      notify(stream, t("profileUnavailable", { profile: mode === "main" ? "HI" : "LO" }));
      return;
    }
    stream[QUALITY_MODE] = mode;
    setQualityButton(qualityToggle, mode);
    if (stream.stateObj?.entity_id === target.entity_id) return;
    stopMicrophone(stream);
    if (stream[AUDIO_OUTPUT]) {
      stream[AUDIO_OUTPUT].pause();
      stream[AUDIO_OUTPUT].srcObject = null;
      stream[AUDIO_OUTPUT] = undefined;
      setIconButton(speaker, "mdi:volume-off", t("soundOn"));
    }
    stream[HLS_ALLOWED] = false;
    stream[HLS_DEFERRED] = false;
    stream[HLS_STARTED] = false;
    holdQualityFrame(stream, target.entity_id);
    stream.stateObj = target;
  };
  qualityToggle.addEventListener("click", () => {
    switchQuality(stream[QUALITY_MODE] === "main" ? "sub" : "main");
  });

  const setLightState = (on) => {
    setIconButton(
      light,
      on ? "mdi:flashlight" : "mdi:flashlight-off",
      on ? t("lightOff") : t("lightOn"),
      on
    );
  };
  light.addEventListener("click", () => {
    if (!floodlight) return;
    const currentHass = getHass();
    const turnOn = currentHass?.states[floodlight]?.state !== "on";
    setLightState(turnOn);
    currentHass?.callService("light", turnOn ? "turn_on" : "turn_off", { entity_id: floodlight });
  });
  speaker.addEventListener("click", async () => {
    const output = controls.querySelector(".rw-audio-output");
    if (stream[AUDIO_OUTPUT]) {
      output.pause();
      output.srcObject = null;
      stream[AUDIO_OUTPUT] = undefined;
      setIconButton(speaker, "mdi:volume-off", t("soundOn"));
      return;
    }
    const track = peerForStream(stream)?.getReceivers()
      .find((receiver) => receiver.track?.kind === "audio")?.track;
    if (!track) {
      notify(stream, t("noAudio"));
      return;
    }
    try {
      output.srcObject = new MediaStream([track]);
      await output.play();
      stream[AUDIO_OUTPUT] = output;
      setIconButton(speaker, "mdi:volume-high", t("soundOff"), true);
    } catch (error) {
      output.srcObject = null;
      notify(stream, error?.message || t("audioError"));
    }
  });
  microphone.addEventListener("click", async () => {
    if (stream[MICROPHONE]) {
      stopMicrophone(stream);
      setIconButton(microphone, "mdi:microphone-outline", t("microphoneOn"));
      return;
    }
    const peer = peerForStream(stream);
    if (!peer) {
      notify(stream, t("connectionPending"));
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = media.getAudioTracks()[0];
      const transceiver = peer.getTransceivers().find(
        (item) => item.receiver.track?.kind === "audio"
      );
      let sender = transceiver?.sender;
      let added = false;
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        sender = peer.addTrack(track, media);
        added = true;
      }
      stream[MICROPHONE] = { peer, sender, track, media, added };
      track.addEventListener("ended", () => {
        stopMicrophone(stream);
        setIconButton(microphone, "mdi:microphone-outline", t("microphoneOn"));
      }, { once: true });
      setIconButton(microphone, "mdi:microphone", t("microphoneOff"), true);
    } catch (error) {
      notify(stream, error?.message || t("microphoneError"));
    }
  });
  const orientation = matchMedia("(orientation: landscape)");
  const isPhone = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 600;
  const isCompanionApp = /\bHome Assistant\//.test(navigator.userAgent);
  const isDesktopBrowser = !isPhone && !isCompanionApp &&
    !/Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
  let manualFullscreen = false;
  let landscapeFullscreenDismissed = false;
  let lastLandscape = orientation.matches;
  let layoutListening = false;
  let landscapeFallbackTimer;
  let browserFullscreenTarget;
  const forcedContainerStyles = [
    "position", "top", "right", "bottom", "left", "width", "min-width", "max-width",
    "height", "min-height", "max-height", "margin", "overflow", "background",
    "transform", "transform-origin",
  ];
  const restoreStyles = (element, styles) => styles?.forEach(({ name, value, priority }) => {
    if (value) element.style.setProperty(name, value, priority);
    else element.style.removeProperty(name);
  });
  const clearLandscapeFallback = (seamless = false) => {
    clearTimeout(landscapeFallbackTimer);
    const state = stream[FULLSCREEN_STATE];
    if (state?.rotationContainer && state.rotationForced) {
      const container = state.rotationContainer;
      const transition = container.style.getPropertyValue("transition");
      const transitionPriority = container.style.getPropertyPriority("transition");
      if (seamless) container.style.setProperty("transition", "none", "important");
      restoreStyles(state.rotationContainer, state.rotationContainerStyles);
      if (seamless) {
        container.getBoundingClientRect();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (transition) container.style.setProperty("transition", transition, transitionPriority);
          else container.style.removeProperty("transition");
        }));
      }
      state.rotationForced = false;
    }
    stream.classList.remove("rw-force-landscape");
    stream.style.removeProperty("--rw-force-landscape-width");
    stream.style.removeProperty("--rw-force-landscape-height");
  };
  const applyLandscapeFallback = () => {
    const state = stream[FULLSCREEN_STATE];
    if (!state?.rotationContainer) return;
    const viewport = window.visualViewport;
    const width = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
    const height = viewport?.height || document.documentElement.clientHeight || window.innerHeight;
    const landscapeWidth = Math.max(width, height);
    const landscapeHeight = Math.min(width, height);
    const set = (name, value) => state.rotationContainer.style.setProperty(name, value, "important");
    set("position", "absolute");
    set("top", "50%");
    set("right", "auto");
    set("bottom", "auto");
    set("left", "50%");
    set("width", `${landscapeWidth}px`);
    set("min-width", `${landscapeWidth}px`);
    set("max-width", `${landscapeWidth}px`);
    set("height", `${landscapeHeight}px`);
    set("min-height", `${landscapeHeight}px`);
    set("max-height", `${landscapeHeight}px`);
    set("margin", "0");
    set("overflow", "hidden");
    set("background", "#000");
    set("transform", "translate(-50%,-50%) rotate(90deg)");
    set("transform-origin", "center center");
    state.rotationForced = true;
    stream.style.setProperty("--rw-force-landscape-width", `${landscapeWidth}px`);
    stream.style.setProperty("--rw-force-landscape-height", `${landscapeHeight}px`);
    stream.classList.add("rw-force-landscape");
  };
  const lockOrientation = async (mode) => {
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock(mode);
        return true;
      }
    } catch (_err) {
      // Try the older API before falling back to a rotated landscape layout.
    }
    try {
      return Boolean(screen.lockOrientation?.(mode));
    } catch (_err) {
      return false;
    }
  };
  const unlockOrientation = () => {
    try {
      screen.orientation?.unlock?.();
      screen.unlockOrientation?.();
    } catch (_err) {}
  };
  const fullscreenStyles = {
    "--dialog-content-padding": "0px",
    "--ha-dialog-width-full": "100vw",
    "--ha-dialog-max-width": "100vw",
    "--safe-width": "100vw",
    "--safe-height": "100dvh",
    "--safe-area-inset-top": "0px",
    "--safe-area-inset-right": "0px",
    "--safe-area-inset-bottom": "0px",
    "--safe-area-inset-left": "0px",
    "--ha-dialog-border-radius": "0px",
    "--ha-dialog-surface-background": "#000",
    overflow: "hidden",
  };
  const browserFullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  const requestBrowserFullscreen = async () => {
    if (!isDesktopBrowser) return false;
    const request = stream.requestFullscreen || stream.webkitRequestFullscreen;
    if (typeof request !== "function") return false;
    try {
      browserFullscreenTarget = stream;
      await Promise.resolve(request.call(stream));
      return true;
    } catch (_err) {
      browserFullscreenTarget = undefined;
      return false;
    }
  };
  const exitBrowserFullscreen = async () => {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!browserFullscreenElement() || typeof exit !== "function") {
      browserFullscreenTarget = undefined;
      return;
    }
    try {
      await Promise.resolve(exit.call(document));
    } catch (_err) {}
    browserFullscreenTarget = undefined;
  };
  const applyFullscreenPlayerStyles = (state) => {
    stream.shadowRoot?.querySelectorAll("ha-web-rtc-player,ha-hls-player").forEach((player) => {
      if (!state.players.has(player)) {
        state.players.set(player, {
          aspectRatio: player.aspectRatio,
          maxHeight: player.style.getPropertyValue("--video-max-height"),
          maxHeightPriority: player.style.getPropertyPriority("--video-max-height"),
        });
      }
      player.aspectRatio = undefined;
      player.style.setProperty("--video-max-height", "100dvh");
      player.requestUpdate?.();
    });
  };
  const setDialogFullscreen = (active) => {
    let state = stream[FULLSCREEN_STATE];
    const entering = active && !state;
    const leaving = !active && Boolean(state);
    const wasActive = stream.classList.contains("rw-dialog-fullscreen");
    const adaptive = state?.adaptive || composedClosest(stream, "ha-adaptive-dialog");
    if (active && adaptive && !state) {
      const camera = composedClosest(stream, "more-info-camera");
      const actions = camera?.shadowRoot?.querySelector(".actions");
      const rotationContainer = composedClosest(stream, ".content-wrapper");
      state = {
        adaptive,
        rotationContainer,
        rotationContainerStyles: rotationContainer && forcedContainerStyles.map((name) => ({
          name,
          value: rotationContainer.style.getPropertyValue(name),
          priority: rotationContainer.style.getPropertyPriority(name),
        })),
        rotationForced: false,
        actions,
        actionsDisplay: actions?.style.getPropertyValue("display"),
        actionsDisplayPriority: actions?.style.getPropertyPriority("display"),
        withoutHeader: adaptive.withoutHeader,
        mode: adaptive.mode,
        styles: Object.keys(fullscreenStyles).map((name) => ({
          name,
          value: adaptive.style.getPropertyValue(name),
          priority: adaptive.style.getPropertyPriority(name),
        })),
        players: new Map(),
      };
      stream[FULLSCREEN_STATE] = state;
    }
    if (active && state) {
      if (entering) {
        state.adaptive.mode = "dialog";
        state.adaptive.withoutHeader = true;
        state.actions?.style.setProperty("display", "none", "important");
        Object.entries(fullscreenStyles).forEach(([name, value]) => {
          state.adaptive.style.setProperty(name, value);
        });
      }
      applyFullscreenPlayerStyles(state);
      state.adaptive.requestUpdate?.();
    } else if (leaving && state) {
      clearLandscapeFallback();
      state.adaptive.withoutHeader = state.withoutHeader;
      state.adaptive.mode = state.mode;
      if (state.actionsDisplay) {
        state.actions?.style.setProperty(
          "display", state.actionsDisplay, state.actionsDisplayPriority
        );
      } else {
        state.actions?.style.removeProperty("display");
      }
      state.styles.forEach(({ name, value, priority }) => {
        if (value) state.adaptive.style.setProperty(name, value, priority);
        else state.adaptive.style.removeProperty(name);
      });
      state.players.forEach(({ aspectRatio, maxHeight, maxHeightPriority }, player) => {
        player.aspectRatio = aspectRatio;
        if (maxHeight) player.style.setProperty("--video-max-height", maxHeight, maxHeightPriority);
        else player.style.removeProperty("--video-max-height");
        player.requestUpdate?.();
      });
      state.adaptive.requestUpdate?.();
      stream[FULLSCREEN_STATE] = undefined;
    }
    if (active !== wasActive) {
      stream.dispatchEvent(new CustomEvent("dialog-set-fullscreen", {
        detail: active, bubbles: true, composed: true,
      }));
    }
    stream.classList.toggle("rw-dialog-fullscreen", active);
  };
  const syncLayout = () => {
    const landscape = orientation.matches;
    if (isPhone && lastLandscape && !landscape && manualFullscreen) {
      manualFullscreen = false;
      unlockOrientation();
    }
    lastLandscape = landscape;
    if (landscape) {
      clearLandscapeFallback(true);
    } else if (stream.classList.contains("rw-force-landscape")) {
      applyLandscapeFallback();
    }
    if (!landscape) landscapeFullscreenDismissed = false;
    const automatic = isPhone && landscape && !landscapeFullscreenDismissed;
    const fullscreenActive = manualFullscreen || automatic;
    setDialogFullscreen(fullscreenActive);
    if (isPhone && manualFullscreen && !landscape &&
        !stream.classList.contains("rw-force-landscape")) {
      applyLandscapeFallback();
    }
    stream.classList.toggle("rw-overlay-controls", landscape || fullscreenActive);
    if (fullscreenActive && !landscape && !stream.classList.contains("rw-force-landscape")) {
      requestAnimationFrame(() => {
        if (!stream.classList.contains("rw-dialog-fullscreen") || orientation.matches) return;
        const video = livePlayer(stream)?.shadowRoot?.querySelector("video");
        const aspect = video?.videoWidth && video?.videoHeight
          ? video.videoWidth / video.videoHeight
          : 16 / 9;
        const rect = stream.getBoundingClientRect();
        const pictureHeight = Math.min(rect.height, rect.width / aspect);
        stream.style.setProperty("--rw-portrait-controls-top", `${(rect.height + pictureHeight) / 2}px`);
      });
    } else {
      stream.style.removeProperty("--rw-portrait-controls-top");
    }
    setIconButton(
      fullscreen,
      fullscreenActive ? "mdi:fullscreen-exit" : "mdi:fullscreen",
      fullscreenActive ? t("fullscreenExit") : t("fullscreen"),
      false
    );
  };
  const startLayout = () => {
    if (!layoutListening) {
      orientation.addEventListener("change", syncLayout);
      window.addEventListener("resize", syncLayout);
      if (isDesktopBrowser) {
        document.addEventListener("fullscreenchange", browserFullscreenChanged);
        document.addEventListener("webkitfullscreenchange", browserFullscreenChanged);
      }
      layoutListening = true;
    }
    syncLayout();
  };
  const browserFullscreenChanged = () => {
    if (browserFullscreenElement()) return;
    browserFullscreenTarget = undefined;
    if (!manualFullscreen) return;
    manualFullscreen = false;
    syncLayout();
  };
  stream[LAYOUT_START] = startLayout;
  stream[LAYOUT_STOP] = () => {
    clearLandscapeFallback();
    orientation.removeEventListener("change", syncLayout);
    window.removeEventListener("resize", syncLayout);
    document.removeEventListener("fullscreenchange", browserFullscreenChanged);
    document.removeEventListener("webkitfullscreenchange", browserFullscreenChanged);
    layoutListening = false;
    unlockOrientation();
    exitBrowserFullscreen();
    setDialogFullscreen(false);
  };
  fullscreen.addEventListener("click", async () => {
    const automatic = isPhone && orientation.matches && !landscapeFullscreenDismissed;
    const fullscreenActive = manualFullscreen || automatic;
    if (fullscreenActive) {
      clearLandscapeFallback();
      manualFullscreen = false;
      landscapeFullscreenDismissed = orientation.matches;
      if (isDesktopBrowser) await exitBrowserFullscreen();
      else lockOrientation("portrait-primary");
      syncLayout();
    } else {
      manualFullscreen = true;
      landscapeFullscreenDismissed = false;
      syncLayout();
      if (isDesktopBrowser) {
        await requestBrowserFullscreen();
        return;
      }
      lockOrientation("landscape").then((locked) => {
        if (!locked && manualFullscreen && !orientation.matches) {
          applyLandscapeFallback();
          syncLayout();
        }
      });
      landscapeFallbackTimer = setTimeout(() => {
        if (manualFullscreen && !orientation.matches) {
          applyLandscapeFallback();
          syncLayout();
        }
      }, 500);
    }
  });
  stream[CONTROL_SYNC] = () => {
    if (stream[QUALITY_MODE]) setQualityButton(qualityToggle, stream[QUALITY_MODE]);
    if (floodlight) setLightState(getHass()?.states[floodlight]?.state === "on");
    if (digitalZoom) {
      if (!zoomDragging) setZoom(stream[DIGITAL_ZOOM] || 1);
    } else if (ptz.zoom?.entity_id) {
      const value = Number(getHass()?.states[ptz.zoom.entity_id]?.state);
      if (Number.isFinite(value) &&
          (Date.now() >= optimisticZoomUntil || Number(zoomSlider.value) === value)) {
        showZoom(value);
      } else if (!zoomValue.textContent && Number.isFinite(min)) {
        showZoom(min);
      }
    }
  };
  stream.shadowRoot.append(controls);
  stream[CONTROL_SYNC]();
  startLayout();
  if (quality.main && quality.sub) queueMicrotask(() => switchQuality(stream[QUALITY_MODE]));
};

const parentStream = (player) => {
  const root = player.getRootNode();
  return root?.host?.localName === "ha-camera-stream" ? root.host : undefined;
};

const stopMicrophone = (stream) => {
  if (!stream[MICROPHONE]) return;
  const { peer, sender, track, media, added } = stream[MICROPHONE];
  if (peer.connectionState !== "closed") {
    if (added) peer.removeTrack(sender);
    else sender.replaceTrack(null).catch(() => {});
  }
  track.stop();
  media.getTracks().forEach((item) => item.stop());
  stream[MICROPHONE] = undefined;
};

const initialPosterForStream = (stream) => {
  const entityId = stream.stateObj?.entity_id;
  const mainEntity = stream[QUALITY_ENTITIES]?.main;
  return thumbnailSources.get(entityId) ||
    thumbnailSources.get(mainEntity) ||
    stream.stateObj?.attributes?.entity_picture ||
    getHass()?.states[mainEntity]?.attributes?.entity_picture;
};

const showInitialFrame = (stream, player, video) => {
  if (stream[INITIAL_FRAME_SHOWN]) return;
  const mainEntity = stream[QUALITY_ENTITIES]?.main;
  const entityId = stream.stateObj?.entity_id;
  const sources = [
    thumbnailSources.get(entityId),
    thumbnailSources.get(mainEntity),
    stream.stateObj?.attributes?.entity_picture,
    getHass()?.states[mainEntity]?.attributes?.entity_picture,
  ].filter((source, index, values) => source && values.indexOf(source) === index);
  if (!sources.length || stream[INITIAL_COVER]?.isConnected) return;
  stream[INITIAL_FRAME_SHOWN] = true;
  const cover = document.createElement("img");
  cover.alt = "";
  Object.assign(cover.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    objectFit: "contain", background: "#000", pointerEvents: "none", zIndex: "2",
  });
  player.style.position = "relative";
  player.shadowRoot?.append(cover);
  stream[INITIAL_COVER] = cover;
  const release = () => {
    if (stream[INITIAL_COVER] === cover) stream[INITIAL_COVER] = undefined;
    cover.remove();
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(release);
  } else {
    video.addEventListener("loadeddata", release, { once: true });
  }
  cover.addEventListener("error", () => {
    const next = sources.shift();
    if (next) cover.src = next;
    else release();
  });
  cover.src = sources.shift();
};

const enforcePlayer = (stream) => {
  if (!stream.shadowRoot) return;
  protectCameraGestures(stream);
  if (!ensureQuality(stream)) return;
  const hls = stream.shadowRoot.querySelector("ha-hls-player");
  const webrtc = stream.shadowRoot.querySelector("ha-web-rtc-player");
  if (!WEBRTC_AVAILABLE) stream[HLS_ALLOWED] = true;
  hls?.classList.toggle("hidden", !stream[HLS_ALLOWED]);
  webrtc?.classList.toggle("hidden", Boolean(stream[HLS_ALLOWED]));
  stream.shadowRoot.querySelectorAll("ha-web-rtc-player,ha-hls-player").forEach((player) => {
    const initialPoster = initialPosterForStream(stream);
    player.controls = false;
    player.muted = false;
    player.fitMode = "contain";
    if (initialPoster && !player.posterUrl) player.posterUrl = initialPoster;
    player.updateComplete?.then(() => {
      const video = player.shadowRoot?.querySelector("video");
      if (video) {
        video.controls = false;
        video.style.objectFit = "contain";
        stream[VIDEO_GESTURE_BIND]?.(video);
        if (stream[DIGITAL_ZOOM] != null) applyDigitalZoom(stream);
        if (!video.poster && initialPoster) video.poster = initialPoster;
        if (player === livePlayer(stream)) showInitialFrame(stream, player, video);
        // Keep the picture element muted. Camera audio uses a separate audio
        // element so enabling sound never restarts or blanks the video on iOS.
        video.muted = true;
        video.playsInline = true;
      }
    });
  });
  addControls(stream);
  stream[LAYOUT_START]?.();
  stream[CONTROL_SYNC]?.();
  releaseQualityFrameWhenReady(stream);
};

Promise.all([
  customElements.whenDefined("ha-camera-stream"),
  customElements.whenDefined("ha-hls-player"),
  customElements.whenDefined("ha-web-rtc-player"),
]).then(() => {
  const hass = rawHass();
  patchLensNames(hass);
  if (hass) getThumbnailEntities(hass).catch(() => {});
  window.addEventListener("location-changed", () => {
    queueMicrotask(() => patchLensNames(rawHass()));
    setTimeout(refreshVisibleThumbnails, 100);
  });
  const CameraStream = customElements.get("ha-camera-stream");
  const HlsPlayer = customElements.get("ha-hls-player");
  const WebRtcPlayer = customElements.get("ha-web-rtc-player");
  if (CameraStream.prototype[PATCH]) return;
  CameraStream.prototype[PATCH] = true;

  const hlsConnected = HlsPlayer.prototype.connectedCallback;
  HlsPlayer.prototype.connectedCallback = function () {
    const stream = parentStream(this);
    if (stream && !stream[HLS_ALLOWED]) {
      this[HLS_DEFERRED] = true;
      return;
    }
    this[HLS_STARTED] = true;
    hlsConnected.call(this);
  };

  const webrtcConnected = WebRtcPlayer.prototype.connectedCallback;
  WebRtcPlayer.prototype.connectedCallback = function () {
    webrtcConnected.call(this);
    this.addEventListener("streams", (event) => {
      const stream = parentStream(this);
      if (!stream) return;
      if (event.detail?.hasVideo) {
        stream[HLS_ALLOWED] = false;
        // Keep HA from reordering both keyed players after WebRTC succeeds.
        // That reorder disconnects the active peer connection in this frontend version.
        event.stopImmediatePropagation();
        enforcePlayer(stream);
        return;
      }
      if (event.detail?.hasVideo !== false) return;
      stream[HLS_ALLOWED] = true;
      const hls = stream.shadowRoot?.querySelector("ha-hls-player");
      hls?.classList.remove("hidden");
      this.classList.add("hidden");
      if (hls?.[HLS_DEFERRED] && !hls[HLS_STARTED]) {
        hls[HLS_STARTED] = true;
        hlsConnected.call(hls);
      }
      this._cleanUp?.();
    }, { capture: true });
  };

  const connected = CameraStream.prototype.connectedCallback;
  CameraStream.prototype.connectedCallback = function () {
    this.controls = false;
    this.muted = false;
    if (!WEBRTC_AVAILABLE) this[HLS_ALLOWED] = true;
    const initialPoster = initialPosterForStream(this);
    if (initialPoster) this._posterUrl = initialPoster;
    connected.call(this);
    this.updateComplete?.then(() => enforcePlayer(this));
  };
  const updated = CameraStream.prototype.updated;
  CameraStream.prototype.updated = function (changed) {
    updated?.call(this, changed);
    if (this.controls) this.controls = false;
    if (this.muted) this.muted = false;
    queueMicrotask(() => enforcePlayer(this));
  };
  const disconnected = CameraStream.prototype.disconnectedCallback;
  CameraStream.prototype.disconnectedCallback = function () {
    releaseQualityTransition(this);
    this[INITIAL_COVER]?.remove();
    this[INITIAL_COVER] = undefined;
    this[KEYBOARD_STOP]?.();
    this[KEYBOARD_STOP] = undefined;
    this[SHEET_GESTURE_STOP]?.();
    this[SHEET_GESTURE_STOP] = undefined;
    this[ZOOM_REFRESH_STOP]?.();
    this[LAYOUT_STOP]?.();
    stopMicrophone(this);
    if (this[AUDIO_OUTPUT]) {
      this[AUDIO_OUTPUT].pause();
      this[AUDIO_OUTPUT].srcObject = null;
      this[AUDIO_OUTPUT] = undefined;
    }
    disconnected.call(this);
  };
});

customElements.whenDefined("hui-image").then(() => {
  const HuiImage = customElements.get("hui-image");
  if (HuiImage.prototype[THUMBNAIL_PATCH]) return;
  HuiImage.prototype[THUMBNAIL_PATCH] = true;
  const updateThumbnail = HuiImage.prototype._updateCameraImageSrc;
  if (!updateThumbnail) return;
  HuiImage.prototype._updateCameraImageSrc = async function () {
    await preferLowResolutionThumbnail(this);
    let result;
    try {
      result = await updateThumbnail.call(this);
    } finally {
      cacheThumbnailSource(this);
      clearTimeout(this[THUMBNAIL_RETRY]);
      this[THUMBNAIL_RETRY] = setTimeout(() => {
        if (this.isConnected && this._loadState === 1 && this._imageVisible !== false &&
            !document.hidden) {
          this._updateCameraImageSrc().catch(() => {});
        }
      }, 2000);
    }
    return result;
  };
});

document.addEventListener("pointerdown", (event) => {
  const image = event.composedPath?.().find((item) => item.localName === "hui-image");
  if (image) cacheThumbnailSource(image);
}, { capture: true });
document.addEventListener("visibilitychange", recoverAfterResume);
window.addEventListener("pageshow", recoverAfterResume);
window.addEventListener("focus", recoverAfterResume);
window.addEventListener("location-changed", (event) => recordNavigation(Boolean(event.detail?.replace)));
window.addEventListener("popstate", recordHistoryTraversal);
