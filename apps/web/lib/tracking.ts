import { Repeat, type LucideIcon } from 'lucide-react';
import type { BillingCycle, TrackedKind } from '@/lib/api';

/**
 * One entry per tracked budget. Adding a kind (e.g. 'health') means: extend
 * TrackedKind here and in the API (TRACKED_KINDS), add an entry below, and add
 * a page that renders <TrackedBudgetView kind="..." />. The sidebar, dialog,
 * budget view and transaction form pick it up from this config.
 */
export interface TrackedKindConfig {
  /** Plural, used for the page title and navigation. */
  label: string;
  /** Singular, used in buttons and messages. */
  noun: string;
  description: string;
  href: string;
  icon: LucideIcon;
  namePlaceholder: string;
}

export const TRACKED_KINDS: Record<TrackedKind, TrackedKindConfig> = {
  subscription: {
    label: 'Subscriptions',
    noun: 'subscription',
    description: 'Every recurring service, adding up to one monthly budget',
    href: '/dashboard/subscriptions',
    icon: Repeat,
    namePlaceholder: 'e.g. Netflix, iCloud',
  },
};

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

export const CYCLE_UNITS: Record<BillingCycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};
