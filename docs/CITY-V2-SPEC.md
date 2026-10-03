# ARMIS City V2: an inspectable operating system

Status: V2 design and implementation contract, October 3, 2026. The PC build implements first-floor cutaways, improved buildings, power island, quota signals, allocations, company controls, chat contracts and Guide. Real Mini deployment, installed Hermes executor coverage and provider entitlement collectors remain unverified. Dependency tracing and historical replay are future enhancements, not completed features.

## Experience

The owner looks across a quiet island campus and immediately understands who is working, what they are doing, what is blocked, and what resources they can consume. Clicking any meaningful visual reveals its source, observation time, scope and explanation. The city remains attractive when nothing is running. Quiet is a legitimate operating state.

Preserve the Canvas 2D isometric art, company identities, precise geometry and accessible DOM interface. Expand the existing island scene deliberately, rather than rebuilding the renderer or scattering unrelated dashboards over the architecture.

## Reuse and change

| Existing foundation | V2 use | Required change |
| --- | --- | --- |
| 29 pinned Control identities and organization checks | Persistent inhabitants and reporting lines | Add versioned installation discovery and explicit reconciliation; surface unexpected runtime roles without inventing permanent agents |
| HQ and three company buildings | Company operating surfaces | Add effective operating policy, dependencies, allocations and operating-state cues |
| Role-specific interiors and reachable lounges | Work and confirmed rest locations | Preserve unknown/stale distinctions; shutdown alone cannot prove every agent has stopped |
| Workstation folios, task panels and artifacts | Inspectable work and deliverables | Tie every object to authoritative job/attempt/evidence IDs |
| Event reducer and deterministic demo | One state shared by visual and text views | Extend versioned contracts for policies, commands, conversations, provider scopes and resource observations |
| Shared provider capacity and provenance tags | Reactor source records | Support multiple limits per scope, nullable totals, rolling windows, percent evidence and separate API/subscription channels |
| Connections inventory | Integration readiness and evidence inspection | 23 categories are intended coverage, not proof that each source is installed or implemented |
| Mac read-only transport checker | Automated deployment verification | Reconcile named SSE protocol and test all implemented source and command paths |

The current local live adapter is read-only and differs from the observed Mac viewer protocol. Control contains policy/admission primitives, not a complete authenticated scheduler/executor service. These are implementation gaps, not UI features that can be enabled with a flag.

## Power station island

Add a small offshore utility island with a grounded service structure, seawall, provider reactors and a physical supported conduit carrying cyan light to the main island. The mainland junction distributes branches along reserved utility corridors to each building. Pipeline geometry, depth occlusion, hit areas, camera fit, minimap and water reflections must share one layout definition. Do not draw an unsupported pipe floating through buildings.

Each configured provider has a recognizable reactor bay. A provider with separately enforced accounts, projects or access channels has labeled sub-bays. Models are routes served by a scope, not automatically separate tanks. A disabled provider remains visible and unlit; a configured but unobserved provider has an explicit unknown indicator. Number of installed bays and number of currently available providers are separate counts.

Use low-cost cached art and bounded animated overlays. No GPU-heavy rendering is needed to communicate GPU or AI usage. The physical scene is an owner inspecting a night campus from a desktop screen, with lighting concentrated at machinery and occupied workspaces.

### Visual semantics

| Visual | Exact meaning |
| --- | --- |
| Reactor fill segments | Remaining allowance for the selected, comparable quota window, only when reported or explicitly labeled estimated |
| Reactor operating light | Provider scope is available, limited, unavailable or unknown |
| Amber beacon | Verified warning threshold crossed or rate-limited/cooling down, with a readable reason |
| Red fault beacon | Exhausted allowance or provider failure; distinguish these in the panel |
| Dashed neutral reactor gauge | Remaining allowance is unreported or stale; never render it as a full tank |
| Blue branch width | Effective company allocation within a named provider scope and unit |
| Traveling blue light | Recent measured company consumption; absence means quiet, not disconnected |
| Building perimeter intensity | Effective permitted operating capacity on a stable, labeled relative scale |
| Workstation lights | Confirmed agent execution, independent of perimeter intensity |
| Occasional amber interruption | Observed throttling or resource starvation, not merely a small allocation |
| Disconnected branch switch | Owner policy blocks company admission |
| Muted building with observation marker | Source unavailable or stale; never claim shutdown |

Low allocations dim perimeter lights. Very small allocations (weight <=5) cause a restrained slow supply-lamp interruption, as requested by the owner; this indicates that allocation, not provider failure or an agent state change. Reduced motion keeps the lights steady and replaces beacons and pulses with static state shapes and text. Color never carries the state alone.

