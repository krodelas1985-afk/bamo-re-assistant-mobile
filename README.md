# BaMo RE AI Assistant (Mobile)

The single client-facing mobile app (Android + iOS) for BaMo — "Real Estate Made Simple." Agents see warm/hot leads, appointments, listings, documents, and the BayMo AI assistant. The Marketplace, Ads Manager, and Campaign Engine run underneath and are never surfaced directly.

- **Stack**: Expo SDK 57 · React Native · TypeScript · Expo Router (tabs) · Supabase (shared project `zyfkjxepykwpfzmkxitb`)
- **iOS builds**: EAS Build (cloud) — no Mac required. Android: EAS or local.
- **Design system**: BaMo brand standard — tokens in [`src/constants/brand.ts`](src/constants/brand.ts) (Poppins/Inter, navy `#1F3C88`, orange `#E67E22`). Character + logo in `assets/brand/`.
- **Plan**: `bamo-ops/BaMo_RE_AI_Assistant_App_Plan.md` (phases 0–6). This repo is Phase 0+.
- **Mockup guide**: https://bamo-re-assistant.vercel.app/ (Vite mock, lives at `../bamo-re-assistant` — not this repo).

## Develop

```bash
npm install
npm start          # then scan QR with Expo Go on your phone
npm run web        # quick browser preview
npm run lint
```

## Structure

- `src/app/` — Expo Router routes: 5 tabs (`index` Home, `leads`, `listings`, `calendar`, `more`)
- `src/components/` — shared UI (`screen.tsx` shell, themed primitives)
- `src/constants/brand.ts` — brand colors, type scale, radii (source of truth)
