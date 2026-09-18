import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './tracker';

const MAX_COMPONENT_STACK = 2000;

type CaughtErrorHandler = (error: unknown, errorInfo: { componentStack?: string | null }) => void;

/**
 * Options for React 19's createRoot / hydrateRoot that also report errors your error
 * boundaries catch. React's usual behaviour is kept: caught errors are still logged (or passed
 * to your own onCaughtError), and uncaught errors are left to React, which reports them to
 * the window, where the tracker already sees them.
 *
 * @example createRoot(container, ghostwireRootOptions()).render(<App />);
 */
export function ghostwireRootOptions<T extends { onCaughtError?: CaughtErrorHandler }>(
  options: T = {} as T,
): T & { onCaughtError: CaughtErrorHandler } {
  const { onCaughtError } = options;

  return {
    ...options,
    onCaughtError(error, errorInfo) {
      if (onCaughtError) onCaughtError(error, errorInfo);
      else console.error(error); // React's default for caught errors

      reportError(error, {
        componentStack: errorInfo?.componentStack?.slice(0, MAX_COMPONENT_STACK),
      });
    },
  };
}

export interface GhostwireErrorBoundaryProps {
  /** What to show instead of the crashed children. */
  fallback: ReactNode | ((props: { error: unknown; reset: () => void }) => ReactNode);
  children?: ReactNode;
}

/**
 * An error boundary that reports what it catches, then shows your fallback. Only use it where
 * you want a fallback UI; to just report errors, ghostwireRootOptions() changes nothing visible.
 */
export class GhostwireErrorBoundary extends Component<
  GhostwireErrorBoundaryProps,
  { error: unknown; hasError: boolean }
> {
  state = { error: null as unknown, hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack?.slice(0, MAX_COMPONENT_STACK) });
  }

  reset = () => this.setState({ error: null, hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallback } = this.props;
    return typeof fallback === 'function'
      ? fallback({ error: this.state.error, reset: this.reset })
      : fallback;
  }
}
