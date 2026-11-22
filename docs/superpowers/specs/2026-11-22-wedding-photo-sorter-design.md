# Wedding Photo Sorter — Design

*22 November 2026 · status: approved*

## 1. Why this exists

Wedding photographers finish editing in Lightroom and export JPEGs that came from two or more cameras, and sometimes from a second shooter. The exported files don't come out in the order the day happened:

- **File names from different cameras don't interleave.** `DSC…` and `BHV…` just sort as two separate blocks.
- **Capture times are often missing.** Lightroom exports set to "Copyright Only" metadata strip them.
- **Capture times are often wrong.** A camera's clock was never set or reset itself (on the Bakewell wedding, the A7R II thought it was 1 Jan 2015 and was 8h35m slow).

Today, putting a wedding back into order and numbering it 1, 2, 3… is slow manual work. This app does it by **looking at the photos**: it works out which part of the day each one shows, puts them in wedding-day order, and saves numbered copies. It can save them into one folder or into a folder for each part of the day.

The idea came from sorting the Bakewell wedding by hand: 124 photos from an A7R II and an FX3, matched by spotting the same moment in both cameras' shots.

**Who it's for:** the user first (Zen Visuals). After that, other wedding photographers on Windows, Mac and Linux, most of them non-technical.

## 2. Goals

