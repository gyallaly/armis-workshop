# Hermes implementation brief for ARMIS City V2

This is a repository-resident brief for the installation agent on the Mini. It is not an automatically executed prompt. A configured updater/agent must explicitly consume it. Read CITY-V2-SPEC.md, ARCHITECTURE.md and MAC-DISCOVERY.md first.

## Objective

Make Workshop an accurate observer and authenticated owner control surface for the installed system, with provider allocations, company shutdown and real Hermes chat. Implement and prove runtime behavior; do not substitute prompt promises or green UI indicators for gates and evidence.

## Establish the installation

Discover current OS/runtime, Hermes executable and revision, user services, running build, repository branches and dirty files. Preserve local changes and make a recoverable snapshot before changing deployment. Do not reset or replace the Mac checkout blindly. Reconcile the existing named SSE snapshot/events/heartbeat protocol with the PC contracts, including epochs, cursor gaps, bounded snapshots, identity reconciliation and freshness. Keep canonical roles separate from transient sessions and unmatched runtime roles.

Inspect supported Hermes integration points in the installed version before implementing chat, request interception or cancellation. Record exact paths and capabilities. Do not invent a CLI invocation, HTTP endpoint or provider quota source. Do not print credentials, raw auth files or private reasoning into discovery results.

## Implement deterministic control

Persist owner policy, business lifecycle, attribution, reservations and command receipts outside model-generated text. Authenticate callers, allowlist commands, reject expired/replayed/conflicting edits and persist acknowledgement before reporting success. Default unsupported execution paths to held state and surface the reason.

Inventory every execution entry point: owner chat, executives, company workers, nested delegations, recurring schedules, retries, provider adapters and tool subprocesses. Require explicit business/shared attribution and check effective owner policy before each admission. Apply atomic reservations and enforce provider/company concurrency and enforceable request/token/spend bounds. Preserve current Uditus serialization until a separately verified change permits concurrency.

Shutdown immediately fences new work, then cancels owned execution through supported handles, terminates owned tool processes as appropriate, prevents retry/recovery resurrection and reconciles reservations. Report stopping, stopped, failed cancellation and residual cloud usage separately. Do not claim cancellation of already completed external actions. Resume cannot duplicate completed work. A stop must remain effective after restart.

## Implement observations and chat

Emit sanitized versioned observations with stable IDs, source and received timestamps, explicit provenance and company/provider scope attribution. Advertise capabilities individually and list uncovered paths. Empty healthy sources may report zero; unavailable evidence remains unknown.

Collect provider availability and limits only from supported evidence. Keep subscription and API scopes separate and multiple quota windows independent. Unknown totals/reset times remain null. Local counters are consumption measurements, not proof of remaining entitlement. Add machine-resource collectors according to actual hardware support.

Implement durable authenticated Hermes conversations using the installed supported transport/profile. Link sanitized context references and resulting command IDs. Handle duplicate send, stream interruption, reconnect and cancellation. All chat-triggered operations obey the same deterministic owner policy gates. Preserve a disclosed shared owner-chat reserve; global AI stop includes inference from that reserve.

## Automated deployment and proof

Create an idempotent update process with revision checks, dependency/build steps, compatible schema changes, preserved configuration, service activation, readiness checks and rollback. A missing credential or unsupported integration should produce an actionable readiness result in Workshop, not repeated requests for the owner to paste diagnostic terminal output. Never assume Git pull executes this brief or restarts a process.

Run transport checks plus every release acceptance scenario in CITY-V2-SPEC.md. Controlled tests must use fixtures/fake providers by default; any real call follows installed owner policy. Write a credential-free readiness manifest containing running revisions, capabilities, tested source checks, gate-coverage inventory, test results and unresolved gaps. Workshop may mark a capability operational only from these checks and fresh runtime evidence.

Report exactly what was installed, which checks ran, which controls are enforceable, which sources remain unknown, and whether any execution path bypasses policy. Never report complete shutdown/control coverage while an unmanaged execution path remains.
