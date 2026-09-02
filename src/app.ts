import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  createDecisionState,
  isReadyToSubmit,
  makeAnswer,
  selectOption,
  type DecisionState,
} from './decisionState';
import { samplePacket } from './samplePacket';
import type { Answer, Comparison, DecisionOption, DecisionPacket, TradeoffKind } from './types';

type Theme = 'light' | 'dark';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);

function icon(name: 'sun' | 'moon' | 'folder' | 'compare' | 'check' | 'arrow' | 'spark' | 'close'): string {
  const paths: Record<string, string> = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
    moon: '<path d="M20.5 14.7A8.5 8.5 0 0 1 9.3 3.5 8.5 8.5 0 1 0 20.5 14.7Z"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2h8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 2 17.5v-11Z"/>',
    compare: '<path d="M7 3v18M7 3l-3 3M7 3l3 3M17 21V3m0 18 3-3m-3 3-3-3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    spark: '<path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4L12 3ZM19 17l-.7 2.3L16 20l2.3.7L19 23l.7-2.3L22 20l-2.3-.7L19 17Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function tradeoffClass(kind: TradeoffKind | undefined): string {
  return kind === 'gain' ? 'gain' : kind === 'risk' ? 'risk' : kind === 'cost' ? 'cost' : 'neutral';
}

function renderTradeoff(label: string, kind?: TradeoffKind): string {
  const prefix = kind === 'gain' ? '+' : kind === 'cost' || kind === 'risk' ? '–' : '•';
  return `<span class="tradeoff ${tradeoffClass(kind)}"><b>${prefix}</b>${escapeHtml(label)}</span>`;
}

function optionCard(option: DecisionOption, state: DecisionState): string {
  const selected = state.selectedOptionId === option.id;
  const recommendation = option.recommended ? `<span class="recommendation">${icon('spark')} Recommended</span>` : '';
  const reason = option.recommended && option.recommendationReason
    ? `<p class="recommendation-reason">${escapeHtml(option.recommendationReason)}</p>`
    : '';
  return `<button class="choice-card${selected ? ' selected' : ''}" data-option="${escapeHtml(option.id)}" aria-pressed="${selected}" type="button">
      <span class="choice-card-top"><span class="option-mark">${option.id.slice(0, 1).toUpperCase()}</span>${recommendation}</span>
      <span class="choice-title">${escapeHtml(option.title)}</span>
      <span class="choice-summary">${escapeHtml(option.summary)}</span>
      <span class="tradeoffs">${option.tradeoffs.map((tradeoff) => renderTradeoff(tradeoff.label, tradeoff.kind)).join('')}</span>
      ${reason}
      ${option.details ? `<span class="choice-details">${escapeHtml(option.details)}</span>` : ''}
      <span class="details-hint">${icon('arrow')} Focus for details</span>
    </button>`;
}

function comparisonMarkup(comparison: Comparison, optionTitle: string): string {
  const exactNotice = comparison.exact ? '' : '<div class="illustrative-label">Illustrative — exact patch may differ</div>';
  const beforeCode = comparison.beforeCode ? `<pre><code>${escapeHtml(comparison.beforeCode)}</code></pre>` : '';
  const afterCode = comparison.afterCode ? `<pre><code>${escapeHtml(comparison.afterCode)}</code></pre>` : '';
  return `<div class="comparison-head"><div><span class="eyebrow">Impact preview</span><h2 id="comparison-title">${escapeHtml(optionTitle)}</h2></div><button class="icon-button close-comparison" aria-label="Close comparison" type="button">${icon('close')}</button></div>
    ${exactNotice}
    <div class="comparison-grid">
      <section class="diagram-panel before"><span class="diagram-label">${escapeHtml(comparison.beforeLabel ?? 'Before')}</span><h3>${escapeHtml(comparison.before)}</h3>${beforeCode}<div class="diagram-flow"><span>Current</span><i>→</i><span class="node-muted">${escapeHtml(comparison.before)}</span></div></section>
      <section class="diagram-panel after"><span class="diagram-label">${escapeHtml(comparison.afterLabel ?? 'After')}</span><h3>${escapeHtml(comparison.after)}</h3>${afterCode}<div class="diagram-flow"><span>Target</span><i>→</i><span class="node-accent">${escapeHtml(comparison.after)}</span></div></section>
    </div>`;
}

export function renderApp(root: HTMLElement): void {
  let packet: DecisionPacket = samplePacket;
  let packetPath: string | null = null;
  let state = createDecisionState();
  let theme: Theme = (localStorage.getItem('choicelens-theme') as Theme | null) ?? 'light';
  let compareOpen = false;
  let statusMessage = '';
  let statusError = false;

  const render = (): void => {
    const active = packet.activeDecision;
    const selectedOption = active.options.find((option) => option.id === state.selectedOptionId);
    const activeChapterIndex = Math.max(0, packet.chapters.findIndex((chapter) => chapter.status === 'active'));
    const activeChapter = packet.chapters[activeChapterIndex];
    const chapterNumber = String(activeChapterIndex + 1).padStart(2, '0');
    document.documentElement.dataset.theme = theme;
    root.innerHTML = `<div class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">${icon('spark')}</span><span>Choice<span class="brand-light">Lens</span></span></div>
        <div class="topbar-actions"><span class="file-context">${packetPath ? `Loaded · ${escapeHtml(packetPath.split('/').pop() ?? 'packet.json')}` : 'Built-in sample packet'}</span><button class="icon-button" id="theme-toggle" type="button" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} theme">${icon(theme === 'light' ? 'moon' : 'sun')}</button><button class="button button-secondary" id="open-json" type="button">${icon('folder')}<span>Open JSON</span></button></div>
      </header>
      <div class="layout">
        <aside class="sidebar" aria-label="Development chapters">
          <div class="sidebar-kicker">Packet map</div>
          <h2>${escapeHtml(packet.title)}</h2>
          <nav class="chapter-list">${packet.chapters.map((chapter, index) => `<div class="chapter ${chapter.status === 'active' ? 'active' : ''}" ${chapter.status === 'active' ? 'aria-current="step"' : ''}><span class="chapter-number ${chapter.status === 'complete' ? 'complete' : ''}">${chapter.status === 'complete' ? icon('check') : `0${index + 1}`}</span><span><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.summary)}</small></span></div>`).join('')}</nav>
          <div class="sidebar-footer"><span class="status-dot"></span><span>${packetPath ? 'Packet validated' : 'Ready for a decision'}</span></div>
        </aside>
        <main class="main-content">
          <div class="content-intro"><div><span class="eyebrow">Chapter ${chapterNumber} · ${escapeHtml(activeChapter?.title ?? 'Active decision')}</span><h1>${escapeHtml(active.title)}</h1><p class="lede">${escapeHtml(active.prompt)}</p></div><div class="step-count"><span>${chapterNumber}</span><small>of ${String(packet.chapters.length).padStart(2, '0')}</small></div></div>
          ${packet.context ? `<div class="context-strip"><span class="context-icon">i</span><p>${escapeHtml(packet.context)}</p></div>` : ''}
          <section class="decision-section" aria-labelledby="decision-question"><div class="section-heading"><div><span class="eyebrow">Active decision</span><h2 id="decision-question">Choose your path</h2></div><button class="button button-quiet" id="compare" type="button" ${selectedOption?.comparison ? '' : 'disabled'}>${icon('compare')} Compare impact</button></div>
            ${active.context ? `<p class="decision-context">${escapeHtml(active.context)}</p>` : ''}
            <div class="choice-grid" role="group" aria-label="Decision choices">${active.options.map((option) => optionCard(option, state)).join('')}<button class="choice-card custom-card${state.selectedOptionId === 'custom' ? ' selected' : ''}" data-option="custom" aria-pressed="${state.selectedOptionId === 'custom'}" type="button"><span class="choice-card-top"><span class="option-mark custom-mark">+</span></span><span class="choice-title">Write your own</span><span class="choice-summary">Have a different path in mind? Capture it in your own words.</span><span class="choice-details">Your answer is saved as free text beside the packet.</span><span class="details-hint">${icon('arrow')} Focus to add a response</span></button></div>
            ${state.selectedOptionId === 'custom' ? `<div class="custom-answer"><label for="custom-input">Your answer <span>Required</span></label><textarea id="custom-input" rows="3" placeholder="Describe the boundary you want to explore…">${escapeHtml(state.customAnswer)}</textarea></div>` : ''}
          </section>
          <footer class="decision-footer"><div class="selection-status" aria-live="polite">${statusMessage ? `<span class="${statusError ? 'error' : 'success'}">${statusError ? '!' : icon('check')}${escapeHtml(statusMessage)}</span>` : selectedOption ? `Previewing: <strong>${escapeHtml(selectedOption.title)}</strong> · nothing is saved yet` : 'Choose a card to preview its impact'}</div><button class="button button-primary" id="submit-answer" type="button" ${isReadyToSubmit(state, active) ? '' : 'disabled'}>Submit answer ${icon('arrow')}</button></footer>
        </main>
      </div>
      ${compareOpen && selectedOption?.comparison ? `<div class="modal-backdrop" role="presentation"><section class="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="comparison-title">${comparisonMarkup(selectedOption.comparison, selectedOption.title)}</section></div>` : ''}
    </div>`;

    root.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
      theme = theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('choicelens-theme', theme);
      render();
    });
    root.querySelector<HTMLButtonElement>('#open-json')?.addEventListener('click', () => void openPacket());
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const optionId = button.dataset.option ?? '';
        state = selectOption(state, optionId);
        statusMessage = '';
        statusError = false;
        render();
        if (state.selectedOptionId === 'custom') {
          root.querySelector<HTMLTextAreaElement>('#custom-input')?.focus();
        } else {
          Array.from(root.querySelectorAll<HTMLButtonElement>('[data-option]')).find((optionButton) => optionButton.dataset.option === optionId)?.focus();
        }
      });
    });
    root.querySelector<HTMLTextAreaElement>('#custom-input')?.addEventListener('input', (event) => {
      state = { ...state, customAnswer: (event.target as HTMLTextAreaElement).value };
      const submit = root.querySelector<HTMLButtonElement>('#submit-answer');
      if (submit) submit.disabled = !isReadyToSubmit(state, active);
    });
    root.querySelector<HTMLButtonElement>('#compare')?.addEventListener('click', () => { compareOpen = true; render(); });
    root.querySelectorAll<HTMLButtonElement>('.close-comparison').forEach((button) => button.addEventListener('click', () => { compareOpen = false; render(); }));
    root.querySelector<HTMLElement>('.comparison-modal')?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        compareOpen = false;
        render();
      }
    });
    if (compareOpen) root.querySelector<HTMLButtonElement>('.close-comparison')?.focus();
    root.querySelector<HTMLElement>('.modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { compareOpen = false; render(); } });
    root.querySelector<HTMLButtonElement>('#submit-answer')?.addEventListener('click', () => void submitAnswer());
  };

  const openPacket = async (): Promise<void> => {
    try {
      const selected = await open({ multiple: false, directory: false, filters: [{ name: 'Decision packet', extensions: ['json'] }] });
      if (!selected || Array.isArray(selected)) return;
      packet = await invoke<DecisionPacket>('load_packet', { path: selected });
      packetPath = selected;
      state = createDecisionState();
      statusMessage = 'Packet loaded and validated.';
      statusError = false;
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      statusError = true;
    }
    render();
  };

  const submitAnswer = async (): Promise<void> => {
    if (!packetPath || !isReadyToSubmit(state, packet.activeDecision)) {
      statusMessage = packetPath ? 'Choose an option before submitting.' : 'Open a packet to save your answer.';
      statusError = true;
      render();
      return;
    }
    const answer: Answer = makeAnswer(packet.title, packet.activeDecision, state);
    try {
      const savedPath = await invoke<string>('save_answer', { packetPath, answer });
      statusMessage = `Answer saved · ${savedPath.split('/').pop() ?? 'answer.json'}`;
      statusError = false;
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      statusError = true;
    }
    render();
  };

  render();
}
