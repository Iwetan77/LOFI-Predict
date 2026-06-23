import { Component, type ReactNode } from "react";

/** Keeps a rendering failure (e.g. WebGL unavailable) from taking down the game. */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.warn("[ErrorBoundary] caught", err);
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center text-[10px] text-white/50">
            visuals unavailable
          </div>
        )
      );
    }
    return this.props.children;
  }
}
