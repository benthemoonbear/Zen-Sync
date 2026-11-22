# Wedding Photo Sorter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-platform desktop app that sorts a folder of finished wedding JPEGs into wedding-day order by looking at the pictures. The user checks the result on a timeline screen and fixes it by drag and drop, then the app saves numbered copies to one folder or a folder per part of the day, behind a £14.99 one-off unlock.

**Architecture:** An Electron app. The **main process** holds a pure-TypeScript sorting core (`src/main/core/*`): scan → group cameras → embed with SigLIP → classify into parts → smooth → clock check → merge → save. Each step is a small, unit-tested module that takes plain data. An `Embedder` interface keeps the ML model swappable and lets tests use a fake. The **renderer** is React and shows the drop screen, the timeline review, and the save, unlock and settings dialogs. Its reordering logic lives in pure functions (`src/renderer/state/order.ts`) that are tested without a browser. The two processes talk over a typed IPC bridge.

**Tech Stack:** Electron 33+, electron-vite, TypeScript (strict), React 18, @dnd-kit (drag and drop), zustand (state), @huggingface/transformers v3 (SigLIP via onnxruntime-node, CPU), sharp (thumbnails), exifr (EXIF), vitest, electron-builder (NSIS, AppImage, Flatpak).

**Spec:** `docs/superpowers/specs/2026-11-22-wedding-photo-sorter-design.md`

## Global Constraints

- Originals are only ever read. No code path writes, renames, moves or deletes a file in the input folder, except creating the output subfolder inside it.
- No network use apart from the one-time model download, licence activation/deactivation, and the "Buy" link opening in the browser. Photos and embeddings never leave the computer.
- The preview step can't be skipped: saving is only reachable from the review screen.
- Runs with no GPU and needs no Python, terminal or admin rights.
- Free tier: sort and preview any size. Saving **One folder** is allowed when the photo count is ≤ **250**. **Folder per part** is paid only. Price label: **£14.99**, one-off.
- Output: default subfolder **`numbered`**. Files are named **`1.jpg`, `2.jpg` …** (no leading zeros). The numbering runs continuously across part folders. Part folders are named `NN Name` (e.g. `01 Arrival`), numbered among non-empty parts only. Copies are byte-identical to the originals.
- Licence: Lemon Squeezy licence API, activated once per computer, with no re-checks after that. Settings shows "Licensed to *name*" and offers "Deactivate this computer".
- Default parts (in order): Getting ready, Details, Arrival and guests, Ceremony, Signing, Confetti, Drinks reception, Groups and family, Couple portraits, Venue and breakfast setup, Wedding breakfast, Speeches, Cake cutting, First dance, Evening party.
- UI look: dark, neutral greys, photo-first, with a "timeline strip" layout (timeline bar, big preview, thumbnail strip). Copy uses sentence case, with no "please" or "successfully".
- Performance target: 1,000 JPEGs (~25 MB each) analysed in under 5 minutes on a mid-range laptop CPU.
- Releases: a Windows NSIS installer (per-user, no admin) plus a Linux AppImage and Flatpak. The Mac `.dmg` is configured but not built for the first release.

## Review Focus

1. **Messy input folders.** Uppercase `.JPG`/`.jpeg`, macOS `._` sidecar files, `.xmp`/`.CR3` files mixed in, and an existing `numbered/` subfolder from a previous run. Only top-level JPEGs should be read, and the output folder must never be re-read as input. (Tests in Task 2.)
2. **A corrupt or zero-byte JPEG.** The app should skip it, list it in a "couldn't read" warning, and sort the rest, not crash. (Tests in Tasks 2 and 8.)
3. **Duplicate exports and identical timestamps** (e.g. `DSC03272.jpg` and `DSC03272-3.jpg`, burst shots in the same second). The order must be stable and deterministic, falling back to the file number and then the full name. (Tests in Tasks 3 and 8.)
4. **Paths with spaces and non-ASCII characters** (`bakewell wedding`, `Zoë & Tom`), especially on Windows. Scanning, thumbnails and saving must all work. (Tests in Tasks 2 and 10.)
5. **Running the app twice on the same folder,** or the output folder already existing. The app should ask before replacing it, and replacing must only ever touch `numbered/`. (Tests in Task 10.)

---

## File structure

