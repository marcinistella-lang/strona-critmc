# Backblaze B2 - instrukcja podpiecia

## 1. Najpierw bezpieczenstwo

Jesli pokazales `Master Application Key` na screenie, potraktuj go jako wyciek.

Co zrobic:

1. Wejdz w `Backblaze B2`.
2. Otworz `Application Keys`.
3. Usun albo zrotuj stary `Master Application Key`.
4. Nie uzywaj Master Key w tym projekcie.

## 2. Jakie buckety utworzyc

Polecany podzial:

- `nagrania-critmc` - bucket prywatny na dowody, nagrania, screeny i pliki do kar
- `media-critmc` - bucket publiczny albo pozniej obslugiwany przez backend, do sklepu, nowosci i mediow

Ustawienia bucketu na start:

- `Files in Bucket are`: `Private` dla dowodow
- `Files in Bucket are`: `Public` dla publicznych mediow
- `Default Encryption`: `Enable`
- `Object Lock`: `Disable`

## 3. Jak utworzyc klucz poprawnie

Nie tworz kolejnego Master Key.

Utworz zwykly klucz:

1. `Application Keys`
2. `Add a New Application Key`
3. `Name of Key`: np. `critmc-panel-media`
4. `Allow access to Bucket(s)`: wybierz tylko jeden bucket
5. `Type of Access`: `Read and Write`
6. `Allow List All Bucket Names`: odznacz, jesli nie musisz tego miec
7. `File name prefix`: zostaw puste albo ustaw np. `uploads/`
8. `Duration`: zostaw puste

## 4. Czego nie robic

Nie wklejaj tych danych do:

- `admin/admin.js`
- `firebase.js`
- `index.html`
- GitHub repo

Klucze B2 musza trafic do backendu, nie do frontendu.

## 5. Jak to podpiac do tego projektu

Ten projekt jest frontendowy, wiec potrzebujesz posrednika.

Najlepszy uklad:

- `Firestore` - dane panelu, sklepu, mediow, kar, uprawnien
- `Backblaze B2` - pliki
- `Cloudflare Worker` - bezpieczny upload do B2

Schemat:

1. Panel admina wysyla plik do Workera.
2. Worker laczy sie z B2.
3. Worker wrzuca plik do bucketu.
4. Worker zwraca `fileKey` i podstawowe metadane.
5. Panel zapisuje te dane w Firestore.

## 6. Jakie sekrety ustawic w Workerze

W `Cloudflare Worker` dodaj sekrety:

- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_ID_EVIDENCE`
- `B2_BUCKET_ID_MEDIA`
- `B2_BUCKET_NAME_EVIDENCE`
- `B2_BUCKET_NAME_MEDIA`

## 7. Jakie dane zapisywac w Firestore

Przy zalaczniku zapisuj tylko metadane:

```json
{
  "type": "video",
  "provider": "b2",
  "bucket": "nagrania-critmc",
  "fileKey": "evidence/2026/06/ban-gracz-001.mp4",
  "fileName": "ban-gracz-001.mp4",
  "mimeType": "video/mp4",
  "size": 12345678,
  "createdAt": "2026-06-11T20:15:00Z",
  "createdBy": "AdminX"
}
```

## 8. Jak wykorzystac to na stronie

Publiczne media z bucketu `media-critmc` mozesz potem podpinać do:

- `Nowosci`
- `Media`
- `Sklep`
- miniatur
- filmow promocyjnych

Do Firestore zapisujesz wtedy np.:

```json
{
  "title": "Nowy trailer",
  "type": "video",
  "mediaUrl": "adres pliku lub klucz pliku",
  "desc": "Opis filmu",
  "visible": true
}
```

## 9. Co jest juz przygotowane w panelu

W panelu admina sa juz przygotowane:

- opcjonalne pola zalacznikow przy karach
- nowa sekcja `Sklep`
- nowa sekcja `Uprawnienia`

Na razie przy zalacznikach zapisujemy metadane i miejsce na linki.
Faktyczny upload plikow ruszy po dodaniu backendu do B2.

## 10. Co zrobic teraz po kolei

1. Uniewaznij pokazany Master Key.
2. Zostaw bucket `nagrania-critmc` jako prywatny.
3. Utworz drugi bucket na publiczne media, jesli chcesz wrzucac filmy i grafiki na strone.
4. Utworz zwykly ograniczony klucz dla kazdego bucketu.
5. Daj mi znac, a w kolejnym kroku przygotuje Ci:
   - kod `Cloudflare Worker`
   - endpoint uploadu
   - podpiecie tego do panelu admina
