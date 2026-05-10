# slidev-addon-tts

A [Slidev](https://sli.dev) addon that reads speaker notes aloud using the **Google Cloud Text-to-Speech API** (Cloud TTS API), synchronized with slide navigation and click events.

---

## Features

- **Pre-generated mode** (recommended for production): Audio files are generated at build time and served as static AAC (M4A) files. No API key required at runtime.
- **On-demand mode** (for local development): The browser calls the Cloud TTS API directly on each slide/click navigation.
- SSML `<mark>` timepoints for precise seek-based playback within batch audio files.
- **Two-layer caching** in on-demand mode: in-session memory cache (decoded AudioBuffer) + IndexedDB (persistent across page reloads) to avoid redundant API calls. When audio is cached but timepoints are missing, only the timepoints are re-fetched.
- Prefetching of next-slide audio in the background.
- **Playback indicator** in the bottom-right corner: ▶ when idle (click to play), 🔊 while playing (click to pause), hidden after natural completion and in print/export mode.
- **Play/pause toggle**: click the indicator during playback to pause; click again to resume from the exact position where playback stopped.
- **Smart interrupt logic**: when you navigate to a new slide while audio is playing, the transition happens immediately unless fewer than 5 seconds remain — in that case, the current audio finishes before the new slide's audio begins.
- **Hot reload support** (on-demand mode only): when speaker note text changes in the Slidev dev server, the audio cache for that slide is invalidated and the updated notes are played automatically.

> **Note on voice selection**: SSML mark timepoints are supported only by **Standard** and **WaveNet** voices. Chirp 3 HD voices do not return timepoints and cannot be used with this addon's batch architecture.

---

## Architecture

### Pre-generated mode (`usePregenerated: true`)

```
Build time:
  slides.md notes → SSML (with <mark> tags) → Cloud TTS API
    → WAV (base64) → ffmpeg → AAC (M4A)
    → timepoints → manifest.json

Runtime:
  Slide navigation → manifest.json lookup → seek AudioBuffer → play
```

Audio files are stored in `public/tts/` as batch files (multiple slides per file):

```
public/tts/
├── manifest.json      # timestamp map: page × click → seconds
├── batch-1.m4a        # slides 1–N
├── batch-2.m4a        # slides N+1–M
└── ...
```

### On-demand mode (`usePregenerated: false`)

```
Runtime:
  Slide navigation → build SSML for current slide → Cloud TTS API (MP3)
    → decode → seek AudioBuffer → play
    → timepoints cached in memory; audio cached in IndexedDB
```

---

## Installation

```bash
npm install @katzumi/slidev-addon-tts
```

Add the addon to your `slides.md` frontmatter:

```yaml
addons:
  - slidev-addon-tts
```

---

## Configuration

Add `ttsConfig` to the headmatter of `slides.md`:

```yaml
ttsConfig:
  voiceName: "ja-JP-Neural2-B"    # WaveNet/Standard voice required for timepoints
  languageCode: "ja-JP"
  clickBreakTime: "500ms"         # pause inserted after each [click] mark in SSML
  usePregenerated: true           # true = static files, false = on-demand API calls
  prefetch: true                  # prefetch next slide's audio in the background
```

| Option | Type | Default | Description |
|---|---|---|---|
| `voiceName` | `string` | `"ja-JP-Neural2-B"` | Cloud TTS voice name |
| `languageCode` | `string` | `"ja-JP"` | BCP-47 language code |
| `clickBreakTime` | `string` | `"500ms"` | Pause duration between click sections |
| `usePregenerated` | `boolean` | `true` | `true`: static files, `false`: on-demand |
| `prefetch` | `boolean` | `true` | Background prefetch of next slide |

### API Key configuration

> Never put API keys in `slides.md`.

Add the following to `.env.local` (both modes use the same variable):

```
VITE_CLOUD_TTS_API_KEY=your_api_key_here
```

The `VITE_` prefix is a Vite convention: only variables with this prefix are exposed to the browser via `import.meta.env`. The build-time script reads the same `.env.local` file via `process.env.VITE_CLOUD_TTS_API_KEY`, so one variable covers both modes.

---

## Speaker notes format

Notes are written as HTML comments in `slides.md`. Use `[click]` to split into sections aligned with click events:

```markdown
---
layout: default
---

# Slide Title

<!--
This text plays when the slide first appears.

[click]

This text plays after the first click.

[click]

This text plays after the second click.
-->
```

**Parsing rules:**
- If a slide has multiple HTML comments, the **last** one is used as the TTS script.
- HTML comments inside code blocks (` ``` ` or `~~~`) are ignored.
- A slide without an HTML comment produces no audio (the indicator is hidden for that slide/click).

---

## On-demand mode — Verification

1. Add `VITE_CLOUD_TTS_API_KEY` to `.env.local`:

   ```
   VITE_CLOUD_TTS_API_KEY=your_api_key_here
   ```

2. Set `usePregenerated: false` in `slides.md`:

   ```yaml
   ttsConfig:
     usePregenerated: false
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open the browser DevTools console and navigate to the next slide.

   **Expected logs:**
   ```
   [slidev-addon-tts] requestPlay slide 2, click 0
   [slidev-addon-tts] [on-demand] calling Cloud TTS API: slide 2
   [slidev-addon-tts] [on-demand] generated and cached: slide 2, N marks
   [slidev-addon-tts] [on-demand] playing slide 2, click 0 (0s ~ Xs)
   ```

5. The 🔊 indicator appears in the bottom-right corner while audio is playing.

6. Navigating to the same slide again shows `cache hit` — the IndexedDB cache is working.

---

## Pre-generated mode — Verification

### Step 1: Generate audio files

Run the generation script from your **project root**:

```bash
VITE_CLOUD_TTS_API_KEY=your_api_key_here npx slidev-addon-tts
```

To specify a slides file explicitly:

```bash
VITE_CLOUD_TTS_API_KEY=your_api_key_here npx slidev-addon-tts --slides my-slides.md
```

To regenerate all files (ignore existing cache):

```bash
VITE_CLOUD_TTS_API_KEY=your_api_key_here npx slidev-addon-tts --force
```

You can also add these as npm scripts in your own `package.json`:

```json
"scripts": {
  "build:tts":       "slidev-addon-tts",
  "build:tts:force": "slidev-addon-tts --force"
}
```

Optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `VITE_CLOUD_TTS_API_KEY` | *(required)* | Google Cloud TTS API key |
| `TTS_VOICE` | `ja-JP-Neural2-B` | Voice name |
| `TTS_LANG` | `ja-JP` | Language code |
| `TTS_BREAK_TIME` | `500ms` | Pause between click sections |

> **Rate limiting**: the script automatically handles HTTP 429 responses from the Cloud TTS API. It retries up to 5 times, honouring the `retryDelay` from the API error response with an exponential backoff ceiling of 5 minutes.

### Step 2: Verify generated files

After the script completes, confirm the following files exist under `public/tts/`:

```
public/tts/
├── manifest.json        ← must exist
├── batch-1.m4a          ← or batch-1.wav if ffmpeg is not installed
└── batch-2.m4a          ← additional batches if slides overflow 4,500 bytes
```

Check `manifest.json` content:

```json
{
  "version": 2,
  "slides": {
    "2": {
      "file": "batch-1.m4a",
      "clicks": {
        "0": { "start": 0.0,  "end": 3.84 },
        "1": { "start": 3.84, "end": 8.1  }
      }
    },
    "3": {
      "file": "batch-1.m4a",
      "clicks": {
        "0": { "start": 8.1,  "end": 12.5 },
        "1": { "start": 12.5, "end": null  }
      }
    }
  }
}
```

Each slide must have a `"0"` click entry and entries for every `[click]` in its notes. `end: null` means playback continues to the end of the batch file.

### Step 3: Enable pre-generated mode

Set `usePregenerated: true` in `slides.md`:

```yaml
ttsConfig:
  usePregenerated: true
```

### Step 4: Start the dev server and verify playback

```bash
npm run dev
```

Open DevTools console and navigate slides.

**Expected logs:**
```
[slidev-addon-tts] [static] slide 2, click 0
[slidev-addon-tts] [static] slide 2, click 1
```

No API calls are made at runtime. Audio is loaded from `public/tts/batch-1.m4a` and seeked to the correct position using timestamps from `manifest.json`.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `manifest.json not found` | File not generated or wrong directory | Run `npx slidev-addon-tts` from the project root |
| `timepoints: []` empty | Voice does not support SSML marks | Switch to a WaveNet or Standard voice |
| Audio plays entire slide on every click | Empty `timepoints` in manifest | Regenerate with a supported voice |
| `ffmpeg` not found warning | ffmpeg not installed | Install ffmpeg or accept WAV fallback |
| Skipped slides in manifest | Files already exist (skipped) | Use `--force` flag to regenerate |

---

## GitHub Actions — Pre-generated mode

Add the following to your deploy workflow. Ubuntu runners have ffmpeg pre-installed.

```yaml
- name: Generate TTS audio (AAC + manifest.json)
  env:
    VITE_CLOUD_TTS_API_KEY: ${{ secrets.CLOUD_TTS_API_KEY }}
    TTS_VOICE: ja-JP-Neural2-B
    TTS_LANG: ja-JP
    TTS_BREAK_TIME: 500ms
  if: ${{ env.VITE_CLOUD_TTS_API_KEY != '' }}
  run: npx slidev-addon-tts
```

Set `CLOUD_TTS_API_KEY` as a repository secret in GitHub → Settings → Secrets and variables → Actions. The secret name in GitHub can differ from the env variable name — here the secret is mapped to `VITE_CLOUD_TTS_API_KEY` which is what the script reads.

---

## File structure

```
slidev-addon-tts/
├── index.ts                    # exports isPlaying, TtsAddonConfig
├── types.ts                    # TtsAddonConfig interface
├── global-bottom.vue           # playback controller + 🔊 indicator
├── setup/main.ts               # re-exports isPlaying
├── components/
│   └── TtsIndicator.vue        # standalone indicator component
├── lib/
│   ├── ssml-builder.ts         # SSML generation with <mark> and <break>
│   ├── cloud-tts-client.ts     # Cloud TTS API client (browser + Node.js)
│   ├── manifest.ts             # manifest.json loader and position resolver
│   ├── static-loader.ts        # batch file seek playback (pre-generated mode)
│   ├── tts-manager.ts          # mode switcher, on-demand playback + IDB cache
│   ├── audio-context.ts        # AudioContext singleton
│   ├── idb-cache.ts            # IndexedDB audio cache
│   └── state.ts                # isPlaying reactive ref
└── scripts/
    └── generate-tts.ts         # build-time audio generation (Node.js)
```

---

## Ignored files

Add the following to `.gitignore` to avoid committing generated audio files and local secrets:

```
public/tts/
.env.local
```

---

## License

MIT