```
package.json, electron.vite.config.ts, tsconfig*.json, vitest.config.ts, electron-builder.yml
src/main/
  index.ts                 app window, protocol + IPC registration
  ipc.ts                   IPC handlers (thin wrappers over core)
  thumbs.ts                sharp thumbnails + thumb:// protocol
  core/
    types.ts               shared data types
    scan.ts                list + read JPEG metadata
    cameras.ts             group by camera, order within camera
    parts.ts               default parts + prompts
    embed.ts               Embedder interface, SiglipEmbedder, model download
    classify.ts            part scores per photo
    smooth.ts              monotonic part assignment per camera
    clock.ts               camera clock offset detection
    merge.ts               interleave cameras into final order
    corrections.ts         learn from user's part corrections
    pipeline.ts            runSort(): orchestrates the above
    save.ts                plan + write numbered copies
    licence.ts             free-tier gate + Lemon Squeezy activation
    store.ts               JSON persistence in userData
src/preload/index.ts       contextBridge API
src/shared/api.ts          IPC channel names + request/response types
src/renderer/
  main.tsx, App.tsx, theme.css
  state/order.ts           pure reorder functions
  state/store.ts           zustand store
  screens/DropScreen.tsx, screens/ReviewScreen.tsx
  components/Timeline.tsx, Strip.tsx, Preview.tsx, ClockBanner.tsx,
             SaveDialog.tsx, UnlockDialog.tsx, SettingsDialog.tsx
test/ (mirrors src), test/fixtures/
scripts/bakewell-eval.ts, scripts/bench.ts
```

## Shared types (defined in Task 2, `src/main/core/types.ts`; every later task uses these names)

```ts
export interface PhotoFile { path: string; name: string; size: number; captureMs?: number; make?: string; model?: string; serial?: string }
export interface Camera { id: string; label: string; photos: PhotoFile[]; timed: boolean }
export interface Part { id: string; name: string; prompts: string[]; floating?: boolean }   // floating = exempt from monotonic order (Details)
export interface ClockSuggestion { cameraId: string; offsetMs: number; pairs: number }
export interface SortedPhoto { path: string; name: string; cameraId: string; partId: string; correctedMs?: number; unsure: boolean }
export interface SortResult { photos: SortedPhoto[]; parts: Part[]; cameras: Camera[]; clock: ClockSuggestion[]; skipped: { name: string; reason: string }[] }
export type SaveMode = 'single' | 'perPart'
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev` (opens window), `npm test` (vitest), `npm run build`, `npm run typecheck`.

- [ ] **Step 1:** Scaffold with electron-vite's react-ts template layout. Add dependencies: `@huggingface/transformers sharp exifr zustand @dnd-kit/core @dnd-kit/sortable`, and dev dependencies `vitest electron-builder`. Use strict TS, set `appId: uk.co.zenvisuals.weddingsorter` and `productName: Wedding Photo Sorter`.
- [ ] **Step 2:** Write `test/smoke.test.ts`: `expect(1 + 1).toBe(2)`.
- [ ] **Step 3:** Run `npm test`. Expected: 1 passed. Run `npm run typecheck`. Expected: no errors. Run `npm run build`. Expected: `out/` produced.
- [ ] **Step 4:** Commit: `chore: scaffold electron-vite app`.

---

### Task 2: Scan folder and read metadata