Provider warning defaults proposed for initial simulation: amber at 20% remaining, critical at 10%, exhausted at an explicit zero or limit response. These are configurable UI thresholds, not provider rules. Use hysteresis and cooldown to prevent beacon chatter. Forecasts are labeled estimates and require a defensible observation window.

### Power station panel

Use a wide inspector with four views: Providers, Allocations, Machine, Efficiency. Selecting a reactor opens its specific scope immediately.

Providers: actual provider/access channel, available models, availability, each reported quota window, remaining/used/total where known, reset evidence, request/token rates, active calls, reservations, retries and source freshness. Do not assume a five-hour window or a quota percentage for a provider without evidence. Subscription usage and API billing remain separate.

Allocations: one row per company plus shared HQ/owner services. Show requested policy, effective policy, current consumption, outstanding reservations and queued demand side by side. Controls include scheduling weight, maximum concurrent attempts/calls, allowed provider routes, enforceable token/request/spend ceilings per window, priority, emergency stop and fallback permissions. Allocation percentages are scheduling shares, not a guarantee of provider entitlement or throughput. Unused shares may be borrowed only under explicit policy. Reducing a limit accounts for already reserved/running work and explains when it becomes effective.

For every allocation edit, preview affected jobs and the expected admission behavior, submit a versioned command, and show requested/acknowledged/effective or rejected. No optimistic success. Conflicting edits require refreshed policy state; duplicate submissions do not apply twice. Resets and unknown allowances are governed by evidence-backed policy, never by a UI reset button.

Machine: local CPU, memory, swap, disk, process/service health and local inference if installed. Cloud model calls do not imply Mini GPU consumption. Display GPU measurements only when hardware and an actual collector support them. Distinguish local browser/build load from AI provider capacity.

Efficiency: verified accepted outcomes per measured token/cost, successful attempt rate, rework, waiting, latency, retry overhead and model-route comparison. Show sample count, time window, task family and provenance. Unknown or tiny samples have no authoritative score. Keep quality and throughput separate; do not punish legitimate held/rejected work as wasted execution.

## Company controls

Company header shows Running, Draining, Stopping, Stopped, Blocked, or Unknown, plus the reason. Desired policy and observed execution state are distinct.

- Pause new work: block new admissions and schedules for that business; allow current attempts to finish under their existing bounds.
- Shut down: fence new admission immediately, cancel queued dispatch/retries, request cancellation of current owned executions, and reconcile outstanding reservations. Show Stopping until workers/processes and provider requests have been checked. Uncancellable calls remain visible as residual usage.
- Resume: revalidate policy, resources and unfinished work. Resume deliberately; never replay previously completed external actions.

Scope includes company CEO/coordinators/workers, nested delegations, scheduled jobs, provider calls, retries and tool processes. Every execution requires an explicit company identity before admission. Unmapped execution is quarantined and visible rather than silently billed to a company. Company-specific polling/automation is disabled according to policy. Shared owner chat, safety monitoring and the control service use a separate disclosed reserve; stopping a company does not stop the other companies.

Shutdown cannot undo an already sent email, completed external action or incurred provider charge. The panel must report remaining work and continuing shared overhead truthfully. Verify stopped agents before showing them settled in the lounge; preserve muted last-known state if cancellation status is unknown.

Global stop fences all managed AI work, including owner chat inference. The non-AI control service and status interface remain reachable. Existing cloud requests may not be cancellable, and are tracked until reconciled.

## Hermes conversation

Persistent text composer anchored to the UI, expandable into a conversation inspector. It works from the campus, a building or the power station without discarding selection. Clearly identify the actual installed Hermes recipient/profile; do not assume Hermes chat equals the declared ARMIS CEO.

Context attachments are explicit chips: company, agent, job, incident, reactor or allocation. Clicking an object can offer Ask Hermes about this. Include source timestamps and stable references, not a dump of unrelated secrets or private reasoning.

Show durable message IDs and queued/sent/responding/completed/failed states, reconnect-safe transcripts, streaming where supported, request cancellation, and the responding model/provider when observed. A disconnected conversation cannot pretend a message was delivered. Persist only through the authenticated server contract, with bounded retention.

Chat can explain status, draft a job, propose an allocation or request an owner-authorized operation. Operational changes go through the same structured command service as direct controls. A conversational statement such as 'done' is not evidence of application. Show linked command receipts and observed effects in the conversation. Hermes cannot override owner limits through prompt text.

