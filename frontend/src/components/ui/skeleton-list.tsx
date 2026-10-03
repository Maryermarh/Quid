import * as React from "react";
import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-none bg-white/10",
        className
      )}
      {...props}
    />
  );
}

export type SkeletonListVariant =
  | "quest"
  | "submission"
  | "card"
  | "row"
  | "table";

export interface SkeletonListProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number;
  variant?: SkeletonListVariant;
}

function QuestRowSkeleton() {
  return (
    <div className="grid gap-4 p-4 border border-white/5 bg-card/20 sm:grid-cols-[80px_1fr_auto] sm:items-center">
      <Skeleton className="size-16 sm:size-20" />
      <div className="min-w-0 space-y-2.5">
        <Skeleton className="h-6 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-1/3 max-w-xs" />
        <div className="flex flex-wrap gap-2 pt-1">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  );
}

function SubmissionCardSkeleton() {
  return (
    <div className="space-y-4 p-5 border-[2px] border-foreground/30 bg-card brutal-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col justify-between p-6 border-[3px] border-foreground bg-card brutal-shadow">
      <div>
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="size-12" />
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

function DefaultRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 p-4 border-b border-white/10">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton className="size-10 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-8 w-20 shrink-0" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4 p-3 border-b border-white/5 items-center">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3 justify-self-end" />
    </div>
  );
}

export function SkeletonList({
  count = 3,
  variant = "row",
  className,
  ...props
}: SkeletonListProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  const renderItem = (key: number) => {
    switch (variant) {
      case "quest":
        return <QuestRowSkeleton key={key} />;
      case "submission":
        return <SubmissionCardSkeleton key={key} />;
      case "card":
        return <CardSkeleton key={key} />;
      case "table":
        return <TableRowSkeleton key={key} />;
      case "row":
      default:
        return <DefaultRowSkeleton key={key} />;
    }
  };

  const containerClasses = {
    quest: "space-y-4",
    submission: "space-y-4",
    card: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
    table: "divide-y divide-white/5",
    row: "space-y-2",
  };

  return (
    <div
      role="status"
      aria-label="Loading..."
      className={cn(containerClasses[variant], className)}
      {...props}
    >
      {items.map((i) => renderItem(i))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

export default SkeletonList;
