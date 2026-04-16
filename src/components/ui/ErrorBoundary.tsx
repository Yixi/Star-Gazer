/**
 * Error Boundary 组件
 * 捕获子组件渲染错误，防止单个区域崩溃导致整个应用白屏
 */
import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import i18n from "@/lib/i18n";

interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode;
  /** 区域名称，用于错误提示 */
  name?: string;
  /** 自定义 fallback UI */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.name ? ` - ${this.props.name}` : ""}] Component render error:`,
      error,
      errorInfo.componentStack
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-6 h-full w-full"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.05)" }}
        >
          <AlertCircle className="w-8 h-8" style={{ color: "#ef4444" }} />
          <p className="text-sm" style={{ color: "#e4e6eb" }}>
            {i18n.t("error.componentError", { name: this.props.name ? this.props.name + " " : "" })}
          </p>
          <p
            className="text-xs max-w-xs text-center truncate"
            style={{ color: "#6b7280" }}
          >
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              color: "#e4e6eb",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <RotateCcw className="w-3 h-3" />
            {i18n.t("error.retry")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
