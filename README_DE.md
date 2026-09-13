# Reolink Baichuan WebRTC für Home Assistant

[English](README.md) · [Polski](README_PL.md)

> **Reolink-Livevideo mit geringer Verzögerung und integrierter Kamerasteuerung in der Standardoberfläche von Home Assistant.**

```text
Reolink-Kamera <-> Baichuan <-> go2rtc <-> WebRTC <-> Home Assistant
```

Dieses Community-Projekt erweitert den Standard-Kameradialog von Home
Assistant um schnelles Livevideo, Qualitätswahl, Unterstützung mehrerer
Objektive, PTZ, Zoom, Scheinwerfersteuerung und Gegensprechen. Es verwendet die
Entitäten der offiziellen Reolink-Integration und fügt weder ein separates
Dashboard noch eine Lovelace-Karte hinzu.

Autor und Betreuer: **Bartosz Supcziński** — <bartek@env.pl>

## Zweck des Projekts

Home Assistant stellt erweiterte Reolink-Funktionen als getrennte Entitäten
bereit. Der Standard-Kameradialog fasst sie nicht zu einer gemeinsamen
Kamerasteuerung zusammen, und der normale RTSP/HLS-Pfad kann den Bildstart
verzögern. Dieses Projekt leitet den nativen Baichuan-Stream über go2rtc und
erweitert den vorhandenen Dialog, ohne die Reolink-Integration zu ersetzen.

## Oberfläche

Der Kameradialog passt sich an Hochformat, Querformat und Vollbild an. Die
Abbildung zeigt die normale mobile Ansicht und die Vollbildansicht im
Querformat.

![Reolink-Kamerasteuerung in Home Assistant](docs/images/reolink.png)

## Funktionen

### Video

- Native Reolink-Baichuan-Quelle für go2rtc.
- WebRTC als bevorzugter Browserpfad.
- Automatischer HLS-Ersatz in Clients ohne WebRTC.
- LO- und HI-Profile über die Reolink-Streams `sub` und `main`.
- Miniaturbilder mit niedriger Auflösung in Home-Assistant-Bereichsansichten.
- Das letzte Miniaturbild oder Videobild bleibt beim Start und beim
  Qualitätswechsel sichtbar.
- `contain`-Darstellung ohne Abschneiden des Kamerabildes.

### Kamerasteuerung

- PTZ-Richtungssteuerung.
- Rückkehr zum in der Kamera gespeicherten Kontrollpunkt.
- Digitalzoom für das Weitwinkelobjektiv der TrackMix.
- Kameragesteuerter Hybridzoom der TrackMix und optischer Zoom der E1 Zoom.
- Direkte Abfrage der aktuellen Zoom-Einstellung der Kamera.
- Sofortige Bewegung des Reglers und ein Kamerabefehl beim Loslassen.
- Verschieben eines lokal vergrößerten Weitwinkelbildes.
- Scheinwerfersteuerung, wenn die Reolink-Integration eine Lichtentität
  bereitstellt.

### Audio

- Wiedergabe des Kameratons im Browser.
- Gegensprechen über das Browsermikrofon.
- Ein getrenntes Audioelement verhindert unter iOS einen Bildneustart bei
  Audioänderungen.
- Umwandlung in Opus nur während einer aktiven Kameraansicht.

### Einbindung in Home Assistant

- Symbole, Farben, Typografie und Abstände von Home Assistant.
- Polnische Beschriftungen bei polnischer HA-Sprache, sonst englische
  Beschriftungen.
- Automatische Namen für Weitwinkel- und Zoomobjektiv.
- Bedienelemente unter dem Bild im Hochformat.
- Bedienelemente über dem Bild im Querformat und Vollbild.
- Vollbild-Ausrichtung mit Ersatzdarstellung für iOS.
- Aktualisierung der Miniaturbilder nach dem Fortsetzen der mobilen App.
- Wiederherstellung einer blockierten Zurück-Navigation nach dem Fortsetzen
  der App.

## Kompatibilität

### Home Assistant

