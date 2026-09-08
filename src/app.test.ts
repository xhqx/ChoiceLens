// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderApp } from './app';
import { samplePacket } from './samplePacket';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
let root: HTMLElement;
beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.useFakeTimers();
  vi.mocked(invoke).mockReset().mockImplementation(async (command) => {
    if (command === 'get_startup_packet_path') return '/test/question.json';
    if (command === 'load_packet') return samplePacket;
    if (command === 'save_answer') return '/test/question.answer.json';
  });
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app')!;
  await renderApp(root);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('shows only the welcome page when no question was provided', async () => {
  vi.clearAllTimers();
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'get_startup_packet_path') return null;
  });
  document.body.innerHTML = '<div id="empty-app"></div>';
  const emptyRoot = document.querySelector<HTMLElement>('#empty-app')!;
  await renderApp(emptyRoot);
  expect(emptyRoot.querySelector('.welcome-page')).not.toBeNull();
  expect(emptyRoot.textContent).toContain('Welcome to ChoiceLens');
  expect(emptyRoot.textContent).not.toContain('payment');
  expect(emptyRoot.querySelector('[data-option]')).toBeNull();
  expect(emptyRoot.querySelector('#submit-answer')).toBeNull();
  expect(emptyRoot.querySelector('.auto-decision')).toBeNull();
  await vi.advanceTimersByTimeAsync(65000);
  expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual(['get_startup_packet_path']);
});
it('keeps the welcome page on a failed startup, then opens a valid question', async () => {
  vi.clearAllTimers();
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'get_startup_packet_path') return '/test/missing.json';
    if (command === 'load_packet') throw new Error('Cannot read packet');
  });
  await renderApp(root);
  expect(root.querySelector('.welcome-page')).not.toBeNull();
  expect(root.querySelector('[role="status"]')?.textContent).toContain('Cannot read packet');
  expect(root.querySelector('[data-option]')).toBeNull();
  await vi.advanceTimersByTimeAsync(65000);
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === 'save_answer')).toBe(false);
  vi.mocked(open).mockResolvedValueOnce(null);
  root.querySelector<HTMLButtonElement>('#open-json')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(root.querySelector('.welcome-page')).not.toBeNull();
  vi.mocked(open).mockResolvedValueOnce('/test/recovered.json');
  vi.mocked(invoke).mockResolvedValue(samplePacket);
  root.querySelector<HTMLButtonElement>('#open-json')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(root.querySelector('.welcome-page')).toBeNull();
  expect(root.querySelector('#decision-question')?.textContent).toBe(samplePacket.activeDecision.title);
  expect(root.querySelector('#countdown-time')?.textContent).toBe('60s');
});
it('ticks without replacing controls or losing keyboard focus', () => {
  const button = root.querySelector<HTMLButtonElement>('[data-option]')!;
  const textarea = root.querySelector('#custom-input');
  button.focus();
  vi.advanceTimersByTime(2000);
  expect(document.activeElement).toBe(button);
  expect(root.querySelector('#custom-input')).toBe(textarea);
  expect(root.querySelector('#countdown-time')?.textContent).toBe('58s');
});
it('keeps custom text and selection, cancels timeout, and saves only custom text', async () => {
  const input = root.querySelector<HTMLTextAreaElement>('#custom-input')!;
  input.focus();
  input.value = 'Мой ответ: сначала проверить ввод.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.setSelectionRange(4, 9);
  await vi.advanceTimersByTimeAsync(65000);
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(4);
  expect(input.selectionEnd).toBe(9);
  expect(root.querySelector('.auto-decision')).toBeNull();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'save_answer')).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('#submit-answer')!.click();
  await vi.advanceTimersByTimeAsync(0);
  const call = vi.mocked(invoke).mock.calls.find(([command]) => command === 'save_answer');
  expect(call?.[1]).toMatchObject({ answer: { customAnswer: input.value } });
  expect((call?.[1] as any).answer.selectedOptionId).toBeUndefined();
});
it('does not submit whitespace and retains the draft when switching choices', () => {
  const input = root.querySelector<HTMLTextAreaElement>('#custom-input')!;
  input.focus(); input.value = '   '; input.dispatchEvent(new Event('input'));
  expect(root.querySelector<HTMLButtonElement>('#submit-answer')!.disabled).toBe(true);
  input.value = 'Keep my draft'; input.dispatchEvent(new Event('input'));
  root.querySelector<HTMLButtonElement>('[data-option]')!.click();
  const nextInput = root.querySelector<HTMLTextAreaElement>('#custom-input')!;
  expect(nextInput.value).toBe('Keep my draft');
  nextInput.focus();
  expect(root.querySelector('[aria-pressed="true"]')).toBeNull();
});
it('still submits the recommendation once when left untouched', async () => {
  await vi.advanceTimersByTimeAsync(65000);
  const calls = vi.mocked(invoke).mock.calls.filter(([command]) => command === 'save_answer');
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ answer: { selectedOptionId: samplePacket.activeDecision.options.find(option => option.recommended)!.id } });
});