**Files:**
- Create: `src/main/core/types.ts` (shared types above), `src/main/core/scan.ts`
- Test: `test/core/scan.test.ts`, fixtures generated in the test with sharp (tiny JPEGs, some with EXIF via sharp's `withExif`)

**Interfaces:**
- Produces: `scanFolder(dir: string): Promise<{ photos: PhotoFile[]; skipped: {name:string;reason:string}[] }>`

- [ ] **Step 1: Write failing tests**
  - `lists only top-level jpg/jpeg, case-insensitive`: a dir containing `a.jpg, B.JPG, c.jpeg, ._d.jpg, e.xmp, f.CR3, numbered/1.jpg`. Expect names `['a.jpg','B.JPG','c.jpeg']`.
  - `reads DateTimeOriginal + SubSecTimeOriginal as captureMs`: JPEG with `DateTimeOriginal "2026:11:07 12:33:29"`, `SubSecTimeOriginal "416"` → `captureMs === Date.UTC(2026,10,7,12,33,29,416)`. Treat the EXIF time as naive (wall clock) and store it as if it were UTC.
  - `missing EXIF gives undefined captureMs, no throw`.
  - `zero-byte and truncated files go to skipped`: `skipped[0].reason` matches `/couldn't read/i`, and the other photos are still returned.
  - `handles spaces and non-ASCII in path`: dir `Zoë & Tom wedding` works.
- [ ] **Step 2:** Run `npx vitest run test/core/scan.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `scanFolder` with `fs.readdir(withFileTypes)` and the regex `/^(?!\._).+\.jpe?g$/i` for files only. Use `exifr.parse(path, {pick:['DateTimeOriginal','SubSecTimeOriginal','Make','Model','SerialNumber','BodySerialNumber'], reviveValues:false})`, and verify each file's JPEG SOI marker (`FF D8`) with a 2-byte read.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): scan folder and read capture metadata`.

---

### Task 3: Group by camera and order within camera

**Files:**
- Create: `src/main/core/cameras.ts`
- Test: `test/core/cameras.test.ts`

**Interfaces:**
- Consumes: `PhotoFile`
- Produces: `groupCameras(photos: PhotoFile[]): Camera[]`, `fileNumber(name: string): number[]`

- [ ] **Step 1: Write failing tests**
  - `groups by serial, then make+model, then filename prefix`: photos with serial `X1`/`X2` → 2 cameras. With no EXIF, names `DSC01.jpg, BHV02.jpg, DSC03.jpg` → cameras with ids `prefix:DSC` and `prefix:BHV`.
  - `camera label is model when known else prefix`: `'ILCE-7RM2'`, `'DSC'`.
  - `orders by captureMs when every photo has it, else by file number`.
  - `fileNumber parses duplicates`: `fileNumber('DSC03272-3.jpg')` equals `[3272, 3]`, and `fileNumber('DSC03272.jpg')` equals `[3272]`. Sorting gives `DSC03272` before `DSC03272-3`.
  - `ties broken by file number then name` (two photos with the same `captureMs`).
  - `timed is true only when all photos have captureMs`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The prefix is `/^[^\d]+/` on the name with trailing `_`/`-` trimmed (empty → `'other'`). `fileNumber` returns all digit runs as numbers.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): group photos by camera`.

---

### Task 4: Parts of the day, settings persistence

**Files:**
- Create: `src/main/core/parts.ts`, `src/main/core/store.ts`
- Test: `test/core/parts.test.ts`, `test/core/store.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PARTS: Part[]`. `createStore<T>(file: string, defaults: T): { get(): T; set(v: T): void }` (JSON, writes atomically through a temp file + rename, returns defaults if the file is corrupt). `loadParts(store) / saveParts(store, parts)`.

- [ ] **Step 1: Write failing tests**
  - `DEFAULT_PARTS names match the spec order` (assert the exact 15-name array from Global Constraints).
  - `every part has ≥3 prompts and a unique id`. Only `details` has `floating: true`.
  - `store returns defaults when file missing or corrupt`, and `round-trips a value`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The prompts are short photo captions, 3–5 per part (e.g. Getting ready: `"a bride having her make-up done"`, `"a groom fastening his cufflinks"`, `"bridesmaids getting ready in a hotel room"`). The `Part` ids are slugs.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): default parts of the day and settings store`.

---

### Task 5: Embedder (SigLIP) with model download

**Files:**
- Create: `src/main/core/embed.ts`
- Test: `test/core/embed.test.ts`, `test/fakes/fakeEmbedder.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Embedder { embedImages(paths: string[], onProgress?: (done:number,total:number)=>void): Promise<Float32Array[]>; embedTexts(texts: string[]): Promise<Float32Array[]> }
  export function cosine(a: Float32Array, b: Float32Array): number
  export async function createSiglipEmbedder(cacheDir: string, onDownload?: (pct:number)=>void): Promise<Embedder>
  export const MODEL_ID = 'Xenova/siglip-base-patch16-224'
  ```
  - `FakeEmbedder` (test only): built from a `Record<string, number[]>` keyed by file name or text.

- [ ] **Step 1: Write failing tests**
  - `cosine of identical vectors is 1, orthogonal 0`.
  - `embeddings are L2-normalised` (FakeEmbedder passes through `normalise`, exported from embed.ts).
  - `siglip: image of a red square is closer to "a red square" than "a blue circle"`. This is gated behind `RUN_MODEL_TESTS=1`, because it downloads the model.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement with `@huggingface/transformers`. Set `env.cacheDir = cacheDir` and `env.allowRemoteModels = true` only until the first download completes. Use `SiglipVisionModel` / `SiglipTextModel` and `AutoProcessor` / `AutoTokenizer` (tokenize with `padding: 'max_length'`), with `dtype: 'fp32'` on device `cpu`. Pre-resize images with sharp to 224 px on the short side before the processor. Batch images 16 at a time, and report progress. Return normalised `Float32Array`s.
