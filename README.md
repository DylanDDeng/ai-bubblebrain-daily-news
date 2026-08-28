# Bubble's Brain

English | [简体中文](README.zh-CN.md)

Bubble's Brain is a personal knowledge base for AI practitioners — curating content worth revisiting and reusing over the long term, rather than chasing the daily feed.

Live site: <https://bubblenews.today>

This project began as an AI daily-news site. The automated crawling and daily publishing pipeline has been retired; historical dailies live only in Git history and never enter the current build, search, RSS, or routes.

## Sections

- **Codex Tutorials** (`codex-tutorials/`): systematic guides from installation to real-world workflows.
- **Pi Agent Tutorials** (`pi-agent-tutorials/`): hands-on guides to installation, session storage, and the tool system.
- **WorkBuddy Tutorials** (`workbuddy-tutorials/`): practical guides from installation to office automation.
- **Vibe Coding** (`vibe-coding/`): three sub-sections — Terms, Skills, and Design.
- **Highlights** (`highlights/`): primary sources, official articles, and in-depth commentary.
- **About** (`about/`): the site and its author.

## Content principles

- Favor evergreen content with clear provenance.
- Markdown is the primary source for full articles; `content/` is the single content directory.
- Content is organized by section, tags, and related topics — never by date-driven pressure.

## Tech stack

- Astro 7 static output + `@astrojs/cloudflare` adapter (deployed on Cloudflare)
- Markdown content collections
- Bilingual routing (zh-CN default, `en/` prefix) with canonical and hreflang
- Static full-text search, RSS, sitemap, and readable pages without JavaScript
- Build-time validation: route contract, CSP, internal links

## Project structure

```text
astro/     Astro presentation layer: pages, components, search index, and tests (see astro/README.md)
content/   Markdown content source — the single source of site content
static/    Site-wide static assets (referenced as the Astro publicDir)
workers/   Content publishing pipeline Workers, working with GitHub Actions
scripts/   Validation scripts (verify-site.mjs and friends, reused by astro verify)
docs/      Design docs and runbooks; docs/archive/ holds archives from the daily-news era
```

## Local development

Requires Node.js ^22.17 or >=24:

```sh
cd astro
npm install
npm run dev
```

## Verify and build

```sh
cd astro
npm run verify   # astro check + eslint + vitest + build + CSP + site validation
```

Build output lives in `astro/dist/`.

## License

[MIT](LICENSE)
