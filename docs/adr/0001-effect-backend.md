# ADR 0001: Effect Backend Rewrite

## Status

Accepted

## Context

The current prototype is a local Electron app with a Rust sidecar, HelixDB, and provider-specific indexing logic. It proves the idea, but setup is too technical and the backend architecture is not yet shaped for local web, cloud, or B2B deployment.

## Decision

We will build the next backend in TypeScript with Effect v4.

- Start with a localhost web backend before desktop packaging.
- Focus the first product slice on office document search, not video.
- Use Effect services/layers for backend architecture.
- Use Effect v4 HTTP APIs (`effect/unstable/httpapi` + `@effect/platform-node`) first, with Hono as a fallback edge router if needed.
- Use durable local state from the beginning.
- Keep the existing Rust/Electron implementation as legacy reference until the new backend proves itself.
- Reintroduce Rust later only for measured native hot paths or OS integrations.

## Consequences

- The backend can become a local agent, hosted API, CLI, or desktop-packaged service.
- Core logic stays independent from the HTTP framework.
- Setup and productization work can happen before UI polish.
- We avoid carrying the current sidecar orchestration shape forward.