- [ ] **Step 4:** Run `npx vitest run test/core/embed.test.ts`. Expected: PASS (2 run, 1 skipped). Then run `RUN_MODEL_TESTS=1 npx vitest run test/core/embed.test.ts`. Expected: 3 passed.
- [ ] **Step 5:** Commit: `feat(core): SigLIP embedder with on-demand model download`.

---

### Task 6: Classify and smooth into parts

**Files:**
- Create: `src/main/core/classify.ts`, `src/main/core/smooth.ts`
- Test: `test/core/classify.test.ts`, `test/core/smooth.test.ts`

**Interfaces:**
- Consumes: `Embedder`, `cosine`, `Part`
- Produces:
  - `partTextEmbeddings(parts: Part[], e: Embedder): Promise<Float32Array[]>` (the mean of each part's normalised prompt embeddings, renormalised)
  - `scoreParts(images: Float32Array[], partEmbs: Float32Array[], temperature = 0.01): number[][]` (a softmax over cosine/temperature; rows sum to 1)
  - `assignMonotonic(scores: number[][], floating: boolean[]): number[]` (part index per photo)
  - `isUnsure(row: number[]): boolean` (top − second < `UNSURE_MARGIN = 0.15`)

- [ ] **Step 1: Write failing tests**
  - `scoreParts rows sum to 1 and argmax matches nearest part`.
  - `assignMonotonic never decreases for non-floating photos`: scores whose argmax is `[0,2,1,2,3]` → result `[0,2,2,2,3]` (the one-off dip at index 2 is corrected).
  - `assignMonotonic keeps a floating photo's own best part`: with `floating=[false,true,false]`, part 1 = details. If row 1's argmax is details, the result at index 1 is 1, and indices 0 and 2 stay monotonic between themselves.
  - `isUnsure` true for `[0.4,0.35,0.25]`, false for `[0.8,0.1,0.1]`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `assignMonotonic` as a Viterbi pass over the non-floating photos: the cost is `−log(p+1e-9)`, transitions from part i to j are allowed only when j ≥ i, and the minimum total cost is backtracked. A photo is floating when its argmax part is floating **and** that probability > 0.5. Floating photos take their argmax.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): classify photos into parts with monotonic smoothing`.

---

### Task 7: Camera clock check

**Files:**
- Create: `src/main/core/clock.ts`
- Test: `test/core/clock.test.ts`

**Interfaces:**
- Consumes: `Camera`, `cosine`
- Produces: `findClockOffsets(cameras: Camera[], embs: Map<string, Float32Array>): ClockSuggestion[]`, with constants `SAME_MOMENT_SIM = 0.92`, `MIN_PAIRS = 2`, `MIN_OFFSET_MS = 120_000`, `AGREE_MS = 60_000`.

- [ ] **Step 1: Write failing tests**
  - `reference camera is the timed camera with most photos; it gets no suggestion`.
  - `detects 8h35m offset`: camera B's times are camera A's minus 8h35m. Three cross-camera pairs with similarity 0.95 → a suggestion for B with `offsetMs ≈ +30_900_000` (±60 s) and `pairs === 3`.
  - `no suggestion when < MIN_PAIRS agree or |offset| < 2 min`.
  - `untimed cameras are ignored`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. For each non-reference timed camera, find each photo's best match in the reference camera. Keep the matches with sim ≥ 0.92 and compute the offsets `ref.captureMs − photo.captureMs`. Take the median, count the offsets within `AGREE_MS` of the median, and suggest if the count is ≥ `MIN_PAIRS` and |median| ≥ `MIN_OFFSET_MS`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): detect camera clock offsets from matching moments`.

---

### Task 8: Merge cameras and the sorting pipeline

