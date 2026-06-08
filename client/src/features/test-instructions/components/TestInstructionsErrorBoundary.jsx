import { Component } from 'react';

export default class TestInstructionsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[TestInstructions]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ti-state ti-state--error" role="alert">
          <h2 className="ti-state__title">Something went wrong</h2>
          <p className="ti-state__message">
            We could not display the test instructions. Please refresh the page or try again later.
          </p>
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
