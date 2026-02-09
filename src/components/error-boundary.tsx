"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
    };

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-6 text-center">
                    <div className="glass p-12 rounded-3xl max-w-md border border-white/5 shadow-2xl">
                        <h2 className="text-2xl font-bold mb-4 text-white">Something went wrong</h2>
                        <p className="text-white/40 mb-8">
                            DocuMint encountered an unexpected error. Please refresh the page or try again later.
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false })}
                            className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:scale-105 transition-all"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
