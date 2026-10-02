# Deferred live integration

Nothing in this repository contacts Hermes, Uditus, any AI provider or any trading venue. `DisconnectedLiveAdapter` (`src/adapters/adapter.ts`) reports `disconnected`. In that state the viewer shows counts as unknown and disables redirect. No endpoint is guessed or hard-coded.

## Intended shape

```
Hermes runtime hooks (verified) ─┐
Durable job records (verified) ──┼─► small authenticated bridge on the Mac mini ──► sanitized SSE/WebSocket ──► browser LiveAdapter
Provider rate-limit headers ─────┘        (read-only by default)
```

- **The bridge** runs on the Ubuntu Mac mini. It reads **verified** runtime hooks and durable job records, sanitizes them (dropping prompts, private reasoning and secrets), and maps them into the `ActivityEvent` / `Snapshot` contracts in `src/core/types.ts`.
- **The browser** never talks to Hermes or providers directly. It only receives sanitized events.

## Checklist before connecting

1. [ ] **Confirm the real hooks.** Inspect the current Uditus/Hermes repository read-only and record the git ref. Use `packages/core/workshop.ts` and `docs/workshop.md` for the stage names (create, review, repair) and the bounded-repair semantics. Do not rely on the local snapshot at `566fecd`.
2. [ ] **Define explicit mappings.** Map business id → `BUSINESSES` entry, and job stage → `TaskStage`/department. Never infer a business from prompt text.
3. [ ] **Keep identity separate.** Bind stable worker identity separately from runtime session and attempt ids.
4. [ ] **Build the bridge.** Implement it with authentication (a local token or mTLS; no credentials in the browser bundle) and read-only scopes. Bind it to the LAN or localhost only.
5. [ ] **Event semantics.**
   - The bridge emits a snapshot on connect and on reconnect.
   - Every event carries a unique id and a source timestamp; the viewer stamps `receivedTs` itself.
6. [ ] **Unknown values.** Send unknown states as `unknown`. A missing completion stays unobserved, never assumed.
7. [ ] **Capacity provenance.**
   - Report remaining allowance only from provider headers or APIs (`provider_reported`).
   - Request and token counts are `locally_measured`.
   - Never infer quota from catalog visibility or from successful requests.
8. [ ] **Redirect.** Only after a separate review, add a narrowly scoped redirect endpoint that targets one worker and one task. It must return acknowledged, then applied or rejected. There is no arbitrary command endpoint and no terminal.
9. [ ] **Implement `LiveAdapter`.** Write it against the `WorkshopAdapter` interface, with `capabilities.redirect` false until step 8 is approved.
10. [ ] **Test with the real stream.** Exercise de-duplication, out-of-order delivery, stale data and reconnect snapshots against a recorded real stream.
11. [ ] **Aster Ledger.** Venue, news and trader adapters are future work. Any real-money capability needs its own design and authorization review; the viewer must keep showing DEMO/PAPER until then.
12. [ ] **Don't touch safety controls.** Leave Uditus kill switches, compliance, suppression and authorization logic unchanged; the viewer only observes them.
