# Setup viewer verification checkpoint

October 3, 2026. SETUP MODE only; not production qualification.

The installed viewer reads the sanitized Armis setup journal. Persistent role IDs and accepted internal tasks are not proof of production eligibility. Native Hermes tool metadata remains activity, not accepted business work. The viewer stays read-only and loopback-only.

## Browser failures resolved

- Empty-source Live assertions previously ran against an existing service bound to the setup journal. Playwright now builds and starts its own server on loopback port 4183, refuses reuse, and explicitly clears source bindings. No assertion was weakened; the user's live source remains unchanged on port 4173.
- Redirect acknowledgement events were rejected because real `performance.now()` deltas produced fractional timestamps, while the wire schema requires integer milliseconds. The simulator quantizes its clock at `advanceTo`; validation and redirect assertions are unchanged.
- Added fractional-clock coverage to the existing redirect validation test. It failed before the simulator fix and passed afterward.

## Verified results

- `PW_CHANNEL=chrome npm run verify`: exit 0; typecheck, 95 unit tests across 13 files, and build passed; browser suite: 16 passed, one skipped.
- Both originally failing browser tests passed in a focused run and the full suite.
- The existing explicit real Hermes-metadata binding test still skips on the isolated empty-source server. This does not establish browser acceptance for a separately bound Hermes-metadata installation.
- The installed Chrome channel was used; bundled Playwright Chromium remains absent.
- After checkpointing, only `armis-viewer` was restarted to serve the fixed build. Its authenticated read-only health endpoint reported `connected` / `armis-journal`; the served index matched the local build. The gateway was not restarted.

## Managing Director evidence

The control repository's `docs/SETUP-STATUS.md` now records direct in-process verification of the running Managing Director's attached two-entry Codex pool, `fill_first` strategy, and current selection of A. B fallback remains copied-state selector simulation, not actual provider failover. No quota-exhaustion test was performed.

## Boundaries

The independent delegated pre-commit review returned `held: native-request-held` without a verdict and was not replayed. This draft preserves locally verified work; independent review remains outstanding. No claim of independent approval or merge readiness.

Scoped source and documentation only. Credentials, private setup databases, logs/backups, build output, and browser captures are excluded from Git. No completed installer or live Gemini fixture was rerun. No merge, public deployment, production activation, sending/publication, billing/paid API change, trading/transfer, or database migration. Existing Uditus human approval/send, suppression/unsubscribe, checklist honesty, and signed scan-authorization gates remain unchanged.
