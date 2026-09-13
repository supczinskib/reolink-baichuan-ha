# Reolink Baichuan WebRTC dla Home Assistant

[English](README.md) · [Deutsch](README_DE.md)

> **Podgląd kamer Reolink z małym opóźnieniem i zintegrowanym sterowaniem w standardowym interfejsie Home Assistant.**

```text
Kamera Reolink <-> Baichuan <-> go2rtc <-> WebRTC <-> Home Assistant
```

Ten społecznościowy projekt rozszerza standardowe okno kamer Home Assistant o
szybki obraz na żywo, wybór jakości, obsługę wielu obiektywów, PTZ, zoom,
sterowanie reflektorem oraz dźwięk w obu kierunkach. Korzysta z encji tworzonych
przez oficjalną integrację Reolink i nie dodaje osobnego panelu ani karty
Lovelace.

Autor i opiekun projektu: **Bartosz Supcziński** — <bartek@env.pl>

## Dlaczego powstał ten projekt

Home Assistant udostępnia zaawansowane funkcje Reolink jako osobne encje.
Standardowe okno kamery nie łączy ich w jeden interfejs, a zwykła ścieżka
RTSP/HLS może powodować opóźnienie przy uruchamianiu. Projekt przekazuje
natywny strumień Baichuan przez go2rtc i rozszerza istniejące okno bez
zastępowania integracji Reolink.

## Interfejs

To samo okno kamery dostosowuje się do układu pionowego, poziomego i
pełnoekranowego. Grafika przedstawia zwykły widok mobilny oraz widok poziomy na
pełnym ekranie.

![Sterowanie kamerą Reolink w Home Assistant](docs/images/reolink.png)

## Funkcje

### Obraz

- Natywne źródło Reolink Baichuan dla go2rtc.
- WebRTC jako podstawowa ścieżka w przeglądarce.
- Automatyczny HLS w klientach bez WebRTC.
- Profile LO i HI oparte na strumieniach Reolink `sub` i `main`.
- Miniatury w niskiej rozdzielczości w widokach obszarów Home Assistant.
- Zachowanie ostatniej miniatury lub klatki podczas uruchamiania obrazu i
  przełączania jakości.
- Dopasowanie `contain`, które zachowuje cały kadr.

### Sterowanie kamerą

- Sterowanie kierunkowe PTZ.
- Powrót do zapisanego w kamerze punktu kontrolnego.
- Zoom cyfrowy szerokiego obiektywu TrackMix.
- Zoom hybrydowy TrackMix sterowany przez kamerę oraz zoom optyczny E1 Zoom.
- Odczyt bieżącego ustawienia zoomu bezpośrednio z kamery.
- Płynne przesuwanie suwaka i wysłanie polecenia po jego zwolnieniu.
- Przesuwanie lokalnie powiększonego obrazu szerokiego obiektywu.
- Sterowanie reflektorem, gdy integracja Reolink udostępnia encję światła.

### Dźwięk

- Odsłuch dźwięku z kamery.
- Rozmowa przez mikrofon przeglądarki.
- Osobny element audio zapobiegający restartowi obrazu po zmianie dźwięku w
  systemie iOS.
- Kodowanie dźwięku do Opus wyłącznie podczas aktywnego podglądu.

### Integracja z interfejsem

- Ikony, kolory, typografia i odstępy Home Assistant.
- Polskie nazwy dla polskiego języka HA i angielskie dla pozostałych języków.
- Automatyczne nazwy obiektywu szerokiego i obiektywu zoom.
- Sterowanie pod obrazem w układzie pionowym.
- Sterowanie na obrazie w układzie poziomym i pełnoekranowym.
- Obsługa orientacji pełnoekranowej z trybem zastępczym dla iOS.
- Odświeżanie miniatur po wznowieniu aplikacji mobilnej.
- Przywracanie nawigacji, gdy systemowe cofanie HA zatrzyma się po wznowieniu
  aplikacji.

## Zgodność

### Home Assistant

Bieżące wydanie jest przeznaczone dla **Home Assistant Core 2026.8.x
uruchomionego jako usługa Python**. Home Assistant OS, Container i instalacje
Supervised nie są obsługiwanymi celami, ponieważ projekt instaluje usługę
systemd i własne binarium go2rtc na hoście.

Moduł interfejsu korzysta z wewnętrznych komponentów WWW Home Assistant, a
integracja rozszerza wewnętrzną metodę dostawcy go2rtc. Aktualizacja frontendu
lub Core może więc wymagać dostosowania projektu, nawet jeśli publiczne encje
kamer się nie zmienią.

### Kamery

- Reolink TrackMix WiFi;
- Reolink E1 Zoom.

Oficjalna integracja Reolink musi udostępniać encje `main`, `sub`, PTZ,
zoom i światło obsługiwane przez daną kamerę. Funkcje niedostępne w konkretnym
modelu nie są wyświetlane w oknie.

### Klienci

- Safari i przeglądarki oparte na Chromium używają WebRTC, gdy jest dostępne.
- Aplikacje mobilne Home Assistant korzystają z WebRTC, jeśli udostępnia je
  osadzona przeglądarka.
