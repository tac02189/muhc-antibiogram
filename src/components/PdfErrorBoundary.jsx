import { Component } from "react";

/**
 * Catches errors thrown while loading or rendering the lazy pdf.js chunk.
 *
 * React <Suspense> only handles the *pending* state of a lazy import — a
 * *rejected* dynamic import (stale chunk hash after a redeploy, offline
 * first open, or the SPA rewrite handing back index.html as the chunk)
 * throws past Suspense to the nearest error boundary. Without one, that
 * blanks the entire app. This boundary contains the failure to the PDF
 * overlay, where the shell's fallback offers Reload / Open-in-browser.
 */
export default class PdfErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("PDF viewer failed to load:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
