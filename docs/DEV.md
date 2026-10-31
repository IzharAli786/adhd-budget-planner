# Developer notes

## Unlock code

The full app opens on an unlock screen, in dev too (PLAN §7). Use the dev code:

    STEADY-DEMO-0000-0000-0001

Its hash is in the tracked `.env` as `VITE_UNLOCK_HASHES`. Typing `O` for `0` or `I`/`L`
for `1` also works (Crockford aliases), so the code can be typed exactly as printed.

To lock the app again, delete the `unlocked` row from the `meta` table in DevTools
(Application > IndexedDB > steady > meta), or clear site data.

### Making real codes

    node scripts/make-code.mjs

prints a new random code and its hash. Put the code in the PDF and add the hash to
`VITE_UNLOCK_HASHES` in the Vercel project (comma-separated, newest last). To hash an
existing code: `node scripts/make-code.mjs STEADY-XXXX-XXXX-XXXX-XXXX`.

Rotation: add the new hash, ship the new PDF, and remove a leaked hash after a grace
period. Installs that are already unlocked keep working because the flag is persisted.

### Threat model

The hash only keeps codes out of the bundle as plain text. It is not DRM: anyone with
DevTools can set the flag. That is accepted; the price is low and the demo is free.

### Demo build

`vite build --mode demo` swaps `src/unlock/unlock.ts` for `src/unlock/unlock.stub.ts`
(an alias in `vite.config.ts`), and `.env.demo` blanks `VITE_UNLOCK_HASHES`. Never set
that variable on the demo project.

## First-run setup

After unlocking, `/setup` asks four quick things and stores progress in
`meta.setupProgress`, so a reload resumes on the same step. Setup counts as done when
`setupProgress.step` is `done` or any income exists (an older backup was restored).
