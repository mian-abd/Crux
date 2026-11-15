"use client";

// Catches a 3D view that throws (no WebGL context, a failed shader, a chunk
// that did not load) so one view never takes the page down. It renders
// nothing in the view's place and calls `onError`; the still, drawn
// underneath, stays on screen.

import { Component, useEffect, type ReactNode } from "react";

interface Props {
  onError: () => void;
  children: ReactNode;
}

export class LiveBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Wraps one mounted live view: errors fall back to the still, and the
 * parent's `ready` flag resets when the view unmounts, so a remounted view
 * starts unready and the still stays up until it draws.
 */
export function LiveMount({
  onError,
  setReady,
  children,
}: {
  onError: () => void;
  setReady: (ready: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => () => setReady(false), [setReady]);
  return <LiveBoundary onError={onError}>{children}</LiveBoundary>;
}
