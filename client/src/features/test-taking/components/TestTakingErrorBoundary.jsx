import { Component } from 'react';

export default class TestTakingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[TestTaking]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="tt-state tt-state--error" role="alert">
          <h2 className="tt-state__title">Exam interface error</h2>
          <p className="tt-state__message">
            Something went wrong displaying the test. Please refresh or return to the start page.
          </p>
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
