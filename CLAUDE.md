# RedBulb - CLAUDE.md

## Project Overview
RedBulb is a photo management and editing platform, forked from Immich. It features a custom Node Evaluation Model (NEM) for non-destructive photo editing with a node-based workflow.

## Tech Stack
- **Frontend**: SvelteKit (web/), React Native (mobile/)
- **Backend**: Node.js, TypeScript, NestJS (server/)
- **Database**: PostgreSQL with pgvecto.rs
- **Package Manager**: pnpm (monorepo)
- **Testing**: Vitest
- **Photo Editing**: Custom NEM (Node Evaluation Model) in @redbulb/nem-core

## Current Development Focus
**Phase 3 Complete**: Type unification and adapter removal
- Flat DevelopState structure across web and server
- 0 adapter touchpoints in production
- Direct @redbulb/nem-core usage

## Key Conventions
- **Types**: Flat DevelopState (no nested basic/color/details groups)
- **Imports**: Use @redbulb/nem-core for shared types
- **Tests**: Place in .test.ts files alongside source
- **Git**: Conventional commits (feat:, fix:, test:, docs:)

## Files to Never Touch
- tungsten-tiff.ts (legacy, 14 pre-existing TS errors)
- Generated migration files
- node_modules/

## NEM Architecture
- **nem-core**: Shared evaluation engine (packages/nem-core/)
- **Web**: Svelte components for node editing (web/src/lib/components/asset-viewer/editor/)
- **Server**: Evaluation service (server/src/services/nem-evaluator.service.ts)
