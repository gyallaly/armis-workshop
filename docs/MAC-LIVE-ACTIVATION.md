# Mac mini live activation — October 3, 2026

## Scope and revisions

Integration branch: `armis/mac-workshop-update`. Combines Connor's `f6201538354ffdf34286a2e38129d53fe808460e` with viewer fix `68f2b931158d4a209bdfefbd5fd269691675463b`; both remain ancestors. No PR merge, policy replacement, gateway restart, production deployment, business execution, or database migration is part of this activation.

Host is the dedicated Mac mini running Linux. Viewer uses installed Chrome. Local read-only service is `armis-viewer.service`, loopback port 4173. Its existing journal binding is unchanged. Optional Uditus source uses only the explicitly configured Uditus repository environment, server-side; no Supabase account discovery and no credentials in the bundle.

## Sources and semantics

- Armis setup `viewer_events` journal v1 is authoritative for recorded role installation, task relationships, attempt/session identity, activity and internal acceptance. Ten installed bindings are observed. Missing observations remain unknown. Transport heartbeat never refreshes worker activity. Tool calls are not separate worker assignments.
- Pure projection reconciles the updated Control city homes with actual runtime identities. Shared installed `armis.operator` and `armis.auditor` have explicit Operations/Quality homes and separate seats. Declared Control identities remain separate from installed profiles.
- `/api/events` emits a transactional snapshot and cursor, then cursor-chained events/heartbeats. Refresh/reconnect reconstruct existing observations without invoking execution. Demo stays isolated and opt-in.
- `/api/evidence` is same-origin authenticated and read-only. It projects specific setup workflow result/review fields and actual model/provider/token receipt fields. Prompts, full receipts, private reasoning, and credentials are not serialized. Unsupported/credential-like result text is withheld. Supplemental reads are separate observations, not an atomic snapshot spanning Uditus and Armis.
- Uditus reads use GET only against the exact project's PostgREST endpoint, with 30-second caching. Prospects/scans/classification/report metadata/unsent drafts/approvals are exact recorded-row counts, not worker animation. Sender health is unknown when no records exist. Task/attempt tables are read when available; no rows, worker identities, or acceptance are invented.

## Uditus target and migration handoff

Configured Uditus project reference verified from the existing repository environment: `sgfgoezfazrweaycdlkq`. Successful authenticated reads observed leads, scans, artifacts, messages, batch_approvals, sender_health and operations_control. Operations kill switch is true. Sender health and batch approvals returned no rows.

Both `public.workshop_tasks` and `public.workshop_attempts` return `PGRST205` (missing from schema cache). This does not block Armis HQ. Existing exact migration: `/home/connor/uditus/supabase/030_workshop.sql`, on Uditus revision `566fecddccc349bb3e1ff0fce69b79a14291b5b6`. It includes task/attempt tables, dependency/queue/attempt indexes, enabled RLS, anonymous/authenticated revocation, service-role SELECT, and scoped security-definer producer RPCs. No public read policy is created. Deterministic PGlite test pastes it twice and tests idempotency, stops, dependencies, leases, stage/repair progression and permissions. Eight targeted Uditus workshop tests passed.

Execution blocker is the installed developer SETUP MODE prohibition on database migrations, plus CLAUDE.md's file-only rule; no migration execution was attempted. Existing project REST credentials permit scoped reads; no SQL-editor/direct-Postgres execution access was established. Do not confuse the policy blocker with a denied SQL tool call.

### Connor application instructions (deferred; no SQL applied here)

1. Open the **known Uditus** Supabase project's SQL editor, matching project reference above. Do not choose another account's similarly named project.
2. Inspect migration 029 completeness before applying anything. These read-only SQL checks expose no credentials:

```sql
select to_regclass('public.operations_control') as operations_control,
       to_regclass('public.sender_health') as sender_health,
       to_regclass('public.batch_approvals') as batch_approvals,
       to_regclass('public.agent_jobs') as agent_jobs,
       to_regclass('public.workshop_tasks') as workshop_tasks,
       to_regclass('public.workshop_attempts') as workshop_attempts;
select kill_switch from public.operations_control where id = true;
select proname, pg_get_function_identity_arguments(oid)
from pg_proc where pronamespace = 'public'::regnamespace
and (proname like 'operations_%' or proname like 'workshop_%') order by proname;
```

