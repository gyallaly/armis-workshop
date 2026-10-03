# ARMIS project guidance

For any city building, district, campus layout, interior, or agent visualization change, read and follow [docs/BUILDING-SPEC.md](docs/BUILDING-SPEC.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Keep declared Control identities separate from observed execution. Never fabricate live telemetry. See docs/LIVE-INTEGRATION.md for current connection limits.

For runtime, control, chat or Mini deployment changes, read docs/V2-RUNTIME-CONTRACT.md and docs/HERMES-V2-IMPLEMENTATION.md. The latter is the installation-agent brief. Verify supported installed Hermes hooks and every execution entry point before enabling owner controls; prompts and capability advertisements alone do not prove enforcement. Preserve the Mini's local changes and report readiness in the viewer without requiring manual diagnostic terminal round trips.
