# Gallery sources

Every image here was produced by `bin/omasnap --fixture` using the real
theme reader and the real Zed highlighter — nothing here is mocked or hand-
coloured. Each fixture was built from a real theme's `readTheme()` output
piped straight into `highlight()`, exactly the path a live snap takes.

| Image | Code | Theme |
|---|---|---|
| `push-gruvbox-dark.png` | `LiveRating` (Ruby) — DaisyStack's realtime push demo | Gruvbox Dark |
| `push-rose-pine.png` | `LiveRating` (Ruby) — same, second theme | Rosé Pine (light) |
| `timeline-2001.png` | `DaisyStack::Ui::Components::DataDisplay::Timeline` (Ruby) | 2001 |
| `worker-pool-decorative-stitch.png` | a generic-parameter worker pool (Go) | Decorative Stitch |
| `activation-osaka-jade.png` | `sigmoid`/`softmax` (Rust) | Osaka Jade |
| `zen-catppuccin.png` | *The Zen of Python* — plain text, no editor | Catppuccin |

## Code provenance

- **`LiveRating`** and the **Timeline component**: from Keith Rowell's
  [DaisyStack](https://github.com/) projects (`daisy_stack` and
  `daisy_stack_playground`), MIT licensed. `LiveRating` demonstrates
  DaisyStack's `ds_push` realtime layer: a browser click sends an event over
  the shared channel to a class-level `on_fe_rating` handler, which pushes
  the new average back to every subscribed browser with
  `DaisyStack::Push.emit`.
- **The worker pool** (Go) was written for this gallery: a bounded,
  generic, `errgroup`-based pool that stops on the first error or on context
  cancellation.
- **`sigmoid`/`softmax`** (Rust): from Keith Rowell's `neural_network`
  project, a from-scratch MNIST network — a real forward-pass building
  block, unedited beyond the excerpt.
- **The Zen of Python**: Tim Peters' well-known PEP 20 aphorisms, included
  as the "plain text, not a supported editor" example — no filename, no
  editor, so Omasnap falls back to one plain span per line.

## Theme provenance

Four themes are Keith's own, each shipping a bespoke `zed-theme.json` under
`~/.config/omarchy/themes/<name>/`: **2001**, **Decorative Stitch**,
**Osaka Jade**, **Gruvbox Dark**. (Osaka Jade's directory there only
overrides the Zed mapping — its `colors.toml` and wallpaper come from the
stock `osaka-jade` theme underneath, the way Omarchy layers a user theme
over a stock one of the same name.)

**Catppuccin** and **Rosé Pine** are stock Omarchy themes that ship no
`zed-theme.json` of their own — no stock theme does. When these renders
were first made, that meant hand-generating one for the gallery from each
theme's `colors.toml`, using the same mapping a personal Omarchy hook on
the machine that built this gallery already renders for real Zed
integration. Omasnap now does exactly that itself, for any theme that
needs it — `readTheme()` synthesizes a matching `zed-theme.json` on the fly
(`synthesizeZedTheme` in `lib/theme.mjs`; see "Where the colours come
from" in the README) — so these two renders are no longer a gallery-only
workaround: any install colours a theme like this the same way, live,
whether or not the machine has that personal customisation. A theme's own
`zed-theme.json`, when it has one, always wins.

## Reproducing a render

```
node lib/theme.mjs   # not a CLI; see the snippet below
```

Each image was built with a short one-off script equivalent to:

```js
import { readTheme } from "./lib/theme.mjs";
import { highlight } from "./lib/highlight/zed.mjs";
import { readEditorFont } from "./lib/editors.mjs";

const theme = readTheme(themeDir);
const { lines } = highlight({ text, language, theme });
const fixture = { filename, language, editor: "zed", font: readEditorFont("zed"), lines };
```

then:

```
bin/omasnap --fixture fixture.json --out out.png --theme-dir <themeDir> --wallpaper <themeDir>/backgrounds/<file>
```
