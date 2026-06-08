import { Component } from 'react';

export default class TestResultErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[TestResult]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="tr-state tr-state--error" role="alert">
          <h2 className="tr-state__title">Unable to display result</h2>
          <p className="tr-state__message">Something went wrong rendering your result page.</p>
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