- Aplikacja Home Assistant dla macOS korzysta z HLS, jeśli jej osadzony widok
  nie udostępnia WebRTC.

### go2rtc

Obsługiwana wersja używa:

- repozytorium: `fzurita/go2rtc`;
- commit bazowy: `78de4806a929e2bd77d7acad07e337ef53c09fd2`;
- poprawka opóźnienia: `092ae6e2eca3afb3f439ecbd69a99785c816d953`.

Skrypt `scripts/build-go2rtc.sh` odtwarza tę wersję. Rewizja
`e8952ef99d91fe10c85836934c5ecd28b37ff7fa` nie jest używana, ponieważ może
zatrzymywać niektóre strumienie 4K H.265 po pierwszej klatce.

## Wymagania

- host Linux z Home Assistant Core działającym jako użytkownik
  `homeassistant`;
- Home Assistant Core 2026.8.x;
- skonfigurowana oficjalna integracja Reolink;
- Git, Go i działające narzędzia kompilacji C do jednorazowego zbudowania
  go2rtc;
- dostęp root do hosta Home Assistant;
- port TCP i UDP 8555 dostępny dla klientów kamer.

## Bezpieczeństwo

- Dane logowania kamer są pobierane z istniejących wpisów integracji Reolink i
  nie są zapisywane w repozytorium.
- API go2rtc nasłuchuje wyłącznie na `127.0.0.1:1984`.
- Lokalny RTSP nasłuchuje wyłącznie na `127.0.0.1:8554`.
- Media WebRTC używają portu TCP i UDP 8555.
- Usługa go2rtc działa jako nieuprzywilejowany użytkownik `go2rtc` i
  korzysta z ograniczeń systemd.
- Repozytorium nie zawiera adresów kamer, danych logowania, tokenów Home
  Assistant ani kopii rejestru encji.

Zdalny dostęp nadal korzysta z uwierzytelnionego połączenia Home Assistant na
porcie 8123. Jeżeli potrzebny jest zdalny WebRTC, skieruj TCP i UDP 8555 do
hosta Home Assistant bez udostępniania portów 1984 i 8554.

## Struktura repozytorium

| Ścieżka | Przeznaczenie |
|---|---|
| `custom_components/reolink_baichuan_stream/` | Integracja Home Assistant |
| `frontend/reolink-webrtc-first.js` | Okno kamery i obsługa strumienia |
| `config/go2rtc.yaml.example` | Prywatne interfejsy API, RTSP i WebRTC |
| `systemd/go2rtc.service` | Usługa hosta z ograniczeniami bezpieczeństwa |
| `scripts/build-go2rtc.sh` | Powtarzalne budowanie go2rtc |
| `scripts/install.sh` | Instalacja plików projektu |
| `docs/images/` | Publiczne obrazy README |

## Instalacja

### 1. Skonfiguruj Reolink w Home Assistant

Dodaj wszystkie kamery przez oficjalną integrację **Reolink** i sprawdź
działanie standardowych encji kamer przed instalacją tego projektu.

### 2. Pobierz repozytorium

```bash
git clone https://github.com/supczinskib/reolink-baichuan-ha.git
cd reolink-baichuan-ha
```

### 3. Zbuduj i zainstaluj go2rtc

```bash
./scripts/build-go2rtc.sh
sudo install -m 0755 go2rtc /usr/local/bin/go2rtc
```

Utwórz konto usługi, jeżeli jeszcze nie istnieje:

```bash
id go2rtc >/dev/null 2>&1 || sudo useradd --system --home /var/lib/go2rtc --create-home --shell /usr/sbin/nologin go2rtc
```

Zainstaluj konfigurację:

```bash
sudo install -d -o go2rtc -g go2rtc -m 0700 /var/lib/go2rtc
sudo install -o go2rtc -g go2rtc -m 0600 config/go2rtc.yaml.example /var/lib/go2rtc/go2rtc.yaml
```

W pliku `/var/lib/go2rtc/go2rtc.yaml` zastąp adres `192.0.2.10` adresem
LAN hosta Home Assistant.

### 4. Zainstaluj pliki Home Assistant

```bash
sudo ./scripts/install.sh
```

Domyślny katalog konfiguracji Home Assistant to
`/var/lib/homeassistant`. Jeżeli używany jest inny katalog, ustaw
`HA_CONFIG`:

```bash
sudo HA_CONFIG=/ścieżka/do/homeassistant ./scripts/install.sh
```

### 5. Skonfiguruj Home Assistant

Dodaj do `configuration.yaml`:

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

Jeżeli sekcja `frontend` już istnieje, dopisz ustawienie do niej zamiast
tworzyć drugi klucz.