1. **Wedding-day order from the pictures.** Each photo is assigned to a part of the day (see §4), and the parts appear in the order they happened.
2. **Works with or without metadata.** It uses capture times when they're present, copes when they're wrong, and still works when they're missing.
3. **Two output options:**
   - **One folder:** `1.jpg` to `N.jpg` through the whole day.
   - **A folder per part of the day:** `01 Getting ready/`, `02 Details/`… The numbering runs on across folders (it doesn't restart in each one), so names never clash and the folders can be merged later.
4. **Preview and fix before saving.** The user sees the proposed order, can drag photos to new positions or move them to a different part, and only then saves.
5. **Entirely on the user's computer.** No uploads, no account, works offline after setup.
6. **Really user friendly.** It installs like any other app on Windows, Mac and Linux. There's no Python, terminal or settings to configure, and it doesn't need a graphics card.
7. **Fast.** A full wedding (around 1,000 photos) sorts in a few minutes on an ordinary laptop.

## 2a. Free and paid (decided)

Version 1 is a free app with a **one-off £14.99 unlock**. There's no subscription.

| | Free | Paid (£14.99 once) |
|---|---|---|
| Sort, preview, drag to fix, clock fixes | ✓ any size | ✓ |
| Save as one numbered folder | ✓ up to 250 photos | ✓ any size |
| Save as a folder per part of the day | locked | ✓ |

- **Free users can sort and preview a wedding of any size.** Only *saving* is locked when a wedding has more than 250 photos. They see their own wedding sorted correctly before being asked to pay. *(Builder's call.)*
- The folder-per-part option is visible with a small lock icon. Clicking it, or trying to save more than 250 photos, opens an unlock panel with **Buy (£14.99)** and **I have a key** options.
- **Payments and licence keys go through Lemon Squeezy** *(builder's call)*. It acts as the merchant of record, so it handles UK/EU VAT and receipts, and it issues licence keys. Buying opens the Lemon Squeezy checkout in the user's browser, and the key arrives by email. No server of our own is needed.
- **One-time online activation (decided by the user):** the user pastes the key once, and the app checks it online against Lemon Squeezy's licence API. The activation is then saved on the computer, and the app **works offline from then on with no re-checks, ever**.
- **2 computers per key** *(builder's call; it's a setting in Lemon Squeezy and can be changed later without a new app version)*. **Deactivate this computer** in Settings frees up a slot, for example when moving to a new laptop. The seller can also reset a key's activations from the Lemon Squeezy dashboard when someone asks for help.
- **If activation can't reach the internet,** the app explains clearly and lets the user try again later. The free features keep working in the meantime.
- Settings shows "Licensed to *buyer name*".
- The check is kept simple. It isn't hardened against cracking, because the effort isn't worth it at this price.
- Upgrades to a future major version could be priced separately later, but that's not part of version 1.

## 3. Non-goals (not in version 1)

- RAW files (it works on finished JPEG exports only)
- Picking the best shots or culling
- Editing, a Lightroom plugin, or video
- Face recognition or naming people
- Renaming photos in place

### Anti-goals (the app fails if any of these happen, even if the sorting works)

- It changes, moves or deletes the user's original files.
- It sends photos or data off the computer.
- It writes out an order the user hasn't seen. The preview step can't be skipped.
- A user has to install Python, use a terminal, or own a graphics card.

## 4. Parts of the day

This is the default list, and it's what the app sorts into. The user can rename, reorder, add and remove parts in Settings. Parts a wedding doesn't have are skipped, and no empty folders are made.

1. Getting ready
2. Details (dress, rings, flowers, stationery)
3. Arrival and guests
4. Ceremony (aisle, vows, rings, first kiss)
5. Signing
6. Confetti
7. Drinks reception
8. Groups and family
9. Couple portraits
10. Venue and breakfast setup
11. Wedding breakfast
12. Speeches
13. Cake cutting
14. First dance
15. Evening party

Each part has a few short descriptions behind the scenes, for example "bride having her make-up done" and "groom fastening cufflinks". These are what the photos get compared against. Advanced users can edit them in Settings.

**Details shots** are the hardest to place, because a close-up of the rings could be from the morning or from the ceremony. They're placed by capture time when it's available, and otherwise next to the photos either side of them in their camera's sequence.

## 5. Approaches considered

| | How it recognises photos | Trade-off |
|---|---|---|
| **A. Local "describe the photo" AI** (a vision-language model, e.g. Qwen-VL) | Asks the model what's in each photo | Understands scenes best, but needs a good graphics card or takes 10–30 s per photo (hours per wedding). Several-GB download. |
| **B. Fast image-matching model** (CLIP/SigLIP-style) | Compares each photo against text descriptions of each part, groups near-identical shots, and uses capture times and file order to smooth the result | A few minutes per wedding with no graphics card, under 1 GB download. Weaker on lookalike moments (signing vs vows, drinks vs groups), so the user fixes a few more in the preview. |
| **C. Both** | B for everything, A only for photos B is unsure about | Best accuracy for the time, but the most to build |

**Chosen: B**, because the user wants it really user friendly, and a quick sort that works on any laptop matters more than squeezing out the last few percent of accuracy. B is built so A can later be added just for the photos it's unsure about, which turns it into C, without rebuilding anything.

## 6. How it works

### The user's flow and look (chosen: "timeline strip")

The user picked a dark, photo-first look, in neutral greys like Lightroom, laid out around a timeline of the whole day.

```
┌─────────────────────────────────────────────────────────┐
│  Wedding Photo Sorter                                   │
│                                                         │
│        Drag a folder of finished JPEGs here             │
│                or  [ Choose folder ]                    │
└─────────────────────────────────────────────────────────┘
                     ↓  (a few minutes, progress bar)
┌─────────────────────────────────────────────────────────┐
│ Bakewell wedding · 124 photos · 2 cameras  [Save copies]│
│ ⚠ A7R II clock looks 8h 35m slow   [Fix] [Ignore]       │
│                                                         │
│ ▕Arrival▕  Ceremony  ▕Signing▕Confetti▕Portraits▕Groups▕│ ← timeline bar
│ 11:47                                            12:34  │
│ ┌──────────────────┐  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐          │
│ │                  │  │11││12││13?│14││15││16│ ← drag   │
│ │  big preview of  │  └──┘└──┘└──┘└──┘└──┘└──┘          │
│ │  selected photo  │  (? = not sure, worth a look)      │
│ │ 13 · Ceremony ·  │                                    │
│ │ FX3 · 12:01      │                                    │
│ └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

- **Start screen:** the user drags a folder onto the window, or clicks Choose folder.
- **Timeline bar:** shows the whole day as coloured sections, one per part of the day, sized by how many photos each has. Clicking a section jumps to it. Hovering shows the part's name and its count. The bar makes it obvious when a whole block has landed in the wrong place.
- **Thumbnail strip:** shows every photo, numbered, with a coloured edge matching its part of the day and a small badge for which camera took it. The user drags a photo to a new position, or drops it onto a timeline section to move it to that part. More than one photo can be selected and moved together.
- **Big preview:** shows the selected photo with its number, part of the day, camera and (corrected) capture time. Arrow keys step through the photos, and number keys 1–9 send the selected photo to that part.
- **Reorganising parts by drag and drop:** a whole timeline section can be dragged to a new position (e.g. portraits before confetti). Its photos move with it and the numbering updates. Dropping selected photos onto the gap between two sections creates a new part there (named by the user, e.g. "First look"). The default list of parts can be reordered by dragging in Settings.
- **Not-sure photos** are outlined in amber. A "Next unsure" button steps through them.
- **Save copies** opens a small panel: One folder / Folder per part, then Save.

### Steps inside the app

1. **Read the folder.** It finds the JPEGs and reads each one's capture time, camera make, model and serial number (when present), and file name. It makes small thumbnails for the preview.
2. **Group by camera.** It uses the serial number or model when present, and otherwise the file-name prefix (`DSC`, `BHV`, `_MG_`…). Within a camera, the order is by capture time when present, and otherwise by the number in the file name. A camera's own shutter count is reliable within that camera.
3. **Check camera clocks.** It finds near-identical photos taken by different cameras (the same moment shot from two angles) and works out how far apart the clocks are. If one camera is clearly off, it tells the user, e.g. "A7R II clock looks 8h35m slow", and applies the correction only once they confirm it.
4. **Recognise each photo.** The image-matching model scores every photo against the descriptions for each part of the day.
5. **Smooth the result.** Within one camera's sequence, the wedding only moves forward: you don't go back from speeches to the ceremony. The app picks the most likely parts for the whole sequence under that rule, which corrects most one-off mistakes. Details shots are exempt, as described in §4.
6. **Merge the cameras.** Within each part, photos are merged by corrected capture time. A camera with no times is slotted in next to the most similar photos from the other cameras. This is the same approach used by hand on the Bakewell wedding.
7. **Preview.** It shows thumbnails grouped by part, numbered, with a small badge showing which camera each came from. Photos it's unsure about are marked. The user can drag a photo to a new position or into another part.
8. **Save.** The user picks one folder or a folder per part, and the app writes **copies** into a new subfolder (default name `numbered`) inside the chosen folder. The copies are byte-for-byte identical to the originals, so the metadata and quality are untouched. Names are `1.jpg`, `2.jpg`… with no leading zeros. If the subfolder already exists, the app asks before replacing it.

### Getting better over time

When the user moves a photo to a different part in the preview, the app remembers that correction on their computer: what the photo looked like to the model, and the part it really belongs to. On later weddings, photos that look like a corrected one lean towards the corrected part. This stays on the user's computer.

## 7. Technical choices (the builder's calls, which the user can override)

- **App shell:** Electron with TypeScript and React. This gives one codebase with native installers for all three systems, and it's the most common, best-supported route for this kind of app.
- **Image model:** SigLIP (base size, Apache-2.0 licence, fine for a commercial product), converted to ONNX and run with ONNX Runtime on the processor. A graphics card is used if one is present, but it isn't needed.
- **Reading files:** `exifr` for metadata and `sharp` for fast thumbnails. Images are resized down before analysis, and the originals are never re-saved.
- **Model download:** the model (about 400 MB) downloads on first launch, with a progress bar, so the installer stays small. It's stored in the app's data folder and works offline from then on.
- **Installers (decided by the user: "really easy"):**
  - **Windows:** a normal installer `.exe` (NSIS, via `electron-builder`). The user double-clicks it and clicks Next, and it adds Start menu and desktop shortcuts and an uninstaller. It installs per user, so no admin password is needed.
  - **Linux:** an **AppImage** (download, mark it as runnable, double-click; works on almost any distribution) and a **Flatpak** (one-click install from software centres, and auto-updates once it's on Flathub). Getting onto Flathub is a separate review step after the first release.
  - **Mac:** planned, but **not in the first release**. Windows and Linux ship first. The code stays cross-platform, and a `.dmg` for Apple Silicon and Intel is added once the seller has an Apple Developer account (about £79 a year), which is needed so it opens without security warnings. *(Builder's call, since the user didn't answer.)*
- **Code signing:** to install without scary security warnings on Mac and Windows, the app has to be signed. That needs an Apple Developer account (about £79 a year) and a Windows code-signing certificate. This isn't needed for the user's own testing, only before handing it to others.

## 8. Constraints

- It has to run on an ordinary laptop with no graphics card, with about 8 GB of RAM as the minimum.
- Performance target: 1,000 JPEGs at around 25 MB each, analysed in under 5 minutes on a mid-range laptop processor.
- Original files are only ever read, never written to.
- No network use apart from the one-time model download, the one-time licence activation (and deactivation), and update checks if added later. Photos and photo data never leave the computer.

## 9. Left to the builder

- The exact descriptions for each part of the day, and the number of them
- The details of the smoothing method and the confidence thresholds
- How similar two photos must be to count as "the same moment" when checking clocks
- Visual styling of the app (clean, photo-first, with light and dark themes)
- Whether to use a larger model variant if testing shows a clear accuracy gain within the speed target

## 10. Testing

- **The Bakewell wedding** (124 photos, A7R II and FX3, one camera's metadata stripped and the other's clock wrong) becomes the first test set. Its hand-checked order from 22 November is the answer key.
- Add at least two full-day weddings, with getting ready, the breakfast, speeches and the evening, before release.
- Measure the share of photos placed in the right part, and how many photos the user has to move in the preview.