Die aktuelle Version ist für **Home Assistant Core 2026.8.x als
Python-Systemdienst** vorgesehen. Home Assistant OS, Container und
Supervised-Installationen sind keine unterstützten Ziele, da das Projekt einen
systemd-Dienst und ein eigenes go2rtc-Binärprogramm auf dem Host installiert.

Das Frontend-Modul verwendet interne Webkomponenten von Home Assistant. Die
Backend-Integration erweitert außerdem eine interne Methode des
go2rtc-Anbieters. Ein Frontend- oder Core-Update kann daher eine Anpassung
erfordern, auch wenn sich die öffentlichen Kameraentitäten nicht ändern.

### Kameras

- Reolink TrackMix WiFi;
- Reolink E1 Zoom.

Die offizielle Reolink-Integration muss die von der Kamera unterstützten
`main`-, `sub`-, PTZ-, Zoom- und Lichtentitäten bereitstellen. Funktionen,
die ein Modell nicht unterstützt, werden im Dialog nicht angezeigt.

### Clients

- Safari und Chromium-basierte Browser verwenden WebRTC, wenn es verfügbar
  ist.
- Die mobilen Home-Assistant-Apps verwenden WebRTC, wenn der eingebettete
  Browser es bereitstellt.
- Die Home-Assistant-App für macOS verwendet HLS, wenn ihre eingebettete
  Ansicht kein WebRTC bereitstellt.

### go2rtc

Der unterstützte Build verwendet:

- Repository: `fzurita/go2rtc`;
- Basis-Commit: `78de4806a929e2bd77d7acad07e337ef53c09fd2`;
- Latenzkorrektur: `092ae6e2eca3afb3f439ecbd69a99785c816d953`.

`scripts/build-go2rtc.sh` erzeugt diesen Build reproduzierbar. Revision
`e8952ef99d91fe10c85836934c5ecd28b37ff7fa` wird nicht verwendet, da sie
einige 4K-H.265-Streams nach dem ersten Bild anhalten kann.

## Voraussetzungen

- Linux-Host mit Home Assistant Core unter dem Benutzer `homeassistant`;
- Home Assistant Core 2026.8.x;
- bereits eingerichtete offizielle Reolink-Integration;
- Git, Go und eine funktionsfähige C-Werkzeugkette für den einmaligen
  go2rtc-Build;
- Root-Zugriff auf den Home-Assistant-Host;
- TCP- und UDP-Port 8555 von den Kamera-Clients erreichbar.

## Sicherheit

- Kamerazugangsdaten werden aus dem vorhandenen Reolink-Konfigurationseintrag
  gelesen und nicht in diesem Repository gespeichert.
- Die go2rtc-API lauscht nur auf `127.0.0.1:1984`.
- Der lokale RTSP-Endpunkt lauscht nur auf `127.0.0.1:8554`.
- WebRTC-Medien verwenden TCP- und UDP-Port 8555.
- Der go2rtc-Dienst läuft als nicht privilegierter Benutzer `go2rtc` mit
  systemd-Härtung.
- Das Repository enthält keine Kameraadressen, Zugangsdaten,
  Home-Assistant-Token oder Kopien der Entitätsregistrierung.

Der Fernzugriff verwendet weiterhin die authentifizierte
Home-Assistant-Verbindung auf Port 8123. Für externes WebRTC müssen TCP und UDP
8555 zum Home-Assistant-Host weitergeleitet werden. Die Ports 1984 und 8554
dürfen dabei nicht veröffentlicht werden.

## Repository-Struktur

| Pfad | Zweck |
|---|---|
| `custom_components/reolink_baichuan_stream/` | Home-Assistant-Backend-Integration |
| `frontend/reolink-webrtc-first.js` | Kameradialog und Streamverarbeitung |
| `config/go2rtc.yaml.example` | Private API-, RTSP- und WebRTC-Endpunkte |
| `systemd/go2rtc.service` | Gehärteter Hostdienst |
| `scripts/build-go2rtc.sh` | Reproduzierbarer go2rtc-Build |
| `scripts/install.sh` | Installation der Projektdateien |
| `docs/images/` | Öffentliche README-Abbildungen |

## Installation

