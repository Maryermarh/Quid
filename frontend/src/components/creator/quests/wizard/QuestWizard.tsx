"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import WizardStepper from "./WizardStepper";
import WizardFooter from "./WizardFooter";
import ParticipantPreviewModal from "./ParticipantPreviewModal";
import BasicsStep, { isBasicsStepValid } from "./steps/BasicsStep";
import EligibilityStep, { isEligibilityStepValid } from "./steps/EligibilityStep";
import TasksStep, { isTasksStepValid } from "./steps/TasksStep";
import RewardsStep, { isRewardsStepValid } from "./steps/RewardsStep";
import ScheduleStep, { isScheduleStepValid } from "./steps/ScheduleStep";
import ReviewStep from "./steps/ReviewStep";
import { WIZARD_STEPS, createDefaultWizardData, type QuestWizardData } from "./types";
import { toast } from "@/context/ToastContext";

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || `quest-${Date.now()}`;
}

export default function QuestWizard({
  onPublish,
}: {
  onPublish: (questId: string) => void;
}) {
  const [data, setDataState] = useState<QuestWizardData>(() => createDefaultWizardData());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setData(updater: (prev: QuestWizardData) => QuestWizardData) {
    setDataState(updater);
    setSaved(false);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSaved(true), 800);
  }

  const stepValid = [
    isBasicsStepValid(data.basics),
    isEligibilityStepValid(),
    isTasksStepValid(data.tasks),
    isRewardsStepValid(data.rewards),
    isScheduleStepValid(data.schedule),
    true,
  ][currentIndex];

  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;

  function goToStep(index: number) {
    if (index <= maxReachedIndex) setCurrentIndex(index);
  }

  function handleBack() {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function handleContinue() {
    if (!stepValid) return;

    if (isLastStep) {
      const slug = slugify(data.basics.title);
      toast.success("Quest created successfully!", {
        description: `"${data.basics.title || "Quest"}" has been published to the campaign.`,
      });
      onPublish(slug);
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setMaxReachedIndex((max) => Math.max(max, nextIndex));
  }

  function handleSaveDraft() {
    toast.info("Draft saved successfully!", {
      description: `Draft "${data.basics.title || "Untitled quest"}" has been saved.`,
    });
    // Stub until POST /missions/drafts is wired up.
    window.location.href = "/creator/quests";
  }

  return (
    <div className="flex h-full flex-col bg-background brutal-grid-bg">
      <div className="flex items-center justify-between px-6 py-4">
        <Link
          href="/creator/quests"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
          Exit creator
        </Link>
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <Check className="size-4" />
            Saved
          </span>
        ) : (
          <span className="text-sm text-foreground/30">Saving…</span>
        )}
      </div>

      <div className="px-6">
        <h1 className="mb-4 text-xl font-semibold text-foreground">
          {data.basics.title || "Create a quest"}
        </h1>
        <WizardStepper
          currentIndex={currentIndex}
          maxReachedIndex={maxReachedIndex}
          onStepClick={goToStep}
        />
      </div>

      <div className="mt-4 flex-1 overflow-y-auto border-t border-foreground/30 px-6 py-6">
        {currentIndex === 0 ? (
          <BasicsStep
            data={data.basics}
            onChange={(patch) =>
              setData((prev) => ({ ...prev, basics: { ...prev.basics, ...patch } }))
            }
          />
        ) : null}
        {currentIndex === 1 ? (
          <EligibilityStep
            data={data.eligibility}
            onChange={(patch) =>
              setData((prev) => ({
                ...prev,
                eligibility: { ...prev.eligibility, ...patch },
              }))
            }
          />
        ) : null}
        {currentIndex === 2 ? (
          <TasksStep
            tasks={data.tasks}
            onChange={(tasks) => setData((prev) => ({ ...prev, tasks }))}
          />
        ) : null}
        {currentIndex === 3 ? (
          <RewardsStep
            data={data.rewards}
            onChange={(patch) =>
              setData((prev) => ({ ...prev, rewards: { ...prev.rewards, ...patch } }))
            }
          />
        ) : null}
        {currentIndex === 4 ? (
          <ScheduleStep
            data={data.schedule}
            onChange={(patch) =>
              setData((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }))
            }
          />
        ) : null}
        {currentIndex === 5 ? <ReviewStep data={data} /> : null}
      </div>

      <WizardFooter
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        canContinue={stepValid}
        onBack={handleBack}
        onPreview={() => setShowPreview(true)}
        onSaveDraft={handleSaveDraft}
        onContinue={handleContinue}
      />

      {showPreview ? (
        <ParticipantPreviewModal data={data} onClose={() => setShowPreview(false)} />
      ) : null}
    </div>
  );
}
