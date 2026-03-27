@AGENTS.md

## Project

Next.js 16 admin panel for Lohikeitto service catalog. React 19 with React Compiler. Tailwind CSS. pnpm.

## Conventions

- See `/Users/alena/.claude/skills/code/` for full style guide
- Arrow functions + default export for components
- One component per file, kebab-case folders with barrel index.ts
- `type` over `interface`, suffix `T` for data types
- `import type` for type-only imports
- No `useMemo`/`useCallback`/`React.memo` (React Compiler)
- No `any` (use `unknown`)
- Server Components by default, `'use client'` only for interactivity
- Shared utils in `lib/`, component-private utils in component folder

## Key paths

- `lib/color.ts` -- color math (toHex, hexToRgb, rgbToHsl, rgbToOklch, parseColor, contrastText)
- `lib/format.ts` -- formatSize, formatEta, formatDate, triggerSave
- `lib/api.ts` -- API_URL and all fetch functions
- `lib/use-click-outside.ts` -- shared hook for dropdown/modal dismiss
- `components/index.ts` -- barrel re-export of all components
- `lib/index.ts` -- barrel re-export of all utilities

## Admin API routes (Rust backend at crates/admin/)

| Route | Method | Description |
|-------|--------|-------------|
| `/services` | GET/POST | List/create services |
| `/services/{id}` | PUT/DELETE | Update/delete service |
| `/categories` | GET/POST | List/create categories |
| `/categories/{id}` | PUT/DELETE | Update/delete category |
| `/limbus` | GET/POST | List/create limbus entries |
| `/limbus/{id}` | DELETE | Remove limbus entry |
| `/limbus/{id}/approve` | POST | Approve limbus -> service |
| `/s3` | GET | List S3 objects |
| `/s3/info` | GET | S3 bucket info |
| `/s3/archive` | GET | SSE archive stream |
| `/s3/archive-keys` | POST | Archive specific keys |
| `/s3/archive/{token}` | GET | Download ready archive |
| `/s3/file/{key}` | GET | Download single file |
| `/s3/upload/{key}` | PUT | Upload file |
| `/s3/rename` | POST | Rename/move object |
| `/s3/delete` | DELETE | Delete objects |
| `/logos/fetch` | POST | Get logo URL from provider |
| `/logos/save` | POST | Download + save logo to S3 |
| `/logos/vectorize` | POST | Multicolor vectorization (vtracer) |
| `/logos/gradient` | POST | Extract gradient from image |
| `/db/export` | GET | Export SQL dump |
| `/db/import` | POST | Import SQL dump |
