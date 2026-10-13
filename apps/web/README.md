# @degov/web

## Minimal local test

Use Node.js 22.18 or newer with native TypeScript type stripping enabled by
default. From the repository root, run:

```bash
node --test apps/web/scripts/proposal-quorum-progress.test.ts
```

The Node.js test runner reports a positive pass count and zero failures on
success. This focused test checks quorum calculations and vote-summary source
and translation assertions using only Node.js built-ins and repository files.
It needs no package installation, database, wallet, RPC endpoint, or running
Next.js server; it does not verify browser rendering or live governance flows.

If Node.js reports an unknown `.ts` file extension, check `node --version` and
upgrade to a version with default type stripping. A
`MODULE_TYPELESS_PACKAGE_JSON` warning may appear because the web package does
not declare a module type; use the test runner's pass/fail summary to determine
the result.
