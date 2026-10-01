import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';
import i18n from '../../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught a render error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <span className="error-boundary__code">✕</span>
          <h1 className="error-boundary__title">{i18n.t('errors.boundaryTitle')}</h1>
          <p className="error-boundary__text">
            {i18n.t('errors.boundaryText')}
          </p>
          <button type="button" className="btn btn--primary btn--lg" onClick={this.handleReload}>
            {i18n.t('common.toHome')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
