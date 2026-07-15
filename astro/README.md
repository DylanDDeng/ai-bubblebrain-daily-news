# Bubble's Brain Astro renderer

This is the parallel Astro renderer created for the Bubble's Brain migration. It is intentionally
not connected to the production deployment yet.

## Day 0 capabilities

- Astro 7 static build with strict TypeScript.
- Reads the existing Hugo daily Markdown from `../content/daily`.
- Preserves Chinese and English daily permalink shapes.
- Reuses the repository's `../static` directory as Astro's public directory.
- Defines and validates the framework-neutral daily report contract.
- Includes formatting, linting, type checking, tests, and a production build verification command.

Malformed historical filenames, including `content/daily/202-22.en.md`, are deliberately excluded
from the collection instead of being silently rewritten.

## Requirements

- Node.js 22.17 or a later supported LTS release.
- npm 10 or later.

## Commands

```sh
npm install
npm run dev
npm run verify
```

The generated site is written to `astro/dist/`. Hugo continues to build the production `public/`
directory from the repository root.

## Content flow

```text
Cloudflare Worker
  -> data/daily/YYYY-MM-DD.json (structured source of truth)
  -> content/daily/YYYY-MM-DD.md (compatibility output)
  -> Hugo or Astro renderer
```

See [`../docs/ASTRO_MIGRATION.md`](../docs/ASTRO_MIGRATION.md) for phases and cutover gates.