The REST checks establish some 029 components exist, **not that all of 029 is applied**. Compare with `supabase/029_operations.sql`; if it is absent/incomplete, Connor must inspect its prerequisites and apply the exact required migration in order. Do not blanket replay unrelated migrations.

3. With 029 verified, paste the **entire unchanged** `supabase/030_workshop.sql` into that SQL editor. Keep the kill switch engaged and outbound disabled. This creates the schema/producer interfaces, not tasks or a running workflow.
4. Verify schema and privileges without creating synthetic task records:

```sql
select tablename, rowsecurity from pg_tables where schemaname='public'
and tablename in ('workshop_tasks','workshop_attempts');
select tablename, indexname, indexdef from pg_indexes where schemaname='public'
and tablename in ('workshop_tasks','workshop_attempts');
select tablename, policyname, roles, cmd from pg_policies where schemaname='public'
and tablename in ('workshop_tasks','workshop_attempts');
select has_table_privilege('anon','public.workshop_tasks','SELECT') as anon_read,
       has_table_privilege('authenticated','public.workshop_tasks','SELECT') as authenticated_read,
       has_table_privilege('service_role','public.workshop_tasks','SELECT') as service_read,
       has_table_privilege('service_role','public.workshop_tasks','INSERT') as direct_insert,
       has_function_privilege('service_role','public.workshop_enqueue(text,jsonb,uuid)','EXECUTE') as enqueue;
select count(*) from public.workshop_tasks;
select count(*) from public.workshop_attempts;
```

Expected: RLS true on both; no anonymous/authenticated policy or SELECT; service SELECT true; direct INSERT false; enqueue EXECUTE true. Empty counts prove schema availability only.

5. On the Mac, `npm run workshop -- status` from `/home/connor/uditus` should stop reporting PGRST205. Open Workshop's **Runtime evidence → Uditus read-only business sources**; within 30 seconds, task/attempt sources should report connected. Do not run `tick`, enqueue a fake business task, clear kill switches, or enable the timer merely to get activity.

### Producer → viewer path

The existing `packages/core/workshop-run.ts` already records real tasks with `workshop_enqueue`; execution uses `workshop_claim`, `workshop_heartbeat`, and `workshop_finish` to persist actual stage results into `workshop_attempts` and task state/dependencies. Its `tick` path requires operations enabled and explicitly outbound-disabled mode. None of those mutating RPCs is called by this viewer. `server/uditus.ts` reads bounded existing task/attempt metadata via GET; requested/configured attempt model is explicitly not presented as a verified actual provider receipt.

Until migration application and an already-authorized real producer record exist, real Uditus task recording end-to-end remains unverified. Armis internal setup workflows use their own durable journal and do not require these tables. A queued future demonstration remains an internal supplied-text task, not Uditus business execution.

## Rollback

Private checkpoint directory: `~/.hermes/setup/workshop-update-20261003-020001/` (previous dist, service unit, setup database backup, checkout identity). Git checkpoint branch: `checkpoint/viewer-68f2b93`. Never commit these private files.

For viewer rollback only: stop `armis-viewer`, switch the clean checkout to the checkpoint branch, restore the saved `dist` and original viewer unit, remove only the newly installed `armis-viewer.service.d/uditus-readonly.conf`, daemon-reload, and start the viewer. Do not restore the runtime database: that would discard newer genuine observations. Do not restart the gateway or modify unrelated services.

## Checks

Combined source: typecheck/build passed; 132 unit tests passed; Chrome browser regression suite 19 passed, one explicit native-Hermes-metadata test skipped because the isolated regression server has no such binding. Real setup-journal browser verification is a separate activation check, not that skipped test. One inadvertently broad Uditus test invocation timed out in scanner fixtures; this is not a full Uditus-suite pass. The eight targeted workshop/schema tests were then run separately and passed.

Browser regression tests use a fresh service at 4183 with all private bindings explicitly cleared; they do not run against or mutate the user's live source. All prohibited effects remain disabled. No independent review approval or production qualification is claimed. One bounded read-only installation review was submitted through the supported setup router; it returned `held: native-request-held` (workflow `setup-92b41c80b5d4c5602c3bd74ad907be39`). It was not retried or treated as approval. It is genuine held installation-review activity, not the deferred demonstration.
