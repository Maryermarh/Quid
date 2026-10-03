"use client";

import { useCallback, useState } from "react";
import { toast, type ToastOptions } from "@/context/ToastContext";
import { parseQuidError } from "@/lib/errorMap";

export type FormActionStatus = "idle" | "pending" | "success" | "error";

export interface ToastConfig<T = unknown> {
  pending?: string;
  success?: string | ((data: T) => string);
  error?: string | ((err: unknown) => string);
  duration?: number;
}

export interface UseFormStatusOptions<T = unknown> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  toast?: ToastConfig<T>;
}

export interface UseFormStatusReturn<T = unknown> {
  status: FormActionStatus;
  setStatus: (status: FormActionStatus) => void;
  isLoading: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isIdle: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  data: T | null;
  setData: (data: T | null) => void;
  run: (
    action: () => Promise<T>,
    runToastConfig?: ToastConfig<T>,
  ) => Promise<T | undefined>;
  reset: () => void;
  setPending: (pendingMessage?: string) => void;
  setSuccess: (successMessage?: string, data?: T) => void;
  setFailed: (errorMessage: string | unknown) => void;
}

/**
 * Hook to provide consistent pending, success, and error state management
 * across all forms and chain/API actions in Quid.
 *
 * Integrates directly with the global toast system and Stellar/Soroban errorMap.
 */
export function useFormStatus<T = unknown>(
  defaultOptions?: UseFormStatusOptions<T>,
): UseFormStatusReturn<T> {
  const [status, setStatus] = useState<FormActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const isLoading = status === "pending";
  const isPending = status === "pending";
  const isSuccess = status === "success";
  const isError = status === "error";
  const isIdle = status === "idle";

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setData(null);
  }, []);

  const setPending = useCallback((pendingMessage?: string) => {
    setStatus("pending");
    setError(null);
    if (pendingMessage) {
      toast.loading(pendingMessage);
    }
  }, []);

  const setSuccess = useCallback(
    (successMessage?: string, resultData?: T) => {
      setStatus("success");
      setError(null);
      if (resultData !== undefined) {
        setData(resultData);
      }
      if (successMessage) {
        toast.success(successMessage);
      }
    },
    [],
  );

  const setFailed = useCallback((err: string | unknown) => {
    setStatus("error");
    if (typeof err === "string") {
      setError(err);
      toast.error(err);
    } else {
      const quidErr = parseQuidError(err);
      const message =
        quidErr.title !== "Transaction failed"
          ? quidErr.title
          : err instanceof Error
            ? err.message
            : "An unexpected error occurred";
      setError(message);
      toast.error(message, { description: quidErr.description });
    }
  }, []);

  const run = useCallback(
    async (
      action: () => Promise<T>,
      runToastConfig?: ToastConfig<T>,
    ): Promise<T | undefined> => {
      setStatus("pending");
      setError(null);

      const toastConfig = runToastConfig || defaultOptions?.toast;
      let toastId: string | undefined;

      if (toastConfig?.pending) {
        toastId = toast.loading(toastConfig.pending);
      }

      try {
        const result = await action();
        setData(result);
        setStatus("success");

        if (toastId) toast.dismiss(toastId);

        if (toastConfig?.success) {
          const msg =
            typeof toastConfig.success === "function"
              ? toastConfig.success(result)
              : toastConfig.success;
          toast.success(msg, { duration: toastConfig.duration });
        }

        defaultOptions?.onSuccess?.(result);
        return result;
      } catch (err: unknown) {
        if (toastId) toast.dismiss(toastId);

        // Automatically parse contract errors and API errors
        const quidErr = parseQuidError(err);
        const rawMsg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Action failed";

        const resolvedErrorTitle =
          quidErr.title !== "Transaction failed" ? quidErr.title : rawMsg;

        setError(resolvedErrorTitle);
        setStatus("error");

        if (toastConfig?.error) {
          const msg =
            typeof toastConfig.error === "function"
              ? toastConfig.error(err)
              : toastConfig.error;
          const options: ToastOptions = {
            description: quidErr.description,
            duration: toastConfig.duration,
          };
          toast.error(msg, options);
        } else {
          toast.error(resolvedErrorTitle, {
            description: quidErr.description,
            duration: toastConfig?.duration,
          });
        }

        const normalizedError = err instanceof Error ? err : new Error(rawMsg);
        defaultOptions?.onError?.(normalizedError);
        return undefined;
      }
    },
    [defaultOptions],
  );

  return {
    status,
    setStatus,
    isLoading,
    isPending,
    isSuccess,
    isError,
    isIdle,
    error,
    setError,
    data,
    setData,
    run,
    reset,
    setPending,
    setSuccess,
    setFailed,
  };
}
