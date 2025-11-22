# Next.js 16 Upgrade Progress

> **Project**: DeGov
> **Start Date**: 2025-11-22
> **Current Version**: Next.js 15.5.0 + React 19.0.0
> **Target Version**: Next.js 16.x + React 19.2+

---

## Summary

- Current Version: 15.5.0
- Target Version: 16.x (stable channel)
- Package Manager: pnpm
- Monorepo: Yes (packages/web is the Next.js app)

---

## Phase 1: Pre-Flight Checks

- [ ] Monorepo structure detected - working directory: `packages/web`
- [ ] Node.js version >= 20.9.0
- [ ] TypeScript version >= 5.1.0
- [ ] Git working directory is clean

## Phase 2: Run Official Codemod

**Command:**
```bash
cd packages/web
pnpx @next/codemod@canary upgrade latest
```

**Codemod handles automatically:**
- [x] Upgrade Next.js, React, React DOM to latest
- [x] Upgrade React type definitions
- [x] Convert sync params/searchParams to async
- [x] Update experimental config locations
- [x] Remove `--turbopack` flags (Turbopack is now default)
- [x] Migrate `middleware.ts` to `proxy.ts`
- [x] Remove `experimental_ppr` route segment config

**After codemod:**
- [ ] Verify build: `pnpm build`
- [ ] Run dev server: `pnpm dev`

## Phase 3: Manual Fixes (Post-Codemod)

### A. Removed Features Check
- [ ] AMP support removal (search: `grep -r "useAmp\|amp:" packages/web`)
- [ ] Runtime config removal (`serverRuntimeConfig`, `publicRuntimeConfig`)
- [ ] PPR flags removal (`experimental.ppr`, `experimental_ppr`)

### B. Config Updates (next.config.ts)
- [ ] Remove `--turbopack` from scripts (Turbopack is default)
- [ ] Move `turbopack` config to top-level (out of experimental)
- [ ] Remove `eslint` config object (use eslint.config.js instead)
- [ ] Update `images.minimumCacheTTL` if needed (default: 60s -> 4h)

### C. Middleware -> Proxy Migration
- [ ] Rename `middleware.ts` -> `proxy.ts`
- [ ] Rename export `middleware` -> `proxy`
- [ ] Add `runtime: "nodejs"` to config (project uses Node.js runtime)

### D. Async Request APIs
- [ ] `cookies()` - must be async
- [ ] `headers()` - must be async
- [ ] `params` in pages/layouts - must be Promise
- [ ] `searchParams` in pages - must be Promise

### E. Dynamic Route Updates
- [ ] `delegate/[address]/page.tsx` - remove `dynamic = 'force-static'`
- [ ] `proposal/[id]/page.tsx` - verify client component behavior

### F. Lint Command Migration
- [ ] Replace `next lint` with `eslint .` in package.json
- [ ] Update CI workflows

### G. Parallel Routes (if applicable)
- [ ] Add `default.js` to all parallel route slots

## Phase 4: Verification

- [ ] `pnpm build` succeeds
- [ ] `pnpm dev` works correctly
- [ ] All pages render correctly
- [ ] API routes work
- [ ] Middleware/Proxy authentication works
- [ ] No console errors

## Phase 5: Optional Enhancements

- [ ] Enable React Compiler (`reactCompiler: true`)
- [ ] Enable Turbopack file system cache (`turbopackFileSystemCacheForDev: true`)
- [ ] Evaluate Cache Components (`cacheComponents: true`)

---

## Progress Log

### 2025-11-22

- [ ] Step 1: Pre-flight checks
- [ ] Step 2: Run codemod
- [ ] Step 3: Verify build
- [ ] Step 4: Manual fixes (if needed)
- [ ] Step 5: Final verification

---

## Rollback Plan

If upgrade fails:
```bash
git checkout main
rm -rf packages/web/.next packages/web/node_modules
pnpm install
```

---

## References

- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Project Upgrade Guide](.agentdocs/backend/NEXTJS_16_UPGRADE_GUIDE.md)