### 6. Uruchom usługi

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc.service
sudo systemctl restart home-assistant.service
```

Sprawdź stan obu usług:

```bash
systemctl is-active go2rtc.service home-assistant.service
```

### 7. Włącz encje kamer

W **Ustawienia → Urządzenia oraz usługi → Encje** włącz encje kamer Reolink
`main` i `sub`. Kamery `sub` mogą pozostać ukryte w automatycznie
generowanych widokach obszarów; moduł nadal używa ich do obrazu LO i miniatur.

Otwórz każdą kamerę z widoku obszaru i sprawdź:

1. obraz LO i HI;
2. głośnik i mikrofon;
3. PTZ i powrót do punktu kontrolnego;
4. zoom;
5. reflektor, jeśli jest dostępny;
6. układ pionowy, poziomy i pełnoekranowy.

## Obsługa

LO jest profilem domyślnym i zużywa mniej danych. Przycisk LO/HI przełącza
między encjami `sub` i `main`. Podczas zmiany ostatnia klatka pozostaje na
ekranie do chwili pojawienia się obrazu z nowego profilu.

Suwak zoomu reaguje natychmiast, a jedno polecenie jest wysyłane po jego
zwolnieniu. W TrackMix zakres do około 2,5× wykorzystuje szeroki kadr, następnie
kamera przełącza się na stałoogniskowy teleobiektyw, a dalsze powiększenie do
6× wykonuje cyfrowo. Powrót do punktu kontrolnego zeruje również lokalny zoom
cyfrowy szerokiego obiektywu.

Przycisk głośnika włącza dźwięk z kamery. Przycisk mikrofonu prosi
przeglądarkę o dostęp do mikrofonu i otwiera kanał rozmowy. Zamknięcie okna
kamery kończy sesje multimedialne.

## Aktualizacja

```bash
git pull --ff-only
sudo ./scripts/install.sh
sudo systemctl restart home-assistant.service
```

go2rtc należy przebudować i ponownie zainstalować tylko wtedy, gdy zmienią się
rewizje przypięte w `scripts/build-go2rtc.sh`.

Po aktualizacji Home Assistant sprawdź uruchamianie obrazu, LO/HI, dźwięk, PTZ,
zoom, miniatury, pełny ekran i nawigację wstecz.

## Rozwiązywanie problemów

### Brak obrazu na żywo

- Sprawdź, czy `go2rtc.service` jest aktywna.
- Sprawdź dostęp do `http://127.0.0.1:1984` z hosta Home Assistant.
- Sprawdź, czy TCP i UDP 8555 nie są blokowane między klientem a hostem Home
  Assistant.
- Sprawdź, czy encje kamer `main` i `sub` są włączone.
- Sprawdź `journalctl -u go2rtc.service` oraz dziennik Home Assistant.

### WebRTC jest niedostępny

Moduł automatycznie wybiera HLS w niezgodnej osadzonej przeglądarce. Obraz HLS
ma większe opóźnienie, ale powinien nadal działać. Sprawdzenie w Safari lub
Chrome pozwala odróżnić ograniczenie klienta od problemu kamery albo go2rtc.

### Nie działa dźwięk lub mikrofon

- Zezwól na dostęp do mikrofonu dla adresu Home Assistant.
- Sprawdź, czy użytkownik Reolink ma uprawnienie do dźwięku kamery.
- Sprawdź, czy strumień `sub` jest włączony.
- Zamknij inne aplikacje, które mogą korzystać z kanału rozmowy kamery.

### Brakuje elementów sterowania

Sprawdź, czy oficjalna integracja Reolink udostępnia odpowiednią encję
przycisku, liczby, przełącznika lub światła. Encja może być ukryta, ale nie może
być wyłączona.

### Problemy po aktualizacji Home Assistant

Przeładuj stronę bez pamięci podręcznej. Jeżeli problem pozostaje, porównaj
zainstalowaną wersję Home Assistant z obsługiwaną wersją podaną wyżej. Zmiana
struktury frontendu lub wewnętrznego dostawcy może wymagać aktualizacji
projektu.

## Odinstalowanie

1. Usuń `reolink_baichuan_stream:`, wpis `go2rtc:` i
   `/local/reolink-webrtc-first.js` z `configuration.yaml`.
2. Zatrzymaj i wyłącz `go2rtc.service`.
3. Usuń:
   - `/var/lib/homeassistant/custom_components/reolink_baichuan_stream/`;
   - `/var/lib/homeassistant/www/reolink-webrtc-first.js`;
   - `/etc/systemd/system/go2rtc.service`;
   - `/usr/local/bin/go2rtc`;
   - `/var/lib/go2rtc/`.
4. Przeładuj systemd i uruchom ponownie Home Assistant.

```bash
sudo systemctl disable --now go2rtc.service
sudo systemctl daemon-reload
sudo systemctl restart home-assistant.service
```

Oficjalna integracja Reolink i jej encje pozostają dostępne.

## Licencja

Copyright (C) 2026 Bartosz Supcziński.

Projekt jest dostępny na licencji MIT. Zobacz [LICENSE](LICENSE).

## Wsparcie

- Autor i opiekun projektu: **Bartosz Supcziński**, <bartek@env.pl>.

Do zgłoszenia dołącz wersję Home Assistant, wersję przeglądarki lub aplikacji,
model kamery, wersję firmware i odpowiednie oczyszczone logi. Usuń hasła,
tokeny, adresy kamer i identyfikatory sieciowe.

Jest to niezależny projekt społecznościowy, który nie jest oficjalnym produktem
Reolink, go2rtc ani Home Assistant.
