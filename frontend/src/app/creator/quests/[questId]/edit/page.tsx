'use client'
import { use } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuestData } from "@/app/hooks/useQuestData";
import { creatorApiFetch } from "@/lib/creator-api";
import { useWallet } from "@/context/WalletProvider";
import { useFormStatus } from "@/hooks/useFormStatus";
import { FormStatus } from "@/components/ui/FormStatus";
import { Button } from "@/components/ui/button";

export default function EditQuestPage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = use(params);
  const router = useRouter();
  const { quest } = useQuestData(questId);
  const { publicKey } = useWallet();

  const [formData, setFormData] = useState({
    title: quest?.title || "",
    description: quest?.description || "",
    reward: quest?.reward || "",
    deadline: quest?.deadline instanceof Date ? quest.deadline.toISOString().slice(0, 16) : (quest?.deadline as string | undefined) || "",
  });

  const { status, error, isLoading, run, reset } = useFormStatus();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await run(
      async () => {
        const dto = {
          title: formData.title,
          description: formData.description,
          reward: formData.reward ? Number(formData.reward) : undefined,
          deadline: formData.deadline || undefined,
        };

        if (publicKey) {
          const response = await creatorApiFetch(
            "/missions/drafts",
            publicKey,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(dto),
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to save draft (${response.status})`);
          }
        }

        setTimeout(() => router.push(`/creator/quests/${questId}`), 800);
      },
      {
        pending: "Saving quest changes...",
        success: "Quest draft saved successfully!",
        error: (err) => (err instanceof Error ? err.message : "Failed to save changes"),
      },
    );
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-[#0f0a1a] text-foreground p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Edit Quest</h1>
          <p className="text-foreground">Quest ID: {questId}</p>
        </div>

        {/* Form Status pattern banner */}
        <div className="mb-6">
          <FormStatus
            status={status}
            pendingMessage="Saving quest draft..."
            successMessage="Quest draft saved successfully! Redirecting..."
            errorMessage={error}
            onRetry={reset}
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="brutal-border brutal-shadow bg-card p-6 md:p-8 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2">Quest Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full brutal-border bg-background border border-foreground px-4 py-2 text-foreground focus:outline-none focus:border-[#9011FF]"
              placeholder="Enter quest title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={5}
              className="w-full brutal-border bg-background border border-foreground px-4 py-2 text-foreground focus:outline-none focus:border-[#9011FF] resize-none"
              placeholder="Enter quest description"
            />
          </div>

          {/* Reward */}
          <div>
            <label className="block text-sm font-medium mb-2">Reward (XLM)</label>
            <input
              type="number"
              name="reward"
              value={formData.reward}
              onChange={handleChange}
              className="w-full brutal-border bg-background border border-foreground px-4 py-2 text-foreground focus:outline-none focus:border-[#9011FF]"
              placeholder="Enter reward amount"
            />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium mb-2">Deadline</label>
            <input
              type="datetime-local"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
              className="w-full brutal-border bg-background border border-foreground px-4 py-2 text-foreground focus:outline-none focus:border-[#9011FF]"
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col md:flex-row gap-4 pt-6">
            <Button
              type="submit"
              variant="destructive"
              loading={isLoading}
              loadingText="Saving Changes..."
              className="flex-1 py-3 text-base h-auto"
            >
              Save Changes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="flex-1 py-3 text-base h-auto"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