**Files:**
- Create: `src/main/core/merge.ts`, `src/main/core/pipeline.ts`
- Test: `test/core/merge.test.ts`, `test/core/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7, plus `applyCorrections` from Task 9 (pipeline accepts an optional `corrections` dep; pass `undefined` until Task 9 lands)
- Produces:
  - `mergeCameras(input: { cameras: Camera[]; partOf: Map<string,number>; offsets: Map<string,number>; embs: Map<string,Float32Array>; partOrder: string[]; parts: Part[] }): SortedPhoto[]` (with `unsure` set to false; the pipeline fills it in)
  - `runSort(dir: string, deps: { embedder: Embedder; parts: Part[]; corrections?: CorrectionSet; onProgress?: (stage: 'scan'|'analyse'|'arrange', done:number, total:number)=>void }): Promise<SortResult>`
  - `applyClockFix(result: SortResult, cameraId: string, deps): SortResult` (re-merges with that offset accepted. Offsets are **not** applied until the user confirms, as the spec requires.)

- [ ] **Step 1: Write failing tests (merge)**
  - `timed cameras interleave by corrected time within a part`.
  - `untimed camera keeps its own order and slots next to its most similar timed photo`: timed A = [a1@t1, a2@t2, a3@t3], untimed B = [b1, b2] with b1 ≈ a1 and b2 ≈ a3 → `[a1,b1,a2,a3,b2]`.
  - `untimed anchors never go backwards`: if b2's best match is earlier than b1's, b2 is placed right after b1.
  - `part with no timed photos interleaves cameras by relative position` (index/length, ties → camera with more photos first).
  - `parts appear in partOrder`, and `identical times break ties by fileNumber then name`.
- [ ] **Step 2: Write failing tests (pipeline)** with FakeEmbedder and Task 2-style fixtures:
  - `returns every readable photo exactly once` (count and set equality with the input minus skipped).
  - `does not apply clock suggestions until applyClockFix is called`.
  - `marks unsure from scores` and `reports skipped files`.
- [ ] **Step 3:** Run the tests. Expected: FAIL.
- [ ] **Step 4:** Implement `mergeCameras`. Within each part, timed photos get `key = captureMs + offset`. For an untimed camera, each photo's anchor = the key of the most cosine-similar timed photo in the same part. Anchors are made non-decreasing along the camera's own sequence (running max), and sorting by (key, untimed after timed at equal key, fileNumber, name) gives the order. Implement `runSort`: scan → groupCameras → embed (progress 'analyse') → scoreParts (+ corrections) → assignMonotonic per camera → findClockOffsets → merge with zero offsets.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(core): merge cameras into wedding-day order`.

---

### Task 9: Learn from corrections

**Files:**
- Create: `src/main/core/corrections.ts`
- Test: `test/core/corrections.test.ts`
- Modify: `src/main/core/pipeline.ts` (pass corrections into scoring)

