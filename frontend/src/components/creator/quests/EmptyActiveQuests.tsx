import { EmptyState } from "@/components/ui/empty-state";
import { Plus } from "lucide-react";

export default function EmptyActiveQuests() {
  return (
    <EmptyState
      title="No Active Quests"
      description="You have no active quests at the moment. Click below to create a quest."
      action={{
        label: "Add New Quest",
        href: "/creator/quests/new",
        icon: Plus,
      }}
    />
  );
}
