---
theme: default
ttsConfig:
  voiceName: "en-US-Neural2-D"
  languageCode: "en-US"
  usePregenerated: false
  clickBreakTime: "500ms"
  prefetch: true
  dictionary:
    - from: "SSML"
      to: "Speech Synthesis Markup Language"
    - from: "VITE_CLOUD_TTS_API_KEY"
      to: "Vite Cloud T-T-S A-P-I Key"
---

# slidev-addon-tts

### Voice-Narrate Your Slides with Google Cloud Text-to-Speech

A Slidev addon that reads speaker notes aloud, synchronized with slide navigation and click events.

<!--
Welcome to slidev-addon-tts. This addon connects your Slidev presentations to the Google Cloud Text-to-Speech API, reading your speaker notes aloud as you navigate through slides. If you can hear this, the addon is working correctly. Let's walk through the complete setup.
-->

---
ttsDict: false
---

# How it works

<v-clicks>

- This addon reads your speaker notes aloud with Cloud TTS.  
- It uses SSML to align narration with slide click events.

</v-clicks>

<!--
I will explain how this add-on works.  
[click] SSML stands for Speech Synthesis Markup Language.
[click] The dictionary makes sure the acronym is spoken naturally.
-->

---

# Features

- <span v-mark="{ at: 1, type: 'highlight', color: '#fbbf24'}">**Pre-generated mode**</span> — audio built at compile time; no API key needed at runtime
- <span v-mark="{ at: 2, type: 'highlight', color: '#86efac'}">**On-demand mode**</span> — browser calls Cloud TTS on each navigation
- <span v-mark="{ at: 3, type: 'highlight', color: '#93c5fd'}">SSML `<mark>` timepoints</span> for click-synchronized playback
- Two-layer cache: in-memory decoded audio + IndexedDB persistence
- Play/pause indicator in the bottom-right corner
- Smart prefetch of the next slide's audio in the background

<!--
This addon supports two distinct playback modes, each suited to a different workflow.

[click]

Pre-generated mode is recommended for production. Audio files are generated at build time and served as static AAC (M4A) files alongside your slides. No API key is needed when you're actually presenting.

[click]

On-demand mode is ideal for local development. Each time you navigate to a slide, the browser calls the Cloud TTS API, decodes the audio, and plays it immediately. A two-layer cache — in-memory for the current session and IndexedDB for persistence across reloads — prevents redundant API calls.

[click]

Both modes use SSML mark timepoints to precisely align audio playback with your click events, so each section of your notes plays at exactly the right moment.
-->

---
ttsDict:
  - from: "TTS"
    to: "Text to Speech"  
---

# Prerequisites

| Requirement | Minimum Version |
|---|---|
| <span v-mark="{ at: 1, type: 'highlight', color: '#fbbf24'}">Node.js</span> | `>= 22.0.0` |
| <span v-mark="{ at: 2, type: 'highlight', color: '#fbbf24'}">Slidev</span> | `>= 0.49.0` |
| <span v-mark="{ at: 3, type: 'highlight', color: '#fbbf24'}">Google Cloud account</span> | for API key |

Check your versions:

```bash
node --version
npx slidev --version
```

<!--
Before installing, verify that your environment meets these requirements.

[click]

Node.js 22 or higher is required. You can check your version by running node dash-dash-version in your terminal.

[click]

Slidev 0.49 or higher is also required. This addon relies on APIs introduced in that version of the Slidev client.

[click]

Finally, you need a Google Cloud account to generate a TTS API key. We'll go through that process step by step in the next two slides.
-->

---

# Installation

Installation takes two steps — no additional configuration required.

<v-click>

**Step 1** — Install the package

```bash
npm install @katzumi/slidev-addon-tts
```

</v-click>

<v-click>

**Step 2** — Add the addon to your `slides.md` frontmatter

```yaml
---
addons:
  - "@katzumi/slidev-addon-tts"
---
```

The TTS indicator appears automatically in the bottom-right corner of every slide that has speaker notes.

</v-click>

<!--
Installation takes two steps and requires no additional configuration to get started.

[click]

First, install the package from npm. This adds the addon and its TypeScript types to your project.

[click]

Then declare the addon in your slides.md frontmatter using the addons field. Once added, the global playback controller and indicator are injected into every slide automatically.
-->

---

# Google Cloud Setup

<v-click>

**1. Create a Project** — Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.

</v-click>

<v-click>

**2. Enable the API** — Navigate to **APIs & Services › Library**, search for **"Cloud Text-to-Speech API"**, and click **Enable**.

</v-click>

<v-click>

**3. Create an API Key** — Go to **APIs & Services › Credentials**, click **Create Credentials › API key**.

</v-click>

<v-click>

**4. Restrict the Key** *(recommended)* — Edit the key → **API restrictions** → select **Cloud Text-to-Speech API** only.

</v-click>

<!--
Now let's get the Google Cloud API key you'll need to generate audio.

[click]

Start at the Google Cloud Console. Create a new project specifically for your presentations, or select an existing project. Keep note of the project ID.

[click]

Next, enable the Cloud Text-to-Speech API. Go to APIs and Services, then Library. Type "Text-to-Speech" in the search box, select the result, and click Enable. It activates within a few seconds.

[click]

Now create an API key. Navigate to Credentials under APIs and Services, click Create Credentials, and select API key. The key is generated immediately and shown in a dialog — copy it now.

[click]

For security, restrict the key to the Text-to-Speech API only. Click the key name to edit it, expand API restrictions, select "Restrict key", and choose Cloud Text-to-Speech API from the list. This prevents misuse if the key is ever exposed.
-->

---

# Configure `.env.local`

Create `.env.local` in your **project root** — never commit this file.

<v-click>

```bash
# .env.local
VITE_CLOUD_TTS_API_KEY=your_api_key_here
```

</v-click>

<v-click>

Add both entries to `.gitignore`:

```
.env.local
public/tts/
```

</v-click>

<v-click>

> The `VITE_` prefix exposes the variable to the browser via `import.meta.env`.  
> The build-time script reads the same variable via `process.env`.  
> A single variable covers both runtime and build-time usage.

</v-click>

<!--
With your API key in hand, store it securely in a local environment file.

[click]

Create a file named .env.local in your project root — the same directory as your slides.md. Set VITE_CLOUD_TTS_API_KEY to your API key. The Vite prefix tells Vite to expose this variable to the browser bundle, which is how the on-demand mode accesses it at runtime.

[click]

Make sure .env.local is listed in your .gitignore so it's never committed to version control. Also add public/tts/ — that's where pre-generated audio files are stored, and they're typically large enough that you don't want them in your repository.

[click]

The build-time generation script reads the same .env.local file via Node's process.env, so a single variable covers both runtime and build-time usage. You don't need a separate configuration for the two modes.
-->

---
layout: two-cols
---

# Configure `ttsConfig`

::left::

```yaml
---
ttsConfig:
  voiceName: "en-US-Neural2-D"
  languageCode: "en-US"
  clickBreakTime: "500ms"
  usePregenerated: false
  prefetch: true
---
```

::right::

<v-click>