**Interfaces:**
- Produces: `type CorrectionSet = { emb: number[]; partId: string }[]`, `addCorrection(set, emb: Float32Array, partId): CorrectionSet` (cap `MAX_CORRECTIONS = 5000`, dropping the oldest), `applyCorrections(scores: number[][], images: Float32Array[], set: CorrectionSet, parts: Part[]): number[][]` (for each image, if a correction has cosine ≥ `CORRECTION_SIM = 0.9`, add `CORRECTION_WEIGHT = 0.5` to that part's score and renormalise).

- [ ] **Step 1: Write failing tests:** `a near-identical corrected photo flips the argmax`, `dissimilar corrections change nothing`, `cap drops oldest`, `unknown partId (part deleted) is ignored`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, and wire `deps.corrections` into `runSort` after `scoreParts`.
- [ ] **Step 4:** Run `npx vitest run test/core`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat(core): learn from user's part corrections`.

---

### Task 10: Save numbered copies with the free-tier gate

**Files:**
- Create: `src/main/core/save.ts`, `src/main/core/licence.ts` (gate part only)
- Test: `test/core/save.test.ts`, `test/core/gate.test.ts`

**Interfaces:**
- Produces:
  - `FREE_PHOTO_LIMIT = 250`; `canSave(count: number, mode: SaveMode, licensed: boolean): { ok: true } | { ok: false; reason: 'limit' | 'perPartLocked' }`
  - `planOutput(photos: SortedPhoto[], parts: Part[], mode: SaveMode): { src: string; rel: string }[]`
  - `writeCopies(inputDir: string, plan, opts: { folder?: string; overwrite: boolean }): Promise<{ written: number } | { exists: true }>`

- [ ] **Step 1: Write failing tests**
  - Gate: `250 single unlicensed ok`, `251 single unlicensed → 'limit'`, `perPart unlicensed → 'perPartLocked'`, `licensed always ok`.
  - `single mode names 1.jpg..N.jpg with no padding`.
  - `perPart folders are "01 Arrival" etc, numbered among non-empty parts, numbering continuous across folders` (e.g. a 3-photo Arrival then a 2-photo Ceremony → `01 Arrival/1.jpg … 3.jpg`, `02 Ceremony/4.jpg, 5.jpg`).
  - `copies are byte-identical` (sha256 of src equals dest).
  - `returns {exists:true} when numbered/ exists and overwrite=false; with overwrite=true replaces only numbered/` (a sibling file and the originals are untouched, compared by mtime and hash).
  - `works with spaces and non-ASCII in input path`.
  - `writeCopies re-checks canSave and throws if not allowed` (defence in depth, taking the licence state as a parameter).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Write into `numbered.tmp-<rand>` first, then remove the old `numbered/` (only if overwrite is true) and rename. Use `fs.copyFile` with `COPYFILE_EXCL`. Sanitise part names for folder names (strip `\/:*?"<>|`).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): save numbered copies with free-tier limit`.

---

### Task 11: Licence activation (Lemon Squeezy)

**Files:**
- Modify: `src/main/core/licence.ts`
- Test: `test/core/licence.test.ts` (mocked `fetch`)

**Interfaces:**
- Produces:
  ```ts
  interface LicenceState { key: string; instanceId: string; customerName: string; activatedAt: string }
  activate(key: string, deps: { fetch: typeof fetch; instanceName: string; productId: number }): Promise<{ ok: true; state: LicenceState } | { ok: false; message: string }>
  deactivate(state: LicenceState, deps): Promise<{ ok: boolean; message?: string }>
  isLicensed(state: LicenceState | null): boolean   // local only — never calls the network
  ```
  - `LS_PRODUCT_ID` comes from build-time env `VITE_LS_PRODUCT_ID`. `BUY_URL` comes from `VITE_LS_CHECKOUT_URL`.

- [ ] **Step 1: Write failing tests**
  - `activate POSTs form-encoded license_key + instance_name to https://api.lemonsqueezy.com/v1/licenses/activate`, and on `{activated:true, instance:{id}, meta:{customer_name, product_id}}` returns a state with `customerName`.
  - `wrong product_id → ok:false, message "This key is for a different product."`
  - `activation limit reached → message "This key is already in use on 2 computers. Deactivate one in its Settings, or contact support."`
  - `network failure → message "Couldn't reach the licence server. Check your internet connection and try again."`
  - `isLicensed never calls fetch` (the fetch mock is asserted as not called).
  - `deactivate POSTs license_key + instance_id to /v1/licenses/deactivate`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Persist the state via `createStore('licence.json', null)` in `ipc.ts` (Task 12), not here.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): one-time licence activation`.

---

### Task 12: IPC bridge and thumbnails

**Files:**
- Create: `src/shared/api.ts`, `src/main/ipc.ts`, `src/main/thumbs.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`
- Test: `test/main/thumbs.test.ts`, `test/main/ipc.test.ts` (handlers called directly with fake deps)

**Interfaces:**
- Produces `window.api` (typed in `src/shared/api.ts`):
  ```ts
  chooseFolder(): Promise<string|null>
  sort(dir: string): Promise<SortResult>                    // progress via onProgress
  onProgress(cb: (p:{stage:string;done:number;total:number})=>void): () => void
  onModelDownload(cb: (pct:number)=>void): () => void
  applyClockFix(cameraId: string): Promise<SortResult>
  recordCorrection(path: string, partId: string): Promise<void>
  save(req:{ dir:string; photos:SortedPhoto[]; parts:Part[]; mode:SaveMode; overwrite:boolean }): Promise<{written:number}|{exists:true}|{blocked:'limit'|'perPartLocked'}>
  getParts(): Promise<Part[]>; setParts(p: Part[]): Promise<void>
  licence(): Promise<{ licensed:boolean; customerName?:string }>
  activate(key:string): Promise<{ok:true;customerName:string}|{ok:false;message:string}>
  deactivate(): Promise<{ok:boolean;message?:string}>
  openBuyPage(): Promise<void>
  ```
  - Thumbnails: `thumb://<encodeURIComponent(path)>?w=320|1600` serves a sharp-resized JPEG, cached in `userData/thumbs/<sha1(path+mtime+w)>.jpg`.