Examples: 'Why is Uditus waiting?', 'Show what changed since yesterday', 'Give Etsy higher scheduling priority for the next hour', 'Stop Aster and report any residual work'. Proposals show exact scope, expiry and effect before submitting the command required by applicable owner policy.

## Transparency everywhere

Use three levels: campus signals, selection inspector, source evidence. Avoid large permanent labels on every object.

Agent inspector: declared role and authority, observed session/attempt, current job, sanitized current action, model actually used, time in state, usage attribution, blockers, evidence and freshness.

Job inspector: assignment/delegation chain, acceptance criteria, attempts, queue reason, provider/resource dependencies, approvals, reviews, artifacts, measured cost and why the job is or is not ready. Missing progress stays unreported.

Building inspector: roster, current work, queue, effective policy, source health, schedules, integration dependencies, usage, results and shutdown receipts. Shared HQ work links to the company mandate it supports where attribution is known.

Add dependency tracing: selecting a waiting job highlights its blocked provider, approval, workspace lock or missing integration. Add an optional bounded history replay marked Historical, with controls disabled. A compact incident rail shows actionable failures; selecting an incident focuses the affected building or reactor.

Every operational claim exposes observedAt, receivedAt, source, provenance, IDs and a human explanation. Distinguish declared/configured/observed, requested/effective, zero/unknown, idle/stopped, and disconnected/faulted.

## Authoritative architecture

Owner controls -> authenticated command service -> durable versioned policy -> scheduler admission and executor/provider/tool gates -> receipts and observations -> sanitized bridge -> Workshop state -> scene and inspectors.

This policy service sits above Hermes in authority. Enforce at every managed request/attempt, not just initial job creation. Children inherit bounded authority and explicit attribution. Prompts explain obligations, but deterministic gates enforce them. Any installed execution path that bypasses the gates is an uncovered path that blocks a claim of complete control.

Required data additions: provider scope and limit-window records; company policy revision and desired/effective lifecycle; per-call attribution and usage/reservations; cancellation and process evidence; command receipts; conversation messages; local resource measurements; capability/readiness records. Use explicit units and integer-safe amounts. Do not aggregate unlike quota units into a fabricated global capacity percentage.

Commands require authenticated owner identity, allowlisted action, stable target, command ID, expected policy revision, issue/expiry times, durable audit history and deterministic authorization. Bind local transport safely; add remote access only through a deliberately authenticated channel. A stale telemetry view does not disable a reachable stop command, but the UI cannot claim its effect until an authoritative receipt/reconciliation arrives.

## Delivery sequence

1. Reconcile the existing Mac SSE protocol, preserve its local changes, and establish explicit capability discovery and source evidence.
2. Build power station, inspectable visual semantics and chat/control interfaces against deterministic V2 simulation, visibly marked simulated.
3. Implement owner policy, per-company admission, executor cancellation, usage attribution and Hermes conversation transport on the Mini.
4. Connect real providers/scopes and quota collectors where supported. Unsupported limits remain visible as unknown.
5. Add dependency tracing, bounded replay and evidence-backed efficiency views.

UI and integration can progress separately, but release readiness requires the combined checks below. Git pull alone is not an installation or service restart.

## Release acceptance

- Replaying identical observations produces identical semantic state, independent of frame rate.
- Source loss never becomes fake lounge occupancy, a full reactor, or confirmed stopped status.
- Duplicate/replayed commands are idempotent; conflicting policy revisions cannot overwrite newer policy.
- Concurrent sibling work cannot over-reserve a shared company/provider budget.
- Company shutdown blocks new attempts, nested calls, schedules and retries; verifies cancellations and reports residual usage without stopping another company.
- Restart preserves owner limits, stopped state, commands and acknowledged outcomes. Browser disconnect does not release holds.
- Every installed request path is listed and checked for gate coverage. Unsupported controls remain disabled with a precise explanation.
- Quota tests cover unknown totals, stale evidence, multiple windows, reset evidence, exhaustion, fallback and no double-counting shared pools.
- Chat tests cover duplicates, streaming interruption, reconnect, recipient identity, cancellation and truthful linked action receipts.
- Build and domain tests run on the PC. Deployment runs migration/configuration, service, protocol, source and control checks automatically on the Mini, writes machine-readable results and supports rollback.
- Visual checks cover offshore geometry, pipe occlusion, camera/minimap coverage, all interiors, labels, controls, keyboard and reduced motion at required viewports.

See HERMES-V2-IMPLEMENTATION.md for the installation-agent brief. Neither document establishes that the missing runtime capabilities are implemented.
