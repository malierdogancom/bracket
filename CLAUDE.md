# CLAUDE.md — Bracket

## Proje Özeti
Turnuva/bracket oluşturma uygulaması. `bracket.malierdogan.com` adresinde yayınlanır.
- **Subdomain:** bracket.malierdogan.com
- **GitHub Org:** github.com/malierdogancom/bracket
- **Firebase Hosting:** `portfolio-mali-erdogan` projesi, target: `bracket` → `bracket-portfolio-mali`
- **Page title:** "Bracket — Event Organizer"
- **Favicon:** `app/icon.svg` (gri/mavi turnuva bracket ikonu)

## Tech Stack
- **Framework:** Next.js 16.0.6 (static export)
- **React:** 19.2.0
- **TypeScript:** Evet
- **Styling:** Tailwind CSS 4
- **Build output:** `out/` (static HTML/CSS/JS)
- **Node:** 20
- **Extra libs:** Papaparse (CSV), Lodash, Lucide React icons, Firebase Admin

## Firebase Yapısı
- **Project ID:** `portfolio-mali-erdogan`
- **Hosting target:** `bracket` → site ID: `bracket-portfolio-mali`
- **Firestore:** Evet
  - Collection: `brackets` — turnuva/takım event verileri
  - Document alanları: `name`, `type` ("tournament"|"teams"), `data`, `config`, `ownerId`, `isArchived`, `createdAt`
- **Auth:** Evet (Firebase Authentication — admin girişi için)

## Firebase Config (hardcoded — env var değil)
`lib/firebase.js` dosyasında sabit değerler:
```javascript
apiKey: "AIzaSyB0eED9JbSQXvPfFJPNOhRiZSm5PpbTkjk"
authDomain: "portfolio-mali-erdogan.firebaseapp.com"
projectId: "portfolio-mali-erdogan"
storageBucket: "portfolio-mali-erdogan.firebasestorage.app"
messagingSenderId: "263756724892"
appId: "1:263756724892:web:12b6b313fd21a796554b59"
measurementId: "G-G6RFL0TKWK"
```
Env var gerekmez — GitHub Secrets'a Firebase config eklemek gerekmez.

## ⚠️ Firestore Rules ve Index'ler bu repoda yönetilmez!
Firestore rules (`firestore.rules`) ve indexes (`firestore.indexes.json`) **lens reposu** tarafından deploy edilir.
Bu dosyalar bracket reposunda bulunur ama CI/CD'ye dahil değildir — değişiklik yapmak için `portfolio-lens` reposunu düzenle.

## Önemli: Public Sayfa Firestore Query'si
`app/page.js`'deki public sayfa tüm bracket'ları çeker ve `isArchived` filtresini **client-side** uygular:
```js
.filter(e => !e.isArchived)
```
Firestore'da `where('isArchived', '==', false)` kullanılmaz — `isArchived` field'ı olmayan eski document'lar da gösterilmesi için.

## CI/CD Süreci
- **Trigger:** `main` branch'e push → production deploy, PR → preview channel deploy
- **Workflow:** `.github/workflows/firebase-deploy.yml`
- **Build:** `npm ci` → `npm run build` (output: `out/`)
- **Deploy tool:** `FirebaseExtended/action-hosting-deploy@v0`
- **Target:** `bracket`
- **Secrets gerekli:**
  - `FIREBASE_SERVICE_ACCOUNT_PORTFOLIO_MALI_ERDOGAN` (org secret — otomatik)

## Build & Deploy Detayları
```bash
npm ci
npm run build      # → out/ klasörü oluşur
firebase deploy --only hosting:bracket --project portfolio-mali-erdogan
```

## Bilinen Kısıtlar
- `output: 'export'` → server-side rendering yok, tüm veri Firestore'dan client-side çekiliyor
- Firestore rules/indexes değişikliği için `portfolio-lens` reposuna git

---

## Yeni Subdomain Ekleme Rehberi

(Bkz. `portfolio/CLAUDE.md` → Yeni Subdomain Ekleme Rehberi bölümü — adımlar aynı)
