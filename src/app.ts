import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  startAutoDecisionCountdown,
  type CountdownSnapshot,
} from './autoDecision';
import {
  createDecisionState,
  isReadyToSubmit,
  makeAnswer,
  selectOption,
  type DecisionState,
} from './decisionState';
import type { Answer, DecisionPacket } from './types';

type Theme = 'light' | 'dark';

import { escapeHtml, icon, optionCard } from './decisionView';

export async function renderApp(root: HTMLElement): Promise<void> {
  let packet: DecisionPacket | null = null;
  let packetPath: string | null = null;
  let state = createDecisionState();
  let theme: Theme = (window.localStorage.getItem('choicelens-theme') as Theme | null) ?? 'light';
  let statusMessage = '';
  let statusError = false;
  let submitting = false;
  let submitted = false;
  let countdown: CountdownSnapshot | null = null;
  let cancelCountdown: (() => void) | null = null;

  const render = (): void => {
    document.documentElement.dataset.theme = theme;
    if (!packet) {
      root.innerHTML = `<div class="app-shell">
        <header class="topbar">
          <div class="brand"><span class="brand-mark">${icon('spark')}</span><span>Choice<span class="brand-light">Lens</span></span></div>
          <div class="topbar-actions"><button class="icon-button" id="theme-toggle" type="button" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} theme">${icon(theme === 'light' ? 'moon' : 'sun')}</button></div>
        </header>
        <main class="welcome-page">
          <div class="welcome-mark" aria-hidden="true">${icon('spark')}</div>
          <h1>Welcome to ChoiceLens</h1>
          <p>Open a question from Codex or choose a decision packet to begin.</p>
          <button class="button button-primary" id="open-json" type="button">${icon('folder')}<span>Open question</span></button>
          ${statusMessage ? `<p class="welcome-status ${statusError ? 'error' : 'success'}" role="status">${escapeHtml(statusMessage)}</p>` : ''}
        </main>
      </div>`;

      bindCommonControls();
      return;
    }

    const active = packet.activeDecision;
    const recommendedOption = active.options.find((option) => option.recommended);
    root.innerHTML = `<div class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">${icon('spark')}</span><span>Choice<span class="brand-light">Lens</span></span></div>
        <div class="topbar-actions"><button class="icon-button" id="theme-toggle" type="button" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} theme">${icon(theme === 'light' ? 'moon' : 'sun')}</button><button class="button button-secondary" id="open-json" type="button">${icon('folder')}<span>Open question</span></button></div>
      </header>
      <div class="layout">
        <main class="main-content">
          <div class="content-intro"><h1 id="decision-question">${escapeHtml(active.title)}</h1><p class="lede">${escapeHtml(active.prompt)}</p></div>
          ${active.context ? `<p class="decision-context">${escapeHtml(active.context)}</p>` : ''}
          ${packet.context && packet.context !== active.context ? `<details class="extra-context"><summary>More context</summary><p>${escapeHtml(packet.context)}</p></details>` : ''}
          <section class="decision-section" aria-labelledby="decision-question">
            <div class="choice-grid" role="group" aria-label="Decision choices">${active.options.map((option, index) => optionCard(option, state.selectedOptionId, submitted || submitting, index)).join('')}</div>
            <div class="custom-answer${state.selectedOptionId === 'custom' ? ' selected' : ''}"><label for="custom-input">Or write your own answer</label><textarea id="custom-input" rows="3" placeholder="Your answer…" ${submitted || submitting ? 'disabled' : ''}>${escapeHtml(state.customAnswer)}</textarea></div>
          </section>
          ${countdown && recommendedOption && !submitted ? `<section class="auto-decision" aria-label="Automatic default answer"><span>Automatic answer: ${escapeHtml(recommendedOption.title)} · <strong id="countdown-time">${countdown.remainingSeconds}s</strong></span><button id="stop-countdown" class="button button-quiet" type="button">Stop timer</button><progress max="100" value="${countdown.remainingPercent}" aria-label="Time remaining"></progress></section>` : ''}
          <footer class="decision-footer"><div class="selection-status" aria-live="polite">${statusMessage ? `<span class="${statusError ? 'error' : 'success'}">${statusError ? '!' : icon('check')}${escapeHtml(statusMessage)}</span>` : 'Choose an option or write your answer.'}</div><button class="button button-primary" id="submit-answer" type="button" ${!submitted && !submitting && isReadyToSubmit(state, active) ? '' : 'disabled'}>${submitted ? 'Answer submitted' : submitting ? 'Submitting…' : `Submit answer ${icon('arrow')}`}</button></footer>
        </main>
      </div>
    </div>`;

    bindCommonControls();
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        stopCountdown();
        const optionId = button.dataset.option ?? '';
        state = selectOption(state, optionId);
        statusMessage = '';
        statusError = false;
        render();
        Array.from(root.querySelectorAll<HTMLButtonElement>('[data-option]')).find((button) => button.dataset.option === optionId)?.focus();
      });
    });
    const input = root.querySelector<HTMLTextAreaElement>('#custom-input');
    input?.addEventListener('focus', () => {
      stopCountdown();
      state = selectOption(state, 'custom');
      root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((button) => {
        button.classList.remove('selected');
        button.setAttribute('aria-pressed', 'false');
      });
      root.querySelector('.custom-answer')?.classList.add('selected');
      const submit = root.querySelector<HTMLButtonElement>('#submit-answer');
      if (submit) submit.disabled = submitted || submitting || !isReadyToSubmit(state, active);
    });
    input?.addEventListener('input', () => {
      state = { ...state, customAnswer: input.value };
      const submit = root.querySelector<HTMLButtonElement>('#submit-answer');
      if (submit) submit.disabled = submitted || submitting || !isReadyToSubmit(state, active);
    });
    root.querySelector('#stop-countdown')?.addEventListener('click', stopCountdown);
    root.querySelectorAll('details').forEach((details) => details.addEventListener('toggle', () => {
      if (details.open) stopCountdown();
    }));
    root.querySelector<HTMLButtonElement>('#submit-answer')?.addEventListener('click', () => void submitAnswer());
  };

  const bindCommonControls = (): void => {
    root.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
      stopCountdown();
      theme = theme === 'light' ? 'dark' : 'light';
      window.localStorage.setItem('choicelens-theme', theme);
      render();
    });
    root.querySelector<HTMLButtonElement>('#open-json')?.addEventListener('click', () => void openPacket());
  };

  const openPacket = async (): Promise<void> => {
    stopCountdown();
    try {
      const selected = await open({ multiple: false, directory: false, filters: [{ name: 'Decision packet', extensions: ['json'] }] });
      if (!selected || Array.isArray(selected)) return;
      packet = await invoke<DecisionPacket>('load_packet', { path: selected });
      packetPath = selected;
      state = createDecisionState();
      submitted = false;
      statusMessage = '';
      statusError = false;
      startCountdown();
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      statusError = true;
    }
    render();
  };

  const submitAnswer = async (): Promise<void> => {
    if (submitted || submitting) return;
    if (!packet || !packetPath || !isReadyToSubmit(state, packet.activeDecision)) {
      statusMessage = packetPath ? 'Choose an option before submitting.' : 'Open a packet to save your answer.';
      statusError = true;
      render();
      return;
    }
    const answer: Answer = makeAnswer(packet.title, packet.activeDecision, state);
    cancelCountdown?.();
    cancelCountdown = null;
    countdown = null;
    submitting = true;
    render();
    try {
      await invoke<string>('save_answer', { packetPath, answer });
      submitted = true;
      statusMessage = 'Answer saved. You can return to Codex.';
      statusError = false;
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      statusError = true;
    }
    submitting = false;
    render();
  };

  const submitRecommendedAnswer = async (): Promise<void> => {
    if (!packet) return;
    const recommendation = packet.activeDecision.options.find((option) => option.recommended);
    if (!recommendation || !packetPath || submitted || submitting) return;
    state = selectOption(state, recommendation.id);
    statusMessage = `Time expired · submitting ${recommendation.title}.`;
    statusError = false;
    render();
    await submitAnswer();
  };

  const stopCountdown = (): void => {
    cancelCountdown?.();
    cancelCountdown = null;
    countdown = null;
    root.querySelector('.auto-decision')?.remove();
  };

  const startCountdown = (): void => {
    cancelCountdown?.();
    countdown = null;
    if (!packetPath) return;
    cancelCountdown = startAutoDecisionCountdown({
      onTick: (snapshot) => {
        countdown = snapshot;
        // A timer tick must never replace the form or its focused input.
        const time = root.querySelector('#countdown-time');
        if (time) time.textContent = `${snapshot.remainingSeconds}s`;
        const progress = root.querySelector<HTMLProgressElement>('.auto-decision progress');
        if (progress) progress.value = snapshot.remainingPercent;
      },
      onExpire: () => {
        countdown = null;
        cancelCountdown = null;
        void submitRecommendedAnswer();
      },
    });
  };

  try {
    const startupPacketPath = await invoke<string | null>('get_startup_packet_path');
    if (startupPacketPath) {
      packet = await invoke<DecisionPacket>('load_packet', { path: startupPacketPath });
      packetPath = startupPacketPath;
      statusMessage = '';
      startCountdown();
    }
  } catch (error) {
    statusMessage = `Startup packet failed: ${error instanceof Error ? error.message : String(error)}`;
    statusError = true;
  }

  render();
}