### 1. Reolink in Home Assistant einrichten

Fügen Sie alle Kameras über die offizielle **Reolink**-Integration hinzu und
prüfen Sie die Standard-Kameraentitäten, bevor Sie dieses Projekt installieren.

### 2. Repository herunterladen

```bash
git clone https://github.com/supczinskib/reolink-baichuan-ha.git
cd reolink-baichuan-ha
```

### 3. go2rtc kompilieren und installieren

```bash
./scripts/build-go2rtc.sh
sudo install -m 0755 go2rtc /usr/local/bin/go2rtc
```

Erstellen Sie das Dienstkonto, falls es noch nicht vorhanden ist:

```bash
id go2rtc >/dev/null 2>&1 || sudo useradd --system --home /var/lib/go2rtc --create-home --shell /usr/sbin/nologin go2rtc
```

Installieren Sie die Konfiguration:

```bash
sudo install -d -o go2rtc -g go2rtc -m 0700 /var/lib/go2rtc
sudo install -o go2rtc -g go2rtc -m 0600 config/go2rtc.yaml.example /var/lib/go2rtc/go2rtc.yaml
```

Ersetzen Sie in `/var/lib/go2rtc/go2rtc.yaml` die Adresse `192.0.2.10`
durch die LAN-Adresse des Home-Assistant-Hosts.

### 4. Home-Assistant-Dateien installieren

```bash
sudo ./scripts/install.sh
```

Das voreingestellte Home-Assistant-Konfigurationsverzeichnis ist
`/var/lib/homeassistant`. Setzen Sie bei einem anderen Verzeichnis
`HA_CONFIG`:

```bash
sudo HA_CONFIG=/pfad/zu/homeassistant ./scripts/install.sh
```

### 5. Home Assistant konfigurieren

Ergänzen Sie `configuration.yaml`:

```yaml
frontend:
  extra_module_url:
    - /local/reolink-webrtc-first.js?v=1.0.0

stream:
  ll_hls: true
  segment_duration: 2
  part_duration: 0.2

go2rtc:
  url: http://127.0.0.1:1984

reolink_baichuan_stream:
```

Fügen Sie die Einstellung in einen vorhandenen `frontend`-Abschnitt ein,
statt einen zweiten gleichnamigen Schlüssel anzulegen.

### 6. Dienste starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc.service
sudo systemctl restart home-assistant.service
```

Prüfen Sie beide Dienste:

```bash
systemctl is-active go2rtc.service home-assistant.service
```

### 7. Kameraentitäten aktivieren

Aktivieren Sie unter **Settings → Devices & services → Entities** die
Reolink-Kameraentitäten `main` und `sub`. Die `sub`-Kameras dürfen in
automatisch erzeugten Bereichsansichten ausgeblendet bleiben; das Modul nutzt
sie weiterhin für LO-Video und Miniaturbilder.

Öffnen Sie jede Kamera aus einer Bereichsansicht und prüfen Sie:

1. LO- und HI-Video;
2. Lautsprecher und Mikrofon;
3. PTZ und Rückkehr zum Kontrollpunkt;
4. Zoom;
5. Scheinwerfer, sofern vorhanden;
6. Hochformat, Querformat und Vollbild.

## Bedienung

LO ist das Standardprofil und benötigt weniger Bandbreite. Die LO/HI-Taste
wechselt zwischen den Entitäten `sub` und `main`. Während des Wechsels
bleibt das letzte Bild sichtbar, bis das neue Profil Video liefert.

Der Zoomregler bewegt sich sofort und sendet beim Loslassen einen einzigen
Befehl. Bei der TrackMix verwendet der Bereich bis etwa 2,5× die
Weitwinkelansicht. Danach wechselt die Kamera zum Teleobjektiv mit fester
Brennweite; die weitere Vergrößerung bis 6× erfolgt digital. Die Rückkehr zum
Kontrollpunkt setzt außerdem den lokalen Digitalzoom des Weitwinkelobjektivs
zurück.

Die Lautsprechertaste aktiviert den Kameraton. Die Mikrofontaste fordert die
Browserberechtigung an und öffnet den Gegensprechkanal. Beim Schließen des
Kameradialogs werden die Mediensitzungen beendet.

## Aktualisierung

```bash
git pull --ff-only
sudo ./scripts/install.sh
sudo systemctl restart home-assistant.service
```

go2rtc muss nur neu gebaut und installiert werden, wenn sich die in
`scripts/build-go2rtc.sh` festgelegten Revisionen ändern.

Prüfen Sie nach einem Home-Assistant-Update Bildstart, LO/HI, Audio, PTZ, Zoom,
Miniaturbilder, Vollbild und Zurück-Navigation.

## Fehlerbehebung

### Kein Livebild

- Prüfen Sie, ob `go2rtc.service` aktiv ist.
- Prüfen Sie den Zugriff auf `http://127.0.0.1:1984` vom
  Home-Assistant-Host.
