import React from "react";
import { EmptyState as SharedEmptyState, type EmptyStateProps } from "@/components/ui/empty-state";

export const EmptyState = (props: { message?: string } & Partial<EmptyStateProps>) => {
  return <SharedEmptyState {...props} />;
};

export default EmptyState;
