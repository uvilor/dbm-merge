import type { DatabaseKind } from '../types';

interface PromptInput {
  sourceKind: DatabaseKind;
  targetKind: DatabaseKind;
  diffSnippet: string;
  ddlProposal: string;
}

export function buildReviewPrompt({
  sourceKind,
  targetKind,
  diffSnippet,
  ddlProposal,
}: PromptInput): string {
  const safety = `You are assisting with a schema synchronization between ${sourceKind} and ${targetKind}.
Do not execute any SQL. Review the proposal for destructive operations and ensure they are explicitly confirmed.
Highlight risky statements (DROP, TRUNCATE, CASCADE) and suggest mitigations.`;

  return [
    '### Context',
    safety,
    '',
    '### Diff Summary',
    `\u0060\u0060\u0060\n${diffSnippet.trim()}\n\u0060\u0060\u0060`,
    '',
    '### Proposed DDL',
    `\u0060\u0060\u0060\n${ddlProposal.trim()}\n\u0060\u0060\u0060`,
    '',
    '### Tasks',
    '1. Validate that the DDL migrates the target schema to the source schema without data loss unless explicitly requested.',
    '2. Recommend improvements such as transactional wrappers, lock minimization, or phased rollouts.',
    '3. Identify ambiguous steps and propose safe execution notes or TODOs.',
    '4. Return the answer as a Markdown checklist summarizing the review and any outstanding items.',
  ].join('\n');
}

export type { PromptInput };
