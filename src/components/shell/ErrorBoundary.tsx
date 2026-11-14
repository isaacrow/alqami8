import React from 'react';

/**
 * When a part of ALQAMI crashes, show a calm bilingual message with a way back instead of a blank screen.
 * `area` keeps a crash inside one window or tool; without it the whole app is replaced.
 */
interface Props {
  children: React.ReactNode;
  area?: string;
  onClose?: () => void;
}

export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`ALQAMI${this.props.area ? ` (${this.props.area})` : ''} crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const local = Boolean(this.props.area);
    return (
      <div
        dir="rtl"
        role="alert"
        className={`${local ? 'w-full h-full min-h-[220px]' : 'fixed inset-0 z-[300]'} flex items-center justify-center bg-[#0c0a09]/95 text-white p-6`}
      >
        <div className="max-w-sm text-center space-y-3">
          <p className="text-[18px] font-semibold">حدث خطأ هنا</p>
          <p className="text-[14px] text-white/70">Something went wrong here.</p>
          <div className="flex justify-center gap-2 pt-2">
            {local && (
              <button
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onClose?.();
                }}
                className="h-11 px-5 rounded-full bg-white/15 text-[14px]"
              >
                أغلق · Close
              </button>
            )}
            <button onClick={() => location.reload()} className="h-11 px-5 rounded-full bg-[#FFD60A] text-black text-[14px] font-semibold">
              أعد التحميل · Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
