# Mobile 1.0.7

Based on master 41924a9; last Android APK was 1.0.6 at 42fe81a.

## Included

- Marketplace listings, public property links, status labels and the agent's Marketplace name/photo from the two merged Marketplace changes.
- Shared workspace Messenger status for members, with admin-only connect/disconnect controls and activation gating.
- Mobile OAuth return selection, cancellation/error feedback and cold-start result forwarding.
- Removal of broken Messenger connections, response validation and authorization-link validation.
- Existing database usage limits surfaced in lead/listing/content screens; monthly AI-limit errors shown in understandable language.
- Generation services use the existing atomic AI-credit function. Ordinary chat and voice are unchanged. No schema migration.
- App lint fixes, profile-prefilled website requests that preserve edits, and account-scoped profile/onboarding gates.

## Validation

Chat/history/actions/context/voice and release integration tests pass (37 tests total). TypeScript passes. Full lint has zero errors and two existing warnings (onboarding dependencies and an unused backend type). Whitespace checks pass.

Backend Messenger changes merged through Ads Manager PR 3 and deployed to production at 811b4ee. Live unauthenticated status request returns 401/no-store; expired browser login returns 410 with a mobile recovery link. AI generation functions were updated without database migrations.

Local Android export exceeded available memory with multiple workers; the single-worker retry was stopped because the machine remained memory constrained. Cloud EAS build verifies bundling and native compilation. Physical-device keyboard, browser return, push, speaker/microphone and Marketplace account scenarios still require tester checks.

## Remaining feature boundaries

Property submission saves to CRM for review; it does not publish into Marketplace. Separate client Ads authorization remains unavailable. Existing operator-managed Ads services remain separate. No new Google/Facebook account login or iOS release is included.
