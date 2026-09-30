import React from "react";
import { FileText, Plus } from "lucide-react";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";

export interface DashboardEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<DashboardEmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}) => {
  return (
    <SharedEmptyState
      title={title}
      description={description}
      icon={icon}
      variant="card"
      action={
        actionLabel && onAction
          ? {
              label: actionLabel,
              onClick: onAction,
              icon: Plus,
            }
          : undefined
      }
    />
  );
};

// Specific empty states
export const NoQuestsEmptyState: React.FC<{ onCreateQuest: () => void }> = ({
  onCreateQuest,
}) => {
  return (
    <EmptyState
      title="No Active Quests"
      description="You haven't created any quests yet. Create your first quest to start receiving responses from participants."
      actionLabel="Create Your First Quest"
      onAction={onCreateQuest}
      icon={<FileText className="size-8 text-purple-400" />}
    />
  );
};

export const NoResponsesEmptyState: React.FC = () => {
  return (
    <EmptyState
      title="No Responses Yet"
      description="You don't have any responses yet. Participants will appear here once they start submitting responses to your quests."
      icon={<FileText className="size-8 text-blue-400" />}
    />
  );
};

export default EmptyState;