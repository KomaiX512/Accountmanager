import { Component, ErrorInfo, ReactNode } from 'react';
import { FiAlertTriangle, FiRefreshCw, FiHome } from 'react-icons/fi';
import './ProcessingErrorBoundary.css';

interface Props {
  children: ReactNode;
  platform?: string;
  onReset?: () => void;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * 🛡️ PROCESSING ERROR BOUNDARY
 * 
 * Specialized error boundary for ProcessingLoadingState component
 * that provides graceful error handling and recovery options
 */
class ProcessingErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔥 PROCESSING ERROR BOUNDARY: Caught error in ProcessingLoadingState:', error);
    console.error('🔥 PROCESSING ERROR BOUNDARY: Error details:', errorInfo);
    
    this.setState({ error, errorInfo });

    // Clear potentially corrupted timer data
    if (this.props.platform) {
      try {
        localStorage.removeItem(`${this.props.platform}_processing_countdown`);
        localStorage.removeItem(`${this.props.platform}_processing_info`);
        console.log(`🔥 PROCESSING ERROR BOUNDARY: Cleared corrupted timer data for ${this.props.platform}`);
      } catch (clearError) {
        console.error('🔥 PROCESSING ERROR BOUNDARY: Failed to clear corrupted data:', clearError);
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleNavigateHome = () => {
    if (this.props.onNavigateHome) {
      this.props.onNavigateHome();
    } else {
      // Fallback navigation
      window.location.href = '/account';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="processing-error-container">
          <div className="processing-error-backdrop" />
          
          <div className="processing-error-content">
            <div className="processing-error-header">
              <div className="error-icon">
                <FiAlertTriangle size={48} />
              </div>
              <h1>Oops! Something went wrong</h1>
              <p className="error-subtitle">
                We encountered an error while setting up your {this.props.platform || 'platform'} dashboard.
              </p>
            </div>

            <div className="processing-error-details">
              <div className="error-message">
                <h3>What happened?</h3>
                <p>
                  There was a technical issue during the dashboard initialization process. 
                  This is usually temporary and can be resolved by refreshing the page.
                </p>
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="error-technical">
                  <summary>Technical Details (Development Only)</summary>
                  <pre>{this.state.error.toString()}</pre>
                  {this.state.errorInfo && (
                    <pre>{this.state.errorInfo.componentStack}</pre>
                  )}
                </details>
              )}
            </div>

            <div className="processing-error-actions">
              <button 
                className="error-action-button primary" 
                onClick={this.handleReset}
              >
                <FiRefreshCw size={18} />
                <span>Try Again</span>
              </button>
              
              <button 
                className="error-action-button secondary" 
                onClick={this.handleNavigateHome}
              >
                <FiHome size={18} />
                <span>Go to Main Dashboard</span>
              </button>
            </div>

            <div className="processing-error-help">
              <p>
                If this problem persists, please contact support with the error details above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ProcessingErrorBoundary;
