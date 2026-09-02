import type { ActiveDecision, Answer, DecisionOption } from './types';

export interface DecisionState {
  selectedOptionId: string | null;
  customAnswer: string;
}

/** A fresh state is deliberately empty: recommendations inform, never decide. */
export function createDecisionState(): DecisionState {
  return { selectedOptionId: null, customAnswer: '' };
}

export function selectOption(state: DecisionState, optionId: string): DecisionState {
  return { ...state, selectedOptionId: optionId };
}

export function recommendedOption(decision: ActiveDecision): DecisionOption | undefined {
  return decision.options.find((option) => option.recommended);
}

export function isReadyToSubmit(state: DecisionState, decision: ActiveDecision): boolean {
  if (!state.selectedOptionId) return false;
  const custom = state.selectedOptionId === 'custom';
  return !custom || state.customAnswer.trim().length > 0;
}

export function makeAnswer(
  packetTitle: string,
  decision: ActiveDecision,
  state: DecisionState,
): Answer {
  const base = { schemaVersion: 1 as const, packetTitle, decisionId: decision.id, submittedAt: new Date().toISOString() };

  if (state.selectedOptionId === 'custom') {
    return { ...base, customAnswer: state.customAnswer.trim() };
  }
  if (!state.selectedOptionId) throw new Error('cannot create an answer without a selection');
  return { ...base, selectedOptionId: state.selectedOptionId };
}
