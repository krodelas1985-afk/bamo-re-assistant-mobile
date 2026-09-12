# BaMo mobile visual refresh

Applied on feature/bamo-brand-redesign, based on 76c7e84 (v1.0.5 fixes).

## Design

- Official navy #1F3C88 and orange #E67E22, cream #FFF7ED, white cards, ink text, and headset teal #147D83 for voice controls.
- Bundled Poppins Semibold/Bold headings and Inter body text. Removed Instrument Serif dependency.
- Larger readable shared type scale, moderate button rounding, restrained shadows, navy primary actions, stronger secondary text contrast.
- Shared labeled fields with focus/error styles and password visibility, accessible loading buttons, larger selection targets.
- Official logo on sign-in/sign-up; current BayMo head in auth, intake and welcome.
- More compact Home briefing cards with inline speaker controls; wider chat bubbles and expandable lead/property context. History explanation stays inside history.
- Photo-led listing cards, simplified lead summaries, clearer task controls, consistent custom form headers and spacing, profile entry in More, selected navigation treatment.
- All 38 screen routes inherit the shared typography/palette; individual layout refinements concentrate on auth, welcome, Home, chat, leads, listings, tasks and navigation.

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- `git diff --check` passed.
- All 38 screen routes rendered in an isolated React Native Web preview at 390 x 844 with sample data: no recorded browser errors, blank pages, or document horizontal overflow.
- Twelve key routes checked at 320 x 740: no blank pages or document horizontal overflow.
- Password visibility switches between text/password; expanding chat context reveals task/appointment actions; property chooser and chat history open correctly.
- Preview loads actual screen/components and font files, with mocked router, native APIs, authentication and database responses. It makes no production writes. It does not verify native navigation, keyboard movement, device font scaling, microphone, speaker, or every data-dependent state. The tab navigator is not part of the isolated preview.
- Full lint still reports five existing errors: social render-time Date.now (2), ads JSX apostrophe (1), website-request state initialization effect (1), auth-context state effect (1), plus four existing warnings. Confirmed the five errors also occur on the unchanged HEAD versions; no newly introduced errors observed. Three existing onboarding JSX apostrophes corrected during its visual edit.

## Release boundary

No backend/data-layer changes, Supabase migrations, Edge Function deployments, merges, or APK builds are included. Before release, check Android/iOS with native keyboard open, larger system text, tabs/back navigation, Cedar playback and recording; confirm task/appointment review controls remain reachable.