- [ ] **Step 1: Write failing tests:** `thumbnail is ≤ requested width and cached on second call` (the second call doesn't invoke sharp), `thumb path with spaces/non-ASCII decodes`, `save handler returns {blocked:'limit'} for 251 photos unlicensed`, `recordCorrection stores embedding from the last sort`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Register `thumb` as a privileged scheme before `app.ready`. Use `contextIsolation: true` and `sandbox: true`, and only allow the `thumb://` scheme to read paths that appeared in the last scan.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm run dev`, call `window.api.chooseFolder()` from devtools, and confirm the dialog opens.
- [ ] **Step 5:** Commit: `feat(main): IPC bridge and thumbnail protocol`.

---

### Task 13: Reorder logic (pure)

**Files:**
- Create: `src/renderer/state/order.ts`, `src/renderer/state/store.ts`
- Test: `test/renderer/order.test.ts`

**Interfaces:**
- Produces (all pure, returning new arrays):
  ```ts
  movePhotos(photos: SortedPhoto[], paths: string[], toIndex: number): SortedPhoto[]          // takes partId of the photo it lands after (or before if at index 0)
  movePhotosToPart(photos, paths: string[], partId: string, partOrder: string[]): SortedPhoto[] // appended at end of that part, ordered by their current order
  moveSection(partOrder: string[], partId: string, toIndex: number): string[]
  orderByParts(photos, partOrder): SortedPhoto[]                                              // stable regroup after moveSection
  insertPartBetween(partOrder, parts: Part[], afterPartId: string|null, name: string): { partOrder: string[]; parts: Part[]; newId: string }
  numberOf(photos, path): number                                                               // 1-based position
  sectionSizes(photos, partOrder): { partId: string; count: number }[]                         // empty parts omitted
  nextUnsure(photos, fromPath: string|null): string|null                                       // wraps around
  ```
  - zustand store: `{ dir, result, photos, partOrder, parts, selected: string[], current: string|null, clockDismissed: string[] }`, with actions wrapping the functions above.

- [ ] **Step 1: Write failing tests:** for each function, one happy-path test plus: `movePhotos of a multi-selection keeps their relative order`, `moveSection then orderByParts moves all its photos and numbering follows`, `insertPartBetween + movePhotosToPart creates a "First look" section between Signing and Confetti`, `nextUnsure wraps to the first unsure`, `sectionSizes omits empty parts`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(renderer): pure reorder logic and store`.

---

### Task 14: Drop screen and review screen (timeline strip)

**Files:**
- Create: `src/renderer/theme.css`, `src/renderer/screens/DropScreen.tsx`, `src/renderer/screens/ReviewScreen.tsx`, `src/renderer/components/{Timeline,Strip,Preview,ClockBanner}.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `test/renderer/review.test.tsx` (vitest + @testing-library/react + jsdom, with `window.api` mocked)

**Interfaces:**
- Consumes: the store and order functions (Task 13), `window.api` (Task 12)

- [ ] **Step 1: Write failing tests**
  - `DropScreen calls api.sort with the dropped folder path` (simulate a drop event whose `files[0].path` is a directory), and `"Choose folder" calls api.chooseFolder`.
  - `shows progress text "Analysing 40 of 124"` and the model download message `"Downloading the photo model (one time only) — 37%"`.
  - `ReviewScreen header shows "<folder name> · 124 photos · 2 cameras"`.
  - `ClockBanner shows "A7R II clock looks 8h 35m slow"` with Fix and Ignore. Fix calls `api.applyClockFix`, and Ignore hides it.
  - `Timeline renders one section per non-empty part with width proportional to count`.
  - `keyboard: ArrowRight selects next photo; key "4" moves selected photos to the 4th part in partOrder and calls api.recordCorrection`.
  - `"Next unsure" selects the next unsure photo`.
  - `Skipped files show "2 files couldn't be read" with a list on click`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the layout from the spec sketch. The background is `#1c1c1e`, panels `#2a2a2d`, text `#e8e6e1`, and the unsure outline amber `#e0a930`. Each part gets a colour from a fixed 15-colour muted palette. Drag and drop uses @dnd-kit: thumbnails are sortable in the strip, and timeline sections are both sortable (`moveSection`) and droppable targets (`movePhotosToPart`), with a droppable gap between sections that prompts for a new part name. Shift/Cmd-click does multi-select. Preview shows `thumb://…?w=1600`, number, part name, camera label and corrected time (HH:mm). Use a virtualised strip (render only visible thumbnails) so 1,500 photos stay smooth.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm run dev` against a folder of 20 test JPEGs. Drag a photo, drag a section, press 1–9, and confirm the numbering updates.
- [ ] **Step 5:** Commit: `feat(renderer): drop screen and timeline review`.

---

### Task 15: Save, unlock and settings dialogs

**Files:**
- Create: `src/renderer/components/{SaveDialog,UnlockDialog,SettingsDialog}.tsx`
- Test: `test/renderer/dialogs.test.tsx`

**Interfaces:**
- Consumes: `window.api.save/licence/activate/deactivate/openBuyPage/getParts/setParts`

- [ ] **Step 1: Write failing tests**
  - `SaveDialog: "Folder per part" shows a lock when unlicensed; choosing it opens UnlockDialog`.
  - `SaveDialog: 251 photos unlicensed → Save opens UnlockDialog with "Free version saves up to 250 photos"`.
  - `SaveDialog: {exists:true} → asks "A numbered folder is already here. Replace it?"`, and confirming re-calls save with `overwrite:true`.
  - `SaveDialog success shows "Saved 124 photos to numbered" with "Show folder"`.
  - `UnlockDialog: Buy button label "Buy for £14.99" calls openBuyPage; pasting a key + Activate shows "Licensed to Jane Smith"; error message from api shown inline`.
  - `SettingsDialog: parts list reorders by drag and saves via setParts; rename and add/remove work; licence section shows "Licensed to …" + "Deactivate this computer"`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement with the same theme. "Show folder" uses `shell.showItemInFolder` via a new `api.showFolder(path)` (add it to `src/shared/api.ts`).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(renderer): save, unlock and settings dialogs`.

---

### Task 16: Packaging, accuracy check and benchmark

**Files:**
- Create: `electron-builder.yml`, `scripts/bakewell-eval.ts`, `scripts/bench.ts`, `build/icon.png` (placeholder 1024², replaced later), `README.md`
- Test: `scripts/bakewell-eval.ts` (runs against a local copy of the Bakewell folder)

**Interfaces:**
- Consumes: `runSort`, `createSiglipEmbedder`, `test/fixtures/bakewell-order.txt` (the approved order: 124 base names)

- [ ] **Step 1:** Write `electron-builder.yml`:
  - `win: target nsis`, with `nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: always }`
  - `linux: target [AppImage, flatpak]`, `category: Graphics`, Flatpak runtime `org.freedesktop.Platform` 24.08 with `--filesystem=home` for the photo folders
  - `mac: target dmg, arch [arm64, x64]` (config only)
  - `asarUnpack` for `sharp` and `onnxruntime-node`
- [ ] **Step 2:** Write `scripts/bakewell-eval.ts <dir>`. It runs `runSort` with the real embedder, applies every clock suggestion, and prints: (a) the share of photos whose position is within ±3 of the answer key, (b) the Kendall-tau distance to the answer key, (c) the clock suggestion for the `BHV` camera. Expected: the suggestion is within 2 minutes of +8h35m and (a) ≥ 80%. If (a) is lower, tune the prompts in `parts.ts` only, and record the result in `README.md`.
- [ ] **Step 3:** Write `scripts/bench.ts <dir> <n>`. It duplicates the photos to n files in a temp dir and times `runSort`. Run it with n=1000 and record the time in `README.md`. Expected: < 300 s on the dev machine. If it's slower, reduce the decode size first (sharp `fastShrinkOnLoad`), then the batch size.
- [ ] **Step 4:** Run `npm run build && npx electron-builder --linux AppImage`. Expected: `dist/*.AppImage` launches, sorts a folder, and saves. Then run `npx electron-builder --win nsis` (via wine or CI). Expected: `dist/*Setup*.exe`.
- [ ] **Step 5:** Commit: `build: installers, accuracy eval and benchmark`.

---

## Not in this plan (follow-ups, by spec)

- Mac `.dmg` signing and notarisation (needs the Apple Developer account)
- Windows code-signing certificate
- Flathub submission
- Lemon Squeezy store setup (product, licence keys with an activation limit of 2, checkout URL). This is the seller's account task, and it provides `VITE_LS_PRODUCT_ID` / `VITE_LS_CHECKOUT_URL`.
- Approach C (a vision-language model for unsure photos)
