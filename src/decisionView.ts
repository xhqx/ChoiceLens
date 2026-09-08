export const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);

export function icon(name: 'sun' | 'moon' | 'folder' | 'compare' | 'check' | 'arrow' | 'spark' | 'close'): string {
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


import type { DecisionOption } from './types';

export function optionCard(option: DecisionOption, selectedId: string | null, disabled: boolean, index: number): string {
  const comparison = option.comparison;
  const details = [option.details, option.recommendationReason].filter(Boolean);
  return `<article class="option-row">
    <button class="choice-card${selectedId === option.id ? ' selected' : ''}" data-option="${escapeHtml(option.id)}" aria-pressed="${selectedId === option.id}" type="button" ${disabled ? 'disabled' : ''}>
      <span class="option-mark">${index + 1}</span>
      <span class="choice-copy"><span class="choice-title">${escapeHtml(option.title)} ${option.recommended ? '<span class="recommendation">Recommended</span>' : ''}</span><span class="choice-summary">${escapeHtml(option.summary)}</span></span>
      <span class="selection-mark" aria-hidden="true">${icon('check')}</span>
    </button>
    ${comparison ? `<div class="mini-flow" aria-label="${comparison.exact ? 'Before and after' : 'Illustrative comparison'}"><span><small>${escapeHtml(comparison.beforeLabel ?? 'Before')}</small>${escapeHtml(comparison.before)}</span><b aria-hidden="true">→</b><span><small>${escapeHtml(comparison.afterLabel ?? 'After')}${comparison.exact ? '' : ' · illustrative'}</small>${escapeHtml(comparison.after)}</span></div>` : ''}
    <details class="option-details"><summary>Details</summary>
      ${details.map((text) => `<p>${escapeHtml(text!)}</p>`).join('')}
      <div class="tradeoffs">${option.tradeoffs.map((item) => `<span class="tradeoff ${item.kind === 'gain' ? 'gain' : 'cost'}"><b>${item.kind === 'gain' ? '+' : item.kind === 'risk' || item.kind === 'cost' ? '−' : '•'}</b> ${escapeHtml(item.label)}</span>`).join('')}</div>
      ${comparison?.beforeCode ? `<pre><code>${escapeHtml(comparison.beforeCode)}</code></pre>` : ''}
      ${comparison?.afterCode ? `<pre><code>${escapeHtml(comparison.afterCode)}</code></pre>` : ''}
    </details>
  </article>`;
}
