import React from "react";
import { Skeleton } from "@/components/ui/skeleton-list";

export const StatsOverviewSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-card p-6 border-[2px] border-foreground/30 brutal-shadow"
        >
          <div className="flex items-center space-x-4">
            <Skeleton className="w-12 h-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const QuestCardSkeleton: React.FC = () => {
  return (
    <div className="bg-card p-6 border-[2px] border-foreground/30 brutal-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          <Skeleton className="w-14 h-14 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <div className="flex gap-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
};

export const ResponsePreviewSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-between p-3">
      <div className="flex items-center space-x-3 flex-1">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Skeleton className="h-10 w-48" />
      </div>

      <StatsOverviewSkeleton />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <QuestCardSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="bg-card/40 p-4 border-[2px] border-foreground/30 brutal-shadow">
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <ResponsePreviewSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;