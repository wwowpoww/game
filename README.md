# Veil

An atmospheric hidden-object game set in three painted worlds — a Japanese-inspired garden town, a
Greek-inspired hillside and a Moroccan-inspired courtyard city. Walk down from a shadowed corridor to
a row of windows, step through one, and search the living illustration with a magnifying glass you
aim with your index finger. Built as a [Little](https://docs.little.co/docs) TV app with React,
TypeScript, Vite and Canvas.

## Requirements

- Node.js 20+ and npm
- A GitHub token with `read:packages` in `NODE_AUTH_TOKEN` (the `@kabletv` Little packages are
  private; `.npmrc` is already wired to GitHub Packages)
- For the Little device simulator: the `little` CLI and a Java runtime (JDK 21)

## Install

```bash
export NODE_AUTH_TOKEN=<github token with read:packages>
npm install
```

## Run

**In a browser** (quickest; the SDK frames the page in a 1920×1080 TV stage):

```bash
npm run dev
# open http://localhost:7140
```

**In the Little device simulator** (real host: remote, voice agent, camera):

```bash
export JAVA_HOME=/path/to/jdk-21/Contents/Home   # any JDK 21
export PATH="$JAVA_HOME/bin:$HOME/.local/bin:$PATH"
little dev                                        # starts the dev server for you
```

Drive it from a second terminal with `little dev call <tool>`, `little dev snapshot` or
`little dev events --follow`.

Handy while iterating on art: `?start=select` opens the window carousel and
`?start=play&level=0|1|2` jumps straight into a world.

## Build

```bash
npm run build      # type-checks, then writes the static site to dist/
npm run preview    # serves dist/ locally
```

`vite.config.ts` keeps `base: "./"` so the build works from any CDN prefix. Publish to Little with
`little manifest validate` and `little publish --url <origin>`.

## Controls

| Action | Remote | Pointer / touch | Voice (on a Little TV) |
| --- | --- | --- | --- |
| Navigate home and windows | D-pad, Select, Back | Click / swipe | "play", "next window" |
| Raise the magnifier | Select | Magnifier tab | "use magnifying glass" |
| Aim | Index finger (camera) | Mouse / drag | — |
| Lock in | Select again | Click the map | "lock in" |

Scenes default to camera hand tracking; declining the camera falls back to pointer controls.

## How it's put together

- `src/levels/painted.ts` — the three worlds: painting, five targets each (position, hit radius,
  clue), lantern glows, water and the animated regions.
- `src/levels/motion.ts` — cuts regions out of the painting and re-renders them each frame (people
  breathing, trees swaying, lanterns swinging, cloth rippling, water waving), feathered back in.
- `src/render/SceneRenderer.ts` — one renderer for previews, gameplay, the magnifier and the
  snapshot, so they always match.
- `src/art/frames.ts` — loads the window-frame PNGs and derives each opening from its transparency
  for masking and the zoom-through transition.
- `src/art/corridor.ts` — the home loggia and the endlessly scrolling city panorama.
- `src/game/` — explicit state machine (`store.ts`), transitions, world geometry and hit testing.
- `src/input/handTracker.ts` — MediaPipe Hand Landmarker, run entirely on-device (model and WASM in
  `public/mediapipe`); frames are never recorded or uploaded.
- `src/audio/ambient.ts` — generative music synthesised from ancient-instrument voices (koto,
  shakuhachi, lyre, aulos, oud, ney, bendir).
- `public/little/manifest.json` — the Little contract: tools the agent can call and capabilities.

## Art

- `public/art/map-*.jpg`, `frame-*.png`, `logo.png` — supplied artwork.
- `public/art/targets/*.png` — targets cut out of the paintings for the reference panel.
- `public/art/corridor-city.jpg` — generated stand-in panorama for the home screen; replace with
  final art at the same aspect ratio.
- The paintings are 1024×576, so the magnifier looks soft; dropping in higher-resolution versions
  with the same filenames sharpens it automatically.
