# Zen Sync — wedding photo sorter

Sorts a folder of finished wedding JPEGs into wedding-day order by looking at the pictures,
lets you fix the order on a timeline, and saves numbered copies (`1.jpg`, `2.jpg`, …) into a
`numbered` folder — one folder, or a folder per part of the day. Everything runs on the
computer; photos never leave it.

Design: `docs/superpowers/specs/2026-11-22-wedding-photo-sorter-design.md`
Build plan: `docs/superpowers/plans/2026-11-22-wedding-photo-sorter.md`

## Develop

```bash
npm install            # on Linux CI sandboxes without nuget access: ONNXRUNTIME_NODE_INSTALL=skip npm install
npm run dev            # run the app
npm test               # unit + UI tests (uses a fake image model)
npm run typecheck
```

Real-model test (downloads the ~400 MB SigLIP model once):

```bash
RUN_MODEL_TESTS=1 npx vitest run test/core/embed.test.ts
```

## Accuracy and speed checks

```bash
npx tsx scripts/bakewell-eval.mts "/path/to/bakewell wedding"   # vs the approved order in test/fixtures
npx tsx scripts/bench.mts "/path/to/any wedding" 1000            # target: under 300 s
```

Targets: at least 80% of Bakewell photos within ±3 places of the approved order, and a clock
suggestion of about +8h35m for the A7R II (it's reported in years because that camera's clock
had reset to 2015).

| Check | Result |
|---|---|
| Bakewell accuracy | not run yet — needs the model download (blocked in the build sandbox) |
| 1,000-photo benchmark | not run yet — same reason |

## Build installers

- **Linux AppImage** (works locally): `npm run build && npx electron-builder --linux AppImage`
- **Windows installer and Flatpak**: run the **Build installers** GitHub Action
  (`.github/workflows/release.yml`) — it builds on real Windows and Ubuntu machines and
  attaches the `.exe`, `.AppImage` and `.flatpak` as downloads. Or on a Windows PC:
  `npm ci && npm run build && npx electron-builder --win nsis`.

## Selling (Lemon Squeezy)

1. Create a product priced **£14.99** with **licence keys** enabled and an **activation limit of 2**.
2. Set two build secrets (GitHub → Settings → Secrets → Actions, or environment variables
   when building locally):
   - `LS_PRODUCT_ID` → the product's numeric ID (`MAIN_VITE_LS_PRODUCT_ID` locally)
   - `LS_CHECKOUT_URL` → the product's checkout link (`MAIN_VITE_LS_CHECKOUT_URL` locally)
3. Free version: sort and preview any size; save one folder of up to 250 photos.
   A key unlocks any size and folder-per-part. Activation goes online once per computer,
   then never again.

## Before release

- Replace the placeholder icon `build/icon.png` (1024×1024).
- Windows code-signing certificate (to avoid SmartScreen warnings), and later an Apple
  Developer account for the Mac `.dmg` (config is already in `electron-builder.yml`).
- Submit the Flatpak to Flathub.

### Windows installer from Linux (no Wine)

`npm run dist:win:linux` packages the Windows app with electron-builder (`--win dir`) and wraps it with the
native Linux `makensis` (`sudo apt install nsis`) using `installer/zen-sync.nsi`: a per-user installer
(no admin rights) with Start menu + desktop shortcuts and an uninstaller in Windows' Apps list.
Install `@img/sharp-win32-x64` first (`npm i --no-save --force @img/sharp-win32-x64@<sharp's version>`).
The app's own .exe keeps Electron's default icon this way (setting it needs Wine or a Windows build);
shortcuts and the installer use the Zen Sync icon.
