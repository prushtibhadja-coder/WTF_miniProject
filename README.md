# WTF_miniProject
# " Bhasha ” Learn the 22 Scheduled Languages of India

A single-page web app built with **HTML5, CSS3 and vanilla JavaScript** ” no
frameworks, no build step, no server. Every screen is produced by DOM
manipulation from one data file.

## Files

| File | What it holds |
|---|---|
| `index.html` | Structure only: header, the four page sections, the two modals, the toast. No inline CSS or JS. |
| `style.css` | All styling: CSS custom properties for theming, Grid and Flexbox layouts, the 12 script font stacks, dark-mode media query, print of the 22 languages. |
| `data.js` | The data: `LANGS` (22 languages Ã— 89 phrases), `PHRASES` (the word list with topic and level), `CATS` (topic sections), `LEVELS` (difficulty tiers), `LANG_DETAILS` (reference text per language). Exposed as `window.BHASHA_DATA`. |
| `script.js` | All behaviour â€” rendering, routing, quiz engine, speech, recording, storage. |

Open `index.html` in any modern browser. Fonts come from Google Fonts (the only
network request); everything else runs offline.

## How the code is organised

1. **Data â†’ render functions â†’ DOM.** Nothing is hard-coded in the HTML except
   the shell. `render()` builds the 22 cards, `renderListen()` the audio tour,
   `openDetail()` a language page, `mountQuiz()` a question.
2. **State** lives in one object `S`, persisted to `localStorage`. Voice audio
   lives in `IndexedDB` (`putClip`, `loadVoiceStore`).
3. **Escaping.** Every value inserted with `innerHTML` goes through `esc()`,
   so a phrase containing `<` or `&` cannot break the markup.

## DOM manipulation techniques used

| Technique | Where |
|---|---|
| `querySelector` / `querySelectorAll` | every render function, e.g. `render()` selecting `.card` |
| `innerHTML` templating | `render()`, `openDetail()`, `mountQuiz()`, `renderListen()` |
| `document.createElement` + `appendChild` | `vlog()`, the speaker `<option>` list, language chips |
| `classList.add/remove/toggle` | marking a phrase learned, `.rec` recording state, `.playing` tour row |
| `dataset` (`data-k`, `data-id`, `data-lvl`) | carrying phrase keys and language ids into click handlers |
| `setAttribute` / `getAttribute` | `aria-pressed`, `aria-selected`, `dir="rtl"` |
| `addEventListener` | `#q` input, `#sortSel` change, `#recBtn` click, `Esc` keydown |
| Event delegation | one listener on `#listenList` for 22 play buttons; one on `#voiceModal` for backdrop clicks |
| `e.target.closest()` | finding the row or select that fired an event |
| `element.style.*` | progress bars, `scrollTop`, outline highlight |
| `hidden` property | switching pages in `go()` and opening/closing modals |

## Browser APIs beyond the DOM

`SpeechSynthesis` (text-to-speech with per-language voice matching),
`MediaRecorder` + `getUserMedia` (recording your own voice), `IndexedDB`
(storing audio), `localStorage` (progress), `Blob` / `URL.createObjectURL`
(exporting a voice pack), `FileReader` (importing audio), `fetch` (optional
Sarvam voice generation), `Audio` (playback with a priority chain:
your recording â†’ generated clip â†’ baked pack â†’ system voice).

## Editing it

- **Add a phrase** â€” add an entry to `PHRASES` in `data.js` (`k` key, `en`
  label, `cat` topic, `lvl` level) and give every language that key in
  `LANGS[].phrases`.
- **Add a topic or level** â€” append to `CATS` / `LEVELS`; the UI picks it up.
- **Change the theme** â€” the custom properties at the top of `style.css`.
