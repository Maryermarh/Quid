import React from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import type { FormActionStatus } from "@/hooks/useFormStatus";

export interface FormStatusProps {
  status: FormActionStatus;
  pendingMessage?: string;
  successMessage?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * Reusable inline status banner for forms and async actions,
 * implementing Quid's brutalist visual pattern.
 */
export function FormStatus({
  status,
  pendingMessage = "Processing transaction...",
  successMessage = "Action completed successfully!",
  errorMessage,
  onRetry,
  className = "",
}: FormStatusProps) {
  if (status === "idle") return null;

  if (status === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 border-[3px] border-foreground bg-brutal-yellow/20 p-4 text-foreground brutal-shadow ${className}`}
      >
        <Loader2 className="size-5 shrink-0 animate-spin text-foreground" />
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-foreground">
            In Progress
          </p>
          <p className="text-sm font-semibold">{pendingMessage}</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 border-[3px] border-foreground bg-brutal-lime/20 p-4 text-foreground brutal-shadow ${className}`}
      >
        <CheckCircle2 className="size-5 shrink-0 text-foreground" />
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-foreground">
            Success
          </p>
          <p className="text-sm font-semibold">{successMessage}</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`flex items-start gap-3 border-[3px] border-foreground bg-brutal-pink/20 p-4 text-foreground brutal-shadow ${className}`}
      >
        <AlertCircle className="size-5 shrink-0 text-foreground mt-0.5" />
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-foreground">
            Action Failed
          </p>
          <p className="text-sm font-semibold">
            {errorMessage || "An unexpected error occurred. Please try again."}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 border-2 border-foreground bg-card px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return null;
}
