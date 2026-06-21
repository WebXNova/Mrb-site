import { Component } from 'react';

export default class AdminSectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[admin-section]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    const { title = 'This section failed to load', children } = this.props;

    if (error) {
      return (
        <section className="admin-card admin-error-boundary" role="alert">
          <h2 className="heading-3">{title}</h2>
          <p className="admin-error">
            {error?.message || 'An unexpected error occurred while rendering this page section.'}
          </p>
          <button
            type="button"
            className="btn btn--secondary admin-touch-target"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </section>
      );
    }

    return children;
  }
}
