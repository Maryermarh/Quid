"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, FileText, RefreshCw } from "lucide-react";
import { useWallet } from "@/context/WalletProvider";
import {
  ApiSessionExpiredError,
  apiFetch,
} from "@/lib/api/client";
import { PendingBadge } from "@/components/ui/PendingBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";

/** Issue #327: mirrors the backend Submission + mission include. */
interface MySubmission {
  id: string;
  missionId: string;
  hunterAddress: string;
  ipfsCid: string;
  textPayload: string | null;
  sentiment: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  rejectionReason: string | null;
  createdAt: string;
  mission: {
    id: string;
    title: string;
    status: string;
    rewardToken: string;
    rewardAmount: string;
  };
}

type LoadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; submissions: MySubmission[] }
  | { phase: "error"; message: string }
  | { phase: "session-expired" };

function StatusBadge({
  status,
  reason,
}: {
  status: MySubmission["status"];
  reason: string | null;
}) {
  switch (status) {
    case "PENDING":
      return (
        <span className="flex items-center gap-2">
          <PendingBadge />
          <span className="text-xs text-muted-foreground">Review in progress</span>
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
          Approved
        </span>
      );
    case "REJECTED":
      return (
        <span
          className="inline-flex items-center rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-300"
          title={reason ?? undefined}
        >
          Rejected
        </span>
      );
    case "PAID":
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
          Paid
        </span>
      );
  }
}

export default function MySubmissionsPage() {
  const { connected, publicKey, authenticate } = useWallet();
  const [state, setState] = useState<LoadState>({ phase: "idle" });

  const load = useCallback(async () => {
    if (!publicKey) return;

    setState({ phase: "loading" });
    try {
      const response = await apiFetch("/hunter/my-submissions", {
        address: publicKey,
      });
      if (!response.ok) {
        throw new Error(`Unable to load submissions (${response.status})`);
      }
      const submissions = (await response.json()) as MySubmission[];
      setState({ phase: "ready", submissions });
    } catch (error) {
      if (error instanceof ApiSessionExpiredError) {
        setState({ phase: "session-expired" });
        return;
      }
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "Unable to load submissions",
      });
    }
  }, [publicKey]);

  useEffect(() => {
    // Deferred so the fetch-driven setState does not cascade from the effect.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleConnectSession = async () => {
    try {
      await authenticate();
      await load();
    } catch (error) {
      setState({
        phase: "error",
        message:
          error instanceof Error
            ? error.message
            : "Authentication failed. Try again.",
      });
    }
  };

  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen bg-background brutal-grid-bg px-6 py-10 text-foreground">
        <p className="text-sm uppercase tracking-[0.24em] text-foreground">Hunter</p>
        <h1 className="mt-3 text-3xl font-semibold">My Submissions</h1>
        <p className="mt-6 text-muted-foreground">
          Connect your wallet to see your submission history.
        </p>
      </div>
    );
  }

  if (state.phase === "session-expired") {
    return (
      <div className="min-h-screen bg-background brutal-grid-bg px-6 py-10 text-foreground">
        <p className="text-sm uppercase tracking-[0.24em] text-foreground">Hunter</p>
        <h1 className="mt-3 text-3xl font-semibold">My Submissions</h1>
        <p className="mt-6 max-w-xl text-muted-foreground">
          Your API session expired. Re-authenticate with your wallet to refresh
          your submissions.
        </p>
        <button
          type="button"
          onClick={handleConnectSession}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[linear-gradient(135deg,#9011FF_0%,#B78CFF_100%)] px-4 py-2 text-sm font-semibold text-foreground shadow-md transition-transform hover:opacity-95 active:scale-[0.98]"
        >
          Sign in again
        </button>
      </div>
    );
  }

  const submissions =
    state.phase === "ready" ? state.submissions : [];

  return (
    <div className="min-h-screen bg-background brutal-grid-bg px-6 py-10 text-foreground">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-foreground">Hunter</p>
          <h1 className="mt-3 text-3xl font-semibold">My Submissions</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Track your submitted missions and their review state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.phase === "loading"}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/[0.03] disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${state.phase === "loading" ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {state.phase === "loading" ? (
        <SkeletonList count={3} variant="submission" />
      ) : state.phase === "error" ? (
        <div className="mt-10">
          <p className="text-muted-foreground">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 text-sm font-semibold text-foreground underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : submissions.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="When you submit feedback on a mission, it will show up here with its review status."
          icon={FileText}
          variant="card"
          action={{
            label: "Browse Mission Board",
            href: "/hunter/mission-board",
          }}
        />
      ) : (
        <ul className="mt-8 divide-y divide-foreground/20">
          {submissions.map((submission) => (
            <li key={submission.id} className="py-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <Link
                    href="/hunter/mission-board"
                    className="line-clamp-1 text-lg font-semibold hover:underline"
                  >
                    {submission.mission.title || "Mission"}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-4" />
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </span>
                    {submission.textPayload ? (
                      <span className="line-clamp-1">{submission.textPayload}</span>
                    ) : null}
                  </div>
                  {submission.status === "REJECTED" && submission.rejectionReason ? (
                    <p className="mt-2 text-sm text-red-300">
                      Reason: {submission.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-6 sm:flex-col sm:items-end sm:gap-2">
                  <span className="text-lg font-bold">
                    {submission.mission.rewardAmount}{" "}
                    {submission.mission.rewardToken}
                  </span>
                  <StatusBadge
                    status={submission.status}
                    reason={submission.rejectionReason}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
