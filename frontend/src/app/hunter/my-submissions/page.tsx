"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";

interface HunterSubmission {
  id: string;
  questTitle: string;
  brand: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  reward: string;
  feedback: string;
}

const mockSubmissions: HunterSubmission[] = [
  {
    id: "sub-1",
    questTitle: "Download and test the latest Ruze.stellar 2.0",
    brand: "Ruze.stellar",
    submittedAt: "2 hours ago",
    status: "pending",
    reward: "640 XLM",
    feedback: "Tested the onboarding transaction flow and wallet connection. Everything was responsive.",
  },
  {
    id: "sub-2",
    questTitle: "Review the project documentation and test SDK",
    brand: "TradeBot",
    submittedAt: "Yesterday",
    status: "approved",
    reward: "500 XLM",
    feedback: "Identified 2 minor typographical issues in the quickstart section and verified code samples.",
  },
];

export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState<HunterSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSubmissions(mockSubmissions);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  const getStatusBadge = (status: HunterSubmission["status"]) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 brutal-border bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 brutal-border bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400">
            <XCircle className="size-3.5" />
            Rejected
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 brutal-border bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
            <Clock className="size-3.5" />
            Under Review
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background brutal-grid-bg px-5 py-8 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-foreground/70">
            Hunter Portal
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            My Submissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Track submitted reviews, verification status, and completed rewards.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`brutal-border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-transform ${
                filter === tab
                  ? "bg-primary text-primary-foreground brutal-shadow"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "all" ? "All" : tab === "pending" ? "Pending" : tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {loading ? (
            <SkeletonList count={3} variant="submission" />
          ) : filteredSubmissions.length === 0 ? (
            <EmptyState
              title={
                filter === "all"
                  ? "No Submissions Yet"
                  : `No ${filter} Submissions`
              }
              description={
                filter === "all"
                  ? "You haven't submitted any feedback to quests yet. Browse available quests on the mission board to get started."
                  : `You have no submissions with status "${filter}".`
              }
              icon={FileText}
              variant="card"
              action={
                filter === "all"
                  ? {
                      label: "Browse Mission Board",
                      href: "/hunter/mission-board",
                    }
                  : {
                      label: "View All Submissions",
                      onClick: () => setFilter("all"),
                    }
              }
            />
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="space-y-3 brutal-border brutal-shadow bg-card p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold">{sub.questTitle}</h2>
                      <p className="text-xs text-muted-foreground">
                        {sub.brand} &bull; Submitted {sub.submittedAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-foreground">
                        {sub.reward}
                      </span>
                      {getStatusBadge(sub.status)}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-sm text-foreground/90">{sub.feedback}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
