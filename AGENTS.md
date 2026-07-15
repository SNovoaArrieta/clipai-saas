# ClipAI SaaS — Working Agreement

## Product vision

ClipAI is a commercial SaaS platform that transforms long-form videos
into strategic short-form content recommendations for TikTok,
Instagram Reels and YouTube Shorts.

The product must save creators, podcasters, agencies and marketing teams
the time required to review long videos manually.

## Current phase

We are currently working on Phase 1: Internal Alpha.

Do not implement the full SaaS until the product documentation,
architecture, repository structure and technical standards are approved.

## Team

- Sofía: CEO, Product Owner, UX validation, business and customer research.
- Milo/ChatGPT: product strategy, architecture, technical planning and code review.
- Codex: repository analysis, implementation, testing and documentation.

## Planned stack

Frontend:
- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query

Backend:
- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma

## Repository structure

- client/: frontend application
- server/: backend API
- docs/: product and technical documentation
- legacy/: old prototypes used only as references

Do not place production code inside legacy/.

## Development rules

1. Inspect the repository before modifying files.
2. Plan complex changes before implementing them.
3. Keep each task small and reviewable.
4. Do not rewrite unrelated files.
5. Use TypeScript for new production code.
6. Never expose API keys, tokens, passwords or credentials.
7. Use .env for local secrets.
8. Maintain an .env.example file without real secrets.
9. Separate routes, controllers, services and data access.
10. Do not install dependencies without explaining their purpose.
11. Run relevant tests, lint and type checks after changes.
12. Report all failed commands honestly.
13. Preserve the legacy prototype.
14. Update documentation when architecture or behavior changes.

## Git conventions

Use conventional commits:

- feat(scope): new functionality
- fix(scope): bug correction
- refactor(scope): internal improvement
- docs(scope): documentation
- test(scope): tests
- chore(scope): maintenance

Do not push directly to main without reviewing the changes.

## Definition of done

A task is complete only when:

- The requested behavior is implemented.
- The changes have been reviewed.
- Relevant checks and tests pass.
- No credentials or secrets were committed.
- Documentation is updated when required.
- Codex reports the files changed and validation performed.
