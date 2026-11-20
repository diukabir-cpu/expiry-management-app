# Retail Expiry Tracker

An **offline-first Progressive Web App (PWA)** built for supermarket staff to import master product spreadsheets, scan product barcodes via mobile camera, capture expiry dates with offline English + Bengali OCR, manage multiple batches per barcode, track 30/60/90-day expiries, and export reports to Excel—with zero internet dependency after installation.

## Core Capabilities

- **100% Offline Local Persistence (IndexedDB)**: Stores Master Products, multi-batch Expiry Records, and app settings permanently on the phone (`retail_expiry_tracker_db`).
- **Master Excel / CSV Import**: Auto-detects columns, supports manual column mapping, preserves leading zeros on barcodes (`00890...`), detects duplicates/errors, and offers Add Only, Update Existing, or Replace Master Database modes.
- **Offline Camera Barcode Scanner**: Uses locally bundled `@zxing/browser` supporting **EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39**, flashlight/torch toggle, photo-file barcode decoding, and handheld/manual input.
- **Immediate Unknown Product Creation**: Scanning an unknown barcode offers an inline **Add New Product** form that saves permanently to the Master Products database and transitions straight to Expiry Date entry.
- **Offline Expiry Date OCR (English + Bengali)**: Uses locally bundled `tesseract.js` + `eng.traineddata.gz` + `ben.traineddata.gz` (no CDN requests). Converts Bengali numerals (`০১২৩৪৫৬৭৮৯`) to English digits, prioritizes `EXP`/`BEST BEFORE`/`BB`/`USE BY` over `MFG`, supports Month/Year-only dates, and requires user confirmation before saving.
- **Multi-Batch Per Barcode**: Scanning the same product repeatedly creates separate unique batch records without ever overwriting older expiry dates.
- **Dashboard & Reports**: Dynamic 30/60/90-day expiry alerts, global search across barcodes/SKUs/descriptions/batch numbers, filtered Expiry Reports exported to `.xlsx`/`.csv`, and full JSON Backup & Restore.

## Running Locally & Previewing

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome/Chromium.

### Production Build & Preview

```bash
npm run build
npm run preview
```

### Running Unit Tests

```bash
npx --yes tsx --test src/utils/*.test.ts
```

## Installing on Android Phones (PWA)

1. Serve the built app over HTTPS (or `localhost` during USB debugging) and open it in **Chrome on Android**.
2. Wait 2–3 seconds on first load for the Service Worker to precache the app bundle and local English/Bengali OCR traineddata files (~4.2 MB).
3. Tap the **"Install App"** button in the top bar / Settings screen (or open Chrome's menu `⋮` → **Install app** / **Add to Home screen**).
4. Launch **Retail Expiry Tracker** from the Android home screen—it opens in standalone full-screen mode and works completely offline on the store floor.

## Browser & Hardware Notes

- **Camera Access**: Live camera streaming (`getUserMedia`) requires a secure origin (`https://` or `localhost`) and camera permission granted in Android Chrome. Both the Barcode Scanner and Expiry Entry screens also provide photo-upload / manual entry fallbacks.
- **Flashlight / Torch**: Torch toggling works on Android Chrome devices whose rear camera exposes `MediaTrackCapabilities.torch`.
- **OCR Accuracy on Glossy Packaging**: Dot-matrix or curved thermal prints can glare under harsh aisle lights; use the built-in **Crop & Contrast** and **Rotate 90°** tools before re-running OCR, and always verify the detected date before tapping **Confirm & Save Batch**.
