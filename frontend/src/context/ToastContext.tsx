"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  action?: ToastAction;
  dismissible?: boolean;
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

export interface ToastContextType {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id?: string) => void;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  loading: (message: string, options?: ToastOptions) => string;
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    },
    options?: ToastOptions,
  ) => Promise<T>;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Standalone global trigger listener for use outside React tree
type ToastListener = (
  type: ToastType,
  message: string,
  options?: ToastOptions,
) => string;
type DismissListener = (id?: string) => void;

let globalShowToast: ToastListener | null = null;
let globalDismissToast: DismissListener | null = null;

/**
 * Standalone `toast` object that can be called anywhere, even outside React components.
 */
export const toast = {
  success: (message: string, options?: ToastOptions): string => {
    return globalShowToast ? globalShowToast("success", message, options) : "";
  },
  error: (message: string, options?: ToastOptions): string => {
    return globalShowToast ? globalShowToast("error", message, options) : "";
  },
  info: (message: string, options?: ToastOptions): string => {
    return globalShowToast ? globalShowToast("info", message, options) : "";
  },
  warning: (message: string, options?: ToastOptions): string => {
    return globalShowToast ? globalShowToast("warning", message, options) : "";
  },
  loading: (message: string, options?: ToastOptions): string => {
    return globalShowToast ? globalShowToast("loading", message, options) : "";
  },
  dismiss: (id?: string): void => {
    if (globalDismissToast) globalDismissToast(id);
  },
  promise: async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    },
    options?: ToastOptions,
  ): Promise<T> => {
    const toastId = toast.loading(messages.loading, options);
    try {
      const data = await promise;
      const successMsg =
        typeof messages.success === "function"
          ? messages.success(data)
          : messages.success;
      toast.dismiss(toastId);
      toast.success(successMsg, options);
      return data;
    } catch (err) {
      const errorMsg =
        typeof messages.error === "function"
          ? messages.error(err)
          : messages.error;
      toast.dismiss(toastId);
      toast.error(errorMsg, options);
      throw err;
    }
  },
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  info: 4500,
  warning: 5000,
  loading: Infinity,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);

  const dismissToast = useCallback((id?: string) => {
    if (id) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    } else {
      setToasts([]);
    }
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const id = options?.id || `toast-${Date.now()}-${++idCounter.current}`;
      const duration = options?.duration ?? DEFAULT_DURATIONS[type];

      setToasts((prev) => {
        // If a toast with this id already exists, update it in place
        const exists = prev.some((t) => t.id === id);
        if (exists) {
          return prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  type,
                  message,
                  title: options?.title,
                  description: options?.description,
                  duration,
                  action: options?.action,
                  dismissible: options?.dismissible ?? true,
                }
              : t,
          );
        }
        // Otherwise append new toast (capped at 5 visible toasts)
        const next = [
          ...prev,
          {
            id,
            type,
            message,
            title: options?.title,
            description: options?.description,
            duration,
            action: options?.action,
            dismissible: options?.dismissible ?? true,
            createdAt: Date.now(),
          },
        ];
        return next.slice(-5);
      });

      return id;
    },
    [],
  );

  // Connect standalone global toast helpers
  useEffect(() => {
    globalShowToast = showToast;
    globalDismissToast = dismissToast;
    return () => {
      globalShowToast = null;
      globalDismissToast = null;
    };
  }, [showToast, dismissToast]);

  const success = useCallback(
    (msg: string, opt?: ToastOptions) => showToast("success", msg, opt),
    [showToast],
  );
  const error = useCallback(
    (msg: string, opt?: ToastOptions) => showToast("error", msg, opt),
    [showToast],
  );
  const info = useCallback(
    (msg: string, opt?: ToastOptions) => showToast("info", msg, opt),
    [showToast],
  );
  const warning = useCallback(
    (msg: string, opt?: ToastOptions) => showToast("warning", msg, opt),
    [showToast],
  );
  const loading = useCallback(
    (msg: string, opt?: ToastOptions) => showToast("loading", msg, opt),
    [showToast],
  );

  const promiseFn = useCallback(
    async <T,>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      },
      options?: ToastOptions,
    ): Promise<T> => {
      const toastId = loading(messages.loading, options);
      try {
        const data = await promise;
        const successMsg =
          typeof messages.success === "function"
            ? messages.success(data)
            : messages.success;
        dismissToast(toastId);
        success(successMsg, options);
        return data;
      } catch (err) {
        const errorMsg =
          typeof messages.error === "function"
            ? messages.error(err)
            : messages.error;
        dismissToast(toastId);
        error(errorMsg, options);
        throw err;
      }
    },
    [loading, dismissToast, success, error],
  );

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      success,
      error,
      info,
      warning,
      loading,
      promise: promiseFn,
    }),
    [
      toasts,
      showToast,
      dismissToast,
      success,
      error,
      info,
      warning,
      loading,
      promiseFn,
    ],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * Toast Container positioned on the bottom right with brutalist styling.
 */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm sm:max-w-md px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Individual Toast card rendered in brutalist design.
 */
function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const remainingTimeRef = useRef(toast.duration ?? 4000);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.duration === Infinity) return;

    if (!isPaused) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, remainingTimeRef.current);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, isPaused, onDismiss]);

  const config = {
    success: {
      badgeBg: "bg-brutal-lime",
      badgeText: "text-foreground",
      icon: <CheckCircle2 className="size-5 shrink-0 text-foreground" />,
      label: "Success",
      borderAccent: "border-l-[6px] border-l-[#b8ff00]",
    },
    error: {
      badgeBg: "bg-brutal-pink",
      badgeText: "text-foreground",
      icon: <AlertCircle className="size-5 shrink-0 text-foreground" />,
      label: "Error",
      borderAccent: "border-l-[6px] border-l-[#ff2d6f]",
    },
    warning: {
      badgeBg: "bg-brutal-yellow",
      badgeText: "text-foreground",
      icon: <AlertTriangle className="size-5 shrink-0 text-foreground" />,
      label: "Warning",
      borderAccent: "border-l-[6px] border-l-[#ffe600]",
    },
    info: {
      badgeBg: "bg-brutal-cyan",
      badgeText: "text-foreground",
      icon: <Info className="size-5 shrink-0 text-foreground" />,
      label: "Info",
      borderAccent: "border-l-[6px] border-l-[#00e5ff]",
    },
    loading: {
      badgeBg: "bg-brutal-yellow",
      badgeText: "text-foreground",
      icon: <Loader2 className="size-5 shrink-0 animate-spin text-foreground" />,
      label: "Pending",
      borderAccent: "border-l-[6px] border-l-[#ffe600]",
    },
  }[toast.type];

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative w-full border-[3px] border-foreground bg-card text-card-foreground p-4 brutal-shadow transition-transform animate-in fade-in slide-in-from-bottom-5 duration-200 ${config.borderAccent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">{config.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 border border-foreground ${config.badgeBg} ${config.badgeText}`}
              >
                {toast.title || config.label}
              </span>
            </div>
            <p className="text-sm font-bold text-foreground break-words">
              {toast.message}
            </p>
            {toast.description && (
              <p className="mt-1 text-xs text-muted-foreground break-words leading-relaxed">
                {toast.description}
              </p>
            )}
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="mt-2.5 inline-flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1 border-2 border-foreground bg-foreground text-background hover:bg-background hover:text-foreground transition-colors cursor-pointer"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>

        {toast.dismissible !== false && (
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="p-1 -mr-1 -mt-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
