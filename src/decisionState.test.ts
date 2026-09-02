import { describe, expect, it } from 'vitest';
import { createDecisionState, isReadyToSubmit, recommendedOption, selectOption } from './decisionState';
import { samplePacket } from './samplePacket';

describe('decision selection', () => {
  it('starts with no preselected option, including the recommendation', () => {
    const state = createDecisionState();
    expect(state.selectedOptionId).toBeNull();
    expect(recommendedOption(samplePacket.activeDecision)?.id).toBe('module');
  });

  it('selects only after an explicit option action', () => {
    const selected = selectOption(createDecisionState(), 'worker');
    expect(selected.selectedOptionId).toBe('worker');
    expect(isReadyToSubmit(selected, samplePacket.activeDecision)).toBe(true);
  });

  it('requires text for a custom answer', () => {
    const selected = selectOption(createDecisionState(), 'custom');
    expect(isReadyToSubmit(selected, samplePacket.activeDecision)).toBe(false);
    expect(isReadyToSubmit({ ...selected, customAnswer: 'A queue-backed boundary' }, samplePacket.activeDecision)).toBe(true);
  });
});
