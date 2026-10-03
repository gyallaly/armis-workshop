# Setup viewer preservation checkpoint

October 3, 2026. This checkpoint supersedes the earlier Hermes-only source description in LIVE-INTEGRATION.md for the installed host, not for every deployment.

The viewer source now supports the sanitized installed-role/setup workflow journal: persistent role IDs, parent-task relationships, observed model receipts, and accepted internal tasks. Native Hermes tool metadata is activity, never a worker job or accepted business outcome. This remains a read-only loopback viewer. No mutation/execution endpoint, public deployment or production business activation is authorized.

## Verification performed during preservation

- `npm run typecheck`: passed.
- `npm test`: 95 passed across 13 files.
- `npm run build`: passed; a local static build is not production deployment.
- Default browser test command could not launch because bundled Chromium was absent.
- `PW_CHANNEL=chrome npm run test:e2e`: 14 passed, two failed, one skipped.
  - The old empty/unbound Live test expected no Uditus workers, but the current installed-role journal contains a configured Uditus role. That expectation is no longer compatible with the installed setup.
  - The Demo redirect browser test did not reach its expected acknowledged step. This remains unresolved.
  - The earlier explicitly bound Hermes-only test skipped because the active source is not `hermes-metadata`; no fixture was substituted as real runtime evidence.

Browser assertions need a reviewed update/fix before claiming full browser acceptance. This preservation task does not silently weaken tests or change the live source to make old expectations pass.

Scanned the scoped source candidates for known live credentials and common credential patterns. Matches were confined to explicit negative security-test fixtures. No .env, auth store, setup databases, private logs/backups, build output or browser captures are included in Git. This scan is not an independent security audit.

See the control repository's docs/SETUP-STATUS.md for the separate Codex pool verification boundary: gateway pool loading and A-first/B-fallback native-selector simulation are evidenced; individual cached-agent attachment is not directly verified, and no actual provider failover was induced.

Customer sending/publication, billing/paid APIs, trading/transfers, destructive actions, production deployment and database migrations remain disabled. Installed roles are setup-eligible, not production-qualified.
