import type { DecisionPacket } from './types';

export const samplePacket: DecisionPacket = {
  schemaVersion: 1,
  title: 'Checkout reliability, without the rewrite',
  subtitle: 'A focused decision packet for the payment boundary',
  context:
    'The checkout service is stable today, but payment-provider changes keep leaking into the order workflow. Choose the smallest seam that buys room to move.',
  chapters: [
    { id: 'signal', title: 'Signal', summary: 'What changed and why it matters', status: 'complete' },
    { id: 'constraints', title: 'Constraints', summary: 'The edges we should not cross', status: 'complete' },
    { id: 'decision', title: 'Decision', summary: 'Pick one payment boundary', status: 'active' },
    { id: 'follow-up', title: 'Follow-up', summary: 'How we will make the choice observable', status: 'upcoming' },
  ],
  activeDecision: {
    id: 'payment-boundary',
    title: 'Where should payment orchestration live?',
    prompt: 'Choose the boundary that keeps today’s delivery safe while making the next provider change cheaper.',
    context: 'We have one provider, 12 payment paths, and no appetite for a broad migration this quarter.',
    options: [
      {
        id: 'module',
        title: 'A small payment module',
        summary: 'Wrap provider calls behind a typed module in the existing service.',
        tradeoffs: [
          { label: 'small diff', kind: 'gain' },
          { label: 'easy to ship', kind: 'gain' },
          { label: 'service still owns retries', kind: 'cost' },
        ],
        details: 'Keep the module boring: map provider errors, expose intent-level methods, and leave workflow ownership where it is.',
        recommended: true,
        recommendationReason: 'It creates a clean seam with the lowest migration risk this quarter.',
        comparison: {
          exact: false,
          before: 'Order flow knows provider details',
          after: 'Order flow calls PaymentPort',
          beforeLabel: 'Today',
          afterLabel: 'With a small module',
          beforeCode: 'order → stripe.charge()\n      ↘ retry + error mapping',
          afterCode: 'order → PaymentPort\n             ↘ StripeAdapter',
        },
      },
      {
        id: 'worker',
        title: 'A payment worker',
        summary: 'Move orchestration to a queue-backed worker and return a payment intent.',
        tradeoffs: [
          { label: 'isolates retries', kind: 'gain' },
          { label: 'new operational surface', kind: 'cost' },
          { label: 'eventual status', kind: 'risk' },
        ],
        details: 'Best when throughput and retry isolation dominate. It asks the product flow to understand an asynchronous state machine.',
        comparison: {
          exact: false,
          before: 'Checkout waits on provider work',
          after: 'Checkout queues a payment intent',
          beforeLabel: 'Today',
          afterLabel: 'With a worker',
          beforeCode: 'checkout → provider → result',
          afterCode: 'checkout → queue → worker → provider\n        ↘ payment status events',
        },
      },
      {
        id: 'provider-api',
        title: 'A provider-neutral API',
        summary: 'Introduce a shared payment contract for every future provider.',
        tradeoffs: [
          { label: 'future flexibility', kind: 'gain' },
          { label: 'larger design', kind: 'cost' },
          { label: 'abstraction may leak', kind: 'risk' },
        ],
        details: 'A good platform investment later, but today it would make one provider’s edge cases everybody’s problem.',
        comparison: {
          exact: false,
          before: 'One service owns one provider',
          after: 'Services call a provider-neutral API',
          beforeLabel: 'Today',
          afterLabel: 'With a shared API',
          beforeCode: 'checkout → Stripe',
          afterCode: 'checkout → Payments API\n                ↘ Stripe | next provider',
        },
      },
    ],
  },
};
