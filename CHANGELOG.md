# Changelog

## Unreleased

- Adopt shared Kitium toolchain: package.json scripts now match the `@kitiumai/config` template, the shared Prettier config is wired up, and TypeScript/ESLint consume the organization presets.
- Replace the internal logger/config helpers with the `@kitiumai/logger`, `@kitiumai/test-core`, and `@kitiumai/scripts` APIs so tracing, sanitization, and configuration resolution behave like the rest of the platform.
- Export type definitions using `export type` so the package compiles cleanly with `isolatedModules`.
