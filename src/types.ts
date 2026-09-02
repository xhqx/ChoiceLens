/**
 * ChoiceLens decision packet schema v1.
 *
 * A packet is intentionally plain JSON so Codex can create it without a
 * ChoiceLens-specific SDK. Required fields are marked in the Rust validator:
 * title, chapters, activeDecision.id/title/options, and each option's id/title.
 * An option's `comparison` is optional; when present, before/after are short illustrative
 * descriptions or code snippets and `exact` communicates patch fidelity.
 */

export type TradeoffKind = 'gain' | 'cost' | 'risk' | 'neutral';

export interface Tradeoff {
  label: string;
  kind?: TradeoffKind;
}

interface DecisionOptionBase {
  id: string;
  title: string;
  summary: string;
  tradeoffs: [Tradeoff, ...Tradeoff[]];
  details?: string;
  comparison?: Comparison;
}

export interface RecommendedOption extends DecisionOptionBase {
  recommended: true;
  recommendationReason: string;
}

export interface RegularOption extends DecisionOptionBase {
  recommended?: false;
  recommendationReason?: never;
}

export type DecisionOption = RecommendedOption | RegularOption;
export type DecisionOptions =
  | [RecommendedOption, RegularOption]
  | [RegularOption, RecommendedOption]
  | [RecommendedOption, RegularOption, RegularOption]
  | [RegularOption, RecommendedOption, RegularOption]
  | [RegularOption, RegularOption, RecommendedOption];

export interface DecisionChapter {
  id: string;
  title: string;
  summary: string;
  status?: 'complete' | 'active' | 'upcoming';
}

export interface Comparison {
  exact: boolean;
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeCode?: string;
  afterCode?: string;
}

export interface ActiveDecision {
  id: string;
  title: string;
  prompt: string;
  context?: string;
  options: DecisionOptions;
}

export interface DecisionPacket {
  schemaVersion: 1;
  title: string;
  subtitle?: string;
  context?: string;
  chapters: DecisionChapter[];
  activeDecision: ActiveDecision;
}

interface AnswerBase {
  schemaVersion: 1;
  packetTitle: string;
  decisionId: string;
  submittedAt: string;
}

export type Answer = AnswerBase & (
  | { selectedOptionId: string; customAnswer?: never }
  | { selectedOptionId?: never; customAnswer: string }
);
