export interface StatusTimelineProps {
  /** Step labels in order, e.g. ["Intake & Verification","Credit Investigation","Committee Review","Negotiation & Docs","Briefing & Release","Monitoring"]. */
  steps: string[];
  /** Index of the current step (0-based). Steps before it render as done/past. */
  currentIndex: number;
  /** Render the current step as a denied/rejected state (red ✕) instead of in-progress. */
  denied?: boolean;
}
