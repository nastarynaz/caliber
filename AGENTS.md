<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Knowledge Hub project guidance

For Knowledge Hub implementation, read `docs/MASTER_PROMPT.md` for the current product, data-governance, and design requirements. It is the Next.js-specific revision; the older prompt under the parent workspace's `outputs/` is historical. An explicit user request determines the scope of each task; do not implement the entire specification when asked for a narrow change.

For frontend design, interaction polish, or UI review, use the `emil-design-eng` skill and read its complete `SKILL.md` before acting. It is installed in this environment at `/Users/nastakhoirunas/.codex/skills/emil-design-eng/SKILL.md`. In another environment, resolve it through the available skill catalog; report if unavailable rather than claiming to have used it. Do not auto-install dependencies or external skills merely to read project documentation.

Retain Next.js App Router, pnpm, Tailwind 4, and the existing Coss/Base UI primitives. Inspect component exports and props rather than assuming Radix/shadcn APIs. The product's evidence-first, restrained industrial design and no-AI-slop constraints are specified in the master prompt. Preserve existing uncommitted user changes and source case files.
