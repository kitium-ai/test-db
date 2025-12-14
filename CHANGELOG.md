# Changelog

## [v2.0.1] - 2025-11-30

bumped patch version for kitiumai packages

## [v2.0.0] - 2025-11-28

- Adopt shared Kitium toolchain: package.json scripts now match the `@kitiumai/config` template, the shared Prettier config is wired up, and TypeScript/ESLint consume the organization presets.
- Replace the internal logger/config helpers with the `@kitiumai/logger`, `@kitiumai/test-core`, and `@kitiumai/scripts` APIs so tracing, sanitization, and configuration resolution behave like the rest of the platform.
- Export type definitions using `export type` so the package compiles cleanly with `isolatedModules`.
- Added configuration builders, environment presets, and temporary database helpers so downstream tests can spin up isolated PostgreSQL/MongoDB databases with a fluent API.
- Rewrote README to highlight the new builder APIs and lifecycle helpers, and aligned example tests/lint configs with the shared Kitium standards.
