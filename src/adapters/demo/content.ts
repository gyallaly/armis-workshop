/**
 * Illustrative demo content. None of this describes real client work, real
 * deployments or real throughput; it exists so the viewer has something to
 * show with no secrets and no network.
 */

export interface TaskTemplate {
  title: string;
  criteria: string[];
  /** Capacity scopes allowed to serve this task, in preference order. */
  eligible: ('cap-codex' | 'cap-gemini')[];
  /** Ends in a human sign-off hold instead of ready. */
  needsApproval?: boolean;
}

export const TASKS: Record<string, TaskTemplate[]> = {
  uditus: [
    { title: 'Review landing page', criteria: ['Contrast checked', 'Keyboard navigation works', 'Claims reviewed'], eligible: ['cap-codex', 'cap-gemini'] },
    { title: 'Audit client landing page', criteria: ['Contrast checked', 'Headings in order', 'Alt text present'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Fix focus order in nav component', criteria: ['Tab order matches visual order', 'Focus ring visible', 'No regressions'], eligible: ['cap-codex'] },
    { title: 'Draft accessibility summary', criteria: ['Plain-language summary', 'Findings cited', 'Severity labelled'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Review pricing page claims', criteria: ['Every claim sourced', 'No guarantees implied', 'Tone matches brand'], eligible: ['cap-codex', 'cap-gemini'], needsApproval: true },
    { title: 'Check form error messages', criteria: ['Errors announced', 'Messages specific', 'Colour not sole cue'], eligible: ['cap-codex', 'cap-gemini'] },
    { title: 'Refactor report table markup', criteria: ['Table headers scoped', 'Caption present', 'Snapshot unchanged'], eligible: ['cap-codex'] },
    { title: 'Verify alt text on case studies', criteria: ['Decorative images hidden', 'Informative alt text', 'No filenames as alt'], eligible: ['cap-gemini', 'cap-codex'] },
  ],
  'etsy-studio': [
    { title: 'Listing copy: speckled ceramic mug', criteria: ['Materials accurate', 'Care instructions', 'Under 140 chars title'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Research holiday gift trends', criteria: ['Five sourced trends', 'Fit with catalogue', 'Notes dated'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Product photo checklist', criteria: ['Lighting notes', 'Angles listed', 'Alt text drafted'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Size chart for linen aprons', criteria: ['Metric and imperial', 'Matches pattern', 'Readable on mobile'], eligible: ['cap-codex', 'cap-gemini'] },
    { title: 'Tag set for candle listings', criteria: ['13 tags', 'No trademarked terms', 'Seasonal mix'], eligible: ['cap-gemini', 'cap-codex'] },
    { title: 'Shop announcement draft', criteria: ['Dates correct', 'Friendly tone', 'No promises on shipping'], eligible: ['cap-gemini', 'cap-codex'], needsApproval: true },
  ],
};

export const ACTIONS: Record<string, [string, string][]> = {
  feeds: [
    ['Scanning news feeds (simulated)', 'feeds.scan'],
    ['Recording publication and observation times', 'evidence.log'],
  ],
  rules: [
    ['Comparing contract rules across venues', 'rules.compare'],
    ['Checking resolution source and cutoff', 'rules.verify'],
  ],
  trader_watch: [
    ['Reading public trader profile (simulated)', 'profile.read'],
    ['Marking unverified claims', 'notes.write'],
  ],
  portfolio: [
    ['Sizing against paper bankroll', 'paper.size'],
    ['Recording simulated decision', 'paper.log'],
  ],
  research: [
    ['Reading the brief', 'docs.read'],
    ['Collecting references', 'search (simulated)'],
    ['Summarising findings', 'notes.write'],
    ['Checking sources', 'docs.read'],
  ],
  creation: [
    ['Drafting section', 'editor.write'],
    ['Building page preview', 'build.run'],
    ['Revising copy', 'editor.write'],
    ['Formatting output', 'editor.format'],
  ],
  audit: [
    ['Checking contrast', 'a11y.contrast'],
    ['Checking keyboard navigation', 'a11y.keyboard'],
    ['Reviewing claims', 'review.claims'],
    ['Comparing against criteria', 'review.criteria'],
  ],
  fixes: [
    ['Applying fix for findings', 'editor.patch'],
    ['Re-running checks', 'a11y.scan'],
    ['Updating evidence', 'notes.write'],
  ],
};

export const FINDINGS: [string, 'critical' | 'serious' | 'moderate' | 'minor'][] = [
  ['Low contrast on secondary button text', 'serious'],
  ['Hero image missing alt text', 'serious'],
  ['Focus ring hidden on nav links', 'critical'],
  ['Heading levels skip from h2 to h4', 'moderate'],
  ['Claim "guaranteed results" lacks source', 'serious'],
  ['Link text "click here" is not descriptive', 'minor'],
  ['Form error shown by colour only', 'serious'],
];

export function artifactPreview(stage: string, title: string, findings: string[] = []): { kind: 'markdown' | 'report' | 'diff'; title: string; preview: string } {
  switch (stage) {
    case 'feeds':
      return { kind: 'markdown', title: 'evidence-log.md', preview: `# Evidence log - ${title}\n\n- Items recorded with publication time AND observation time\n- Primary source flagged separately from reports about it\n- Contradictions linked, not resolved here\n\n_Simulated feed - no live news source is connected._` };
    case 'rules':
      return { kind: 'report', title: 'rules-comparison.txt', preview: `RULES COMPARISON - ${title}\nEach venue contract is compared on its own wording:\n- resolution source\n- cutoff time\n- settlement edge cases\nSimilarly named contracts are NOT treated as identical.\n(Simulated - illustrative)` };
    case 'trader_watch':
      return { kind: 'markdown', title: 'trader-summary.md', preview: `# ${title}\n\nSummary of PUBLIC information only. Claims are marked unverified.\nNo X/social data was collected for this demo.\n\n_Illustrative content._` };
    case 'portfolio':
      return { kind: 'report', title: 'paper-decision.txt', preview: `PAPER DECISION - ${title}\nSimulated decision against a $20 demo bankroll.\nNo order was placed. No account is connected.\n(Simulated - illustrative)` };
    case 'research':
      return {
        kind: 'markdown',
        title: 'research-notes.md',
        preview: `# Research notes - ${title}\n\n- Scope confirmed against the task brief\n- 4 references collected (illustrative)\n- Open question: confirm audience with owner\n\n_Demo artifact: illustrative content only._`,
      };
    case 'creation':
      return {
        kind: 'markdown',
        title: 'draft.md',
        preview: `# ${title}\n\n## Summary\nA short, plain-language draft produced for review.\n\n## Body\nLorem-free placeholder copy written for the demo. It is a workshop artifact,\nnot an outbound message, and nothing has been sent or published.\n\n_Demo artifact: illustrative content only._`,
      };
    case 'audit':
      if (title.includes('(fictional)')) return { kind: 'report', title: 'audit-report.txt', preview: `INDEPENDENT AUDIT - ${title}\nChecks: primary source, rule match, quote freshness (< 60 s).\n(Simulated - illustrative)` };
      return {
        kind: 'report',
        title: 'audit-report.txt',
        preview: findings.length
          ? `AUDIT REPORT - ${title}\nResult: FAILED (${findings.length} finding${findings.length > 1 ? 's' : ''})\n\n${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nNext: route to Fixes, then independent re-audit.\n(Demo artifact - illustrative)`
          : `AUDIT REPORT - ${title}\nResult: PASSED\nAll acceptance criteria met.\nReady for a person to review. Not sent, not published.\n(Demo artifact - illustrative)`,
      };
    default:
      return {
        kind: 'diff',
        title: 'repair.diff',
        preview: `--- a/draft.md\n+++ b/draft.md\n@@ -3,4 +3,4 @@\n-<button class="btn-secondary">Learn more</button>\n+<button class="btn-secondary btn-contrast">Learn more about audits</button>\n-<img src="hero.png">\n+<img src="hero.png" alt="Team reviewing an accessibility report">\n\n(Demo artifact - illustrative)`,
      };
  }
}