**`voiceName`** — WaveNet or Neural2 voice required. Check [Google Cloud TTS docs](https://cloud.google.com/text-to-speech/docs/voices) for available voice names.

</v-click>

<v-click>

**`languageCode`** — BCP-47 code matching your voice (`en-US`, `en-GB`, `ja-JP`).

</v-click>

<v-click>

**`clickBreakTime`** — pause inserted between `[click]` sections in the generated SSML. Default: `500ms`.

</v-click>

<v-click>

> ⚠️ Only **WaveNet** and **Standard** voices support SSML mark timepoints.  
> **Chirp 3 HD** voices do **not** work with this addon.

</v-click>

<!--
Configure the addon's behavior using the ttsConfig block in your frontmatter.

[click]

The voiceName field selects the Google Cloud TTS voice. Choose a WaveNet or Neural2 voice for your language. Neural2 voices offer higher quality; Standard voices are lower cost. The full list of available voices is in the Google Cloud TTS documentation.

[click]

Set languageCode to the BCP-47 code matching your voice. Use en-US for American English, en-GB for British English, or ja-JP for Japanese. The code must match the voice's supported language.

[click]

The clickBreakTime controls the length of the pause inserted between click sections in the generated SSML. Five hundred milliseconds is a comfortable default, but you can increase it if you prefer longer pauses between points.

[click]

This is critical: only WaveNet and Standard voices return SSML mark timepoints, which are required for click-synchronized playback. Chirp 3 HD voices do not return timepoints and will not work correctly with this addon.
-->

---

# Speaker Notes Format

Write notes as HTML comments with `[click]` markers to align with click events:

```markdown
# Your Slide Title

<v-clicks>
- First bullet
- Second bullet
- Third bullet
</v-clicks>

<!--
This plays when the slide appears.
[click] This plays after the first click — aligned with the second bullet.
[click] This plays after the second click — aligned with the third bullet.
-->
```

<v-click>

Each `[click]` marker creates a new narration section that syncs with a Slidev click event.

</v-click>

<v-click>

Multiple HTML comments per slide → only the <span v-mark="{ type: 'circle', color: '#f87171'}">last one</span> is used as the TTS script.

</v-click>

<v-click>

No HTML comment → no audio; the TTS indicator is <span v-mark="{ type: 'strike-through', color: '#94a3b8'}">hidden</span> for that slide automatically.

</v-click>


<!--
Speaker notes are written as HTML comments directly in your slides.md file.

[click]

Place your narration text inside the comment block. Each [click] marker splits the narration into a new section that aligns with a Slidev click event. The first section plays when the slide appears; subsequent sections play when the user clicks.

[click]

If a slide has multiple HTML comment blocks — for example, a component that generates its own comment — only the last comment is treated as the TTS script. Comments inside triple-backtick code fences are ignored entirely.

[click]

Slides with no HTML comment produce no audio. The TTS indicator is automatically hidden for those slides so it doesn't confuse the audience.
-->

---


# Pronunciation Dictionary

Use global and slide-specific dictionaries to customize how words are pronounced:

::left::

<v-click at="1">

**Global dictionary** in frontmatter:

```yaml
tts:
  dictionary:
    - from: "TTS"
      to: "Text to Speech"
    - from: "SSML"
      to: "Speech Synthesis Markup Language"
```

Applied to all slides.

</v-click>


::right::

<v-click at="2">

**Slide-specific overrides** per slide:

```yaml
---
layout: default
ttsDict:
  - from: "UoW"
    to: "Unit of Work"
---
```

Override or add pronunciation for this slide only.

</v-click>

<!--
Both global and slide-specific dictionaries help ensure words are pronounced correctly.

[click]

Add a global dictionary to your presentation frontmatter. Each entry has a "from" field — the text to match — and a "to" field — how it should be spoken. These rules apply to every slide automatically.

[click]

You can also add slide-specific pronunciation overrides using the ttsDict field in a slide's frontmatter. This takes priority over global entries with the same "from" value, allowing you to fine-tune pronunciation on a per-slide basis.
-->

---

# Disable Global Dictionary

Sometimes you want a slide to ignore the global dictionary entirely and use only slide-specific entries — or no dictionary at all.

<Transform :scale="0.9">

<v-click>

Set `ttsDict: false` to disable the global dictionary for that slide:


```yaml
---
layout: default
ttsDict: false
---
```

</v-click>

<v-click>

The global dictionary is ignored. No pronunciation overrides are applied unless you add slide-specific entries:


```yaml
---
layout: default
ttsDict: false
tts:
  dictionary:
    - from: "API"
      to: "Application Programming Interface"
---
```


</v-click>

<v-click>

In this example, only the `API` entry applies — all global dictionary entries are disabled for this slide.

</v-click>

</Transform>

<!--
You can disable the global dictionary on specific slides when needed.

[click]

Set ttsDict to false in the slide's frontmatter. This completely ignores all global dictionary entries and uses no dictionary for that slide.

[click]

If you want slide-specific entries without the global dictionary, combine ttsDict: false with your own dictionary under the tts field. This gives you fine-grained control over pronunciation on a per-slide basis.

[click]

This is useful when a particular slide uses technical terms that should not be transformed, or when you want a different pronunciation strategy for that one slide only.
-->

---

# On-demand Mode

Set `usePregenerated: false` and ensure `VITE_CLOUD_TTS_API_KEY` is set in `.env.local`.

<v-click>

```bash
npm run dev
```

</v-click>

<v-click>

Open DevTools and navigate to a slide — expected console output:

```
[slidev-addon-tts] [on-demand] calling Cloud TTS API: slide 2
[slidev-addon-tts] [on-demand] generated and cached: slide 2, 3 marks
[slidev-addon-tts] [on-demand] playing slide 2, click 0 (0s ~ 4.2s)
```

</v-click>

<v-click>

Navigate back → <span v-mark="{ type: 'highlight', color: '#86efac'}">`cache hit`</span> in the logs — IndexedDB caching is active, no redundant API calls.

</v-click>

<v-click>

Edit notes while the dev server is running → cache invalidates → updated audio plays on next navigation (<span v-mark="{ type: 'highlight', color: '#93c5fd'}">**hot reload**</span>).

</v-click>

<!--
On-demand mode is the simplest way to verify the addon is working.

[click]

Set usePregenerated to false in your ttsConfig, make sure VITE_CLOUD_TTS_API_KEY is set in .env.local, and run the dev server. Open the browser DevTools console before navigating.

[click]

When you navigate to a slide with speaker notes, you'll see a sequence of log messages in the console. The addon builds SSML, calls the Cloud TTS API, decodes the returned audio, and begins playback. The 🔊 indicator appears in the bottom-right corner while audio is playing.

[click]

Navigate away and then back to the same slide. This time you'll see "cache hit" in the logs instead of an API call. The audio was saved to IndexedDB on first load and is retrieved instantly on subsequent visits.

[click]

Hot reload is also active in on-demand mode. If you edit your speaker notes while the dev server is running, the addon detects the change, invalidates the IndexedDB cache for that slide, and plays the updated notes on the next navigation.
-->

---

# Pre-generated Mode

Audio is generated at build time — <span v-mark="{ type: 'highlight', color: '#fbbf24'}">no API key needed at runtime</span>.

<v-click>

**Step 1** — Generate audio files

```bash
VITE_CLOUD_TTS_API_KEY=your_key npx slidev-addon-tts
```

</v-click>

<v-click>

**Step 2** — Verify `public/tts/`

```
public/tts/
├── manifest.json      ← timestamp map: slide × click → seconds
├── batch-1.m4a        ← AAC (requires ffmpeg) or .wav fallback
└── batch-2.m4a        ← additional batches for large decks
```

</v-click>

<v-click>

**Step 3** — Set `usePregenerated: true`, start the server, and verify — no API calls, only static seeks:

```
[slidev-addon-tts] [static] slide 2, click 0
[slidev-addon-tts] [static] slide 2, click 1
```

</v-click>

<v-click>

> **Note**: The script reads `slides.md` by default. Use `--slides your-file.md` or set `SLIDES_FILE=your-file.md` to specify a different filename.

</v-click>

<!--
Pre-generated mode is recommended for production — audio is served as static files and no API key is needed when presenting.

[click]

Run the build:tts script with your API key. The script reads your slides.md, generates SSML with mark tags, calls the Cloud TTS API, converts WAV to AAC (M4A) using ffmpeg, and writes the files to public/tts/. If ffmpeg is not installed, WAV files are written instead.

[click]

After the script finishes, verify that public/tts/ contains a manifest.json and at least one batch file. The manifest maps each slide number and click index to a timestamp in seconds. Check that every slide has a "0" click entry and entries for each [click] in its notes.

[click]

Switch usePregenerated to true in your frontmatter and start the dev server. Navigate the slides and check DevTools. You should see only static log messages — the addon is seeking within the pre-generated audio files using the manifest timestamps. No API calls are made at runtime.

[click]

To force regeneration of all files — for example after editing notes — run with the --force flag: npx slidev-addon-tts --force. This ignores existing batch files and regenerates everything from scratch. The script automatically retries on HTTP 429 rate-limit responses with exponential backoff.
-->

---

# GitHub Actions Integration

Automate audio generation in your CI/CD deploy workflow.

<v-click>

```yaml
- name: Generate TTS audio
  env:
    VITE_CLOUD_TTS_API_KEY: ${{ secrets.CLOUD_TTS_API_KEY }}
    TTS_VOICE: en-US-Neural2-D
    TTS_LANG: en-US
    TTS_BREAK_TIME: 500ms
  if: ${{ env.VITE_CLOUD_TTS_API_KEY != '' }}
  run: npx slidev-addon-tts

- name: Build slides
  run: npm run build
```

</v-click>

<v-click>

Add your key as a repository secret:  
**GitHub › Settings › Secrets and variables › Actions › New repository secret**  
Name: <span v-mark="{ type: 'highlight', color: '#fbbf24'}">`CLOUD_TTS_API_KEY`</span>

</v-click>

<v-click>

> Ubuntu runners have ffmpeg pre-installed — AAC (M4A) output works without additional setup.

</v-click>

<!--
For production deployments, automate the audio generation step in your GitHub Actions workflow.

[click]

Add the generate step before your Slidev build step. Map your repository secret to the VITE_CLOUD_TTS_API_KEY environment variable. The optional TTS_VOICE, TTS_LANG, and TTS_BREAK_TIME variables let you override the defaults without editing your slides.md.

[click]

The if condition checks that the API key is set before running the step. This makes the workflow safe to run in forks or pull requests where the secret is not available — the step is simply skipped and the build continues without audio.

[click]

Ubuntu runners on GitHub Actions have ffmpeg pre-installed, so the script will automatically produce AAC (M4A) files with no additional setup. Add your API key as a repository secret using the name CLOUD_TTS_API_KEY. The workflow maps it to the variable name the script reads.
-->

---

# Summary

You're all set. Here's what you've learned:

<v-click>

1. Install `@katzumi/slidev-addon-tts` and declare it in frontmatter
2. Create a Google Cloud project and enable the Text-to-Speech API
3. Generate and restrict an API key
4. Store the key in `.env.local` (never commit it)

</v-click>

<v-click>

5. Configure `ttsConfig` with a WaveNet or Standard voice
6. Write speaker notes with `[click]` markers for click-synchronized playback

</v-click>

<v-click>

7. Choose **on-demand** mode for development or **pre-generated** mode for production

> Your slides now have a voice.

</v-click>

<!--
That's the complete setup for slidev-addon-tts.

[click]

You know how to install the addon, configure Google Cloud, and secure your API key. You can write speaker notes with click markers that synchronize precisely with your slide animations.

[click]

You understand the difference between on-demand mode — which is great for development and instant feedback — and pre-generated mode, which is the right choice when you want fast, offline-capable playback for your audience.

[click]

And you know how to wire everything together in a GitHub Actions workflow so audio is regenerated automatically every time you update your slides. Thanks for watching — enjoy presenting with a voice.
-->
