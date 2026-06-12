# Backblaze B2 + Cloudflare Worker — instrukcja wdrożenia

## Co już masz gotowe w kodzie

- `admin/admin.js` — `FILE_WORKER_URL = "https://critmc-b2-files.marcinstella.workers.dev"`
- Upload dowodów: `POST /upload/evidence`
- Upload mediów sklepu: `POST /upload/shop`
- Upload mediów strony: `POST /upload/media`
- Pobieranie prywatnych plików: `GET /file?key=...` (przez Worker proxy)
- Usuwanie: `DELETE /file?key=...&id=...`
- Worker code: `cloudflare-worker/worker.js`

---

## Krok 1 — Backblaze B2

### 1.1 Utwórz dwa buckety

W panelu Backblaze → `Buckets` → `Create a Bucket`:

| Bucket name          | Files are | Encryption |
|----------------------|-----------|------------|
| `nagrania-critmc`    | Private   | Enable     |
| `media-critmc`       | Public    | Enable     |

### 1.2 Utwórz klucze aplikacji

**NIE używaj Master Key.** Utwórz 2 osobne klucze:

**Klucz 1 — dowody (prywatny bucket):**
- Name: `critmc-evidence-rw`
- Allow access to Bucket(s): `nagrania-critmc`
- Type of Access: `Read and Write`

**Klucz 2 — media publiczne:**
- Name: `critmc-media-rw`
- Allow access to Bucket(s): `media-critmc`
- Type of Access: `Read and Write`

Zapisz:
- `keyID` (to jest B2_KEY_ID)
- `applicationKey` (to jest B2_APPLICATION_KEY)
- Bucket ID (kliknij na bucket → `Bucket ID`)

---

## Krok 2 — Cloudflare Worker

### 2.1 Zainstaluj Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2.2 Wdróż Worker

```bash
cd cloudflare-worker
wrangler deploy
```

Worker wdroży się na `critmc-b2-files.marcinstella.workers.dev` (lub Twoja subdomena Cloudflare).

### 2.3 Ustaw sekrety (po kolei, każda komenda pyta o wartość)

```bash
wrangler secret put B2_KEY_ID
# wklej keyID z kroku 1

wrangler secret put B2_APPLICATION_KEY
# wklej applicationKey z kroku 1

wrangler secret put B2_BUCKET_ID_EVIDENCE
# wklej Bucket ID bucketu nagrania-critmc

wrangler secret put B2_BUCKET_ID_MEDIA
# wklej Bucket ID bucketu media-critmc

wrangler secret put B2_BUCKET_NAME_EVIDENCE
# wpisz: nagrania-critmc

wrangler secret put B2_BUCKET_NAME_MEDIA
# wpisz: media-critmc

wrangler secret put ALLOWED_ORIGIN
# wpisz: https://critmc.pl (lub * podczas testów)
```

### 2.4 Przetestuj Worker

Otwórz w przeglądarce:
```
https://critmc-b2-files.marcinstella.workers.dev/health
```

Powinna zwrócić: `{"ok":true,"service":"critmc-b2-worker"}`

---

## Krok 3 — Testuj upload z panelu

1. Zaloguj się do panelu admina
2. Wejdź w `Nadaj karę` → wybierz gracza → dodaj załącznik → `Nowy plik Backblaze`
3. Wybierz plik i wykonaj akcję
4. Sprawdź zakładkę `Pliki` — plik powinien się pojawić
5. Sprawdź `nagrania-critmc` w Backblaze — plik powinien być w folderze `evidence/YYYY/MM/DD/`

---

## Krok 4 — Media sklepu

1. Panel admina → `Sklep` → `Dodaj produkt`
2. W polu `Wgraj nowe media` wybierz obrazek lub film
3. Kliknij `Zapisz produkt`
4. Worker wyśle plik do `media-critmc`, zwróci publiczny URL
5. URL zostanie automatycznie zapisany w polu `Link do obrazka`

---

## Krok 5 — Bezpieczeństwo Firestore

W Firebase Console → Firestore → Rules ustaw:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Kolekcja admins — TYLKO odczyt z backendu (Worker lub Cloud Function)
    // Z przeglądarki ZAWSZE zablokowany
    match /admins/{doc} {
      allow read, write: if false;
    }

    // Pliki — tylko admini z uprawnieniem (przez panel)
    match /files/{doc} {
      allow read: if false;
      allow write: if false;
    }

    // Reszta — odczyt publiczny (strona), zapis zablokowany
    match /contests/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /contests/{cid}/entries/{eid} {
      allow read: if false;
      allow write: if true; // gracze mogą dołączyć
    }
    match /proposals/{doc} {
      allow read: if true;
      allow write: if true; // gracze mogą dodawać i głosować
    }
    match /server_content/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /personel/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /creators/{doc} {
      allow read: if true;
      allow write: if false;
    }

    // Reszta — zablokowana
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**UWAGA:** Te reguły blokują zapis przez panel admina do kolekcji `admins`. Panel i tak działa — logowanie sprawdza hasło po stronie JS. Zmiana hasła admina przez panel będzie zablokowana dopóki nie przejdziesz na Firebase Auth lub Cloud Functions.

---

## Aktualny stan

| Komponent | Status |
|-----------|--------|
| Kod Workera | ✅ Gotowy w `cloudflare-worker/worker.js` |
| Upload dowodów (bany/muty) | ✅ Podpięty |
| Upload mediów sklepu | ✅ Podpięty |
| Prywatny dostęp przez proxy | ✅ Gotowy |
| Wdrożenie Workera | ⏳ Wymaga `wrangler deploy` |
| Sekrety B2 | ⏳ Wymagają `wrangler secret put` |
| Reguły Firestore | ⏳ Wymagają ręcznego ustawienia |