- Prüfen Sie, ob TCP und UDP 8555 zwischen Client und Home-Assistant-Host
  blockiert werden.
- Prüfen Sie, ob die Kameraentitäten `main` und `sub` aktiviert sind.
- Prüfen Sie `journalctl -u go2rtc.service` und das Home-Assistant-Protokoll.

### WebRTC ist nicht verfügbar

Das Frontend wählt in einem inkompatiblen eingebetteten Browser automatisch
HLS. Das HLS-Bild hat eine höhere Verzögerung, sollte aber funktionsfähig
bleiben. Ein Test in Safari oder Chrome trennt eine Client-Einschränkung von
einem Kamera- oder go2rtc-Problem.

### Audio oder Mikrofon funktioniert nicht

- Erlauben Sie dem Home-Assistant-Ursprung den Mikrofonzugriff.
- Prüfen Sie die Audioberechtigung des Reolink-Benutzers.
- Prüfen Sie, ob der `sub`-Stream aktiviert ist.
- Schließen Sie andere Anwendungen, die den Gegensprechkanal belegen könnten.

### Bedienelemente fehlen

Prüfen Sie, ob die offizielle Reolink-Integration die zugehörige Tasten-,
Zahlen-, Schalter- oder Lichtentität bereitstellt. Eine Entität darf
ausgeblendet, aber nicht deaktiviert sein.

### Probleme nach einem Home-Assistant-Update

Laden Sie die Seite ohne Browsercache neu. Bleibt das Problem bestehen,
vergleichen Sie die installierte Home-Assistant-Version mit der oben genannten
unterstützten Version. Eine geänderte Frontend-Struktur oder interne
Anbietermethode kann ein Projektupdate erfordern.

## Deinstallation

1. Entfernen Sie `reolink_baichuan_stream:`, den `go2rtc:`-Eintrag und
   `/local/reolink-webrtc-first.js` aus `configuration.yaml`.
2. Stoppen und deaktivieren Sie `go2rtc.service`.
3. Entfernen Sie:
   - `/var/lib/homeassistant/custom_components/reolink_baichuan_stream/`;
   - `/var/lib/homeassistant/www/reolink-webrtc-first.js`;
   - `/etc/systemd/system/go2rtc.service`;
   - `/usr/local/bin/go2rtc`;
   - `/var/lib/go2rtc/`.
4. Laden Sie systemd neu und starten Sie Home Assistant neu.

```bash
sudo systemctl disable --now go2rtc.service
sudo systemctl daemon-reload
sudo systemctl restart home-assistant.service
```

Die offizielle Reolink-Integration und ihre Entitäten bleiben erhalten.

## Lizenz

Copyright (C) 2026 Bartosz Supcziński.

Dieses Projekt steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE).

## Support

- Autor und Betreuer: **Bartosz Supcziński**, <bartek@env.pl>.

Eine Fehlermeldung sollte Home-Assistant-Version, Browser- oder App-Version,
Kameramodell, Firmwareversion und relevante bereinigte Protokolle enthalten.
Entfernen Sie Kennwörter, Token, Kameraadressen und Netzwerkkennungen.

Dies ist ein unabhängiges Community-Projekt und kein offizielles Produkt von
Reolink, go2rtc oder Home Assistant.
