import { Component } from 'react';

export default class CreateQuestionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[CreateQuestion] render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="admin-card" style={{ padding: '1.5rem', margin: '1rem' }}>
          <h2 className="heading-4">Question Authoring failed to load</h2>
          <p className="admin-field__hint" style={{ marginTop: '0.5rem' }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            style={{ marginTop: '1rem' }}
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
