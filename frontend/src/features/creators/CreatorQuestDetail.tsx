import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import EmptyState from "./EmptyState";
import QuestHeader from "./QuestHeader";
import SubmissionCard from "./SubmissionCard";
import TaskInfo from "./TaskInfo";
import { Submission, Quest } from "@/app/hooks/useQuestData";
import { toast } from "@/context/ToastContext";

export default function CreatorQuestDetail({
  quest,
  submissions,
  questId,
  isActive = true,
}: {
  quest?: Quest | null;
  submissions: Submission[];
  questId?: string;
  isActive?: boolean;
}) {
  const router = useRouter();
  const [approvedSubmissions, setApprovedSubmissions] = useState<string[]>([]);
  const [rejectedSubmissions, setRejectedSubmissions] = useState<string[]>([]);
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = (submissionId: string) => {
    const isCurrentlyApproved = approvedSubmissions.includes(submissionId);
    if (isCurrentlyApproved) {
      setApprovedSubmissions((prev) => prev.filter((id) => id !== submissionId));
      toast.info("Submission approval revoked", {
        description: `Submission #${submissionId} returned to pending.`,
      });
    } else {
      setApprovedSubmissions((prev) => [...prev, submissionId]);
      setRejectedSubmissions((prev) => prev.filter((id) => id !== submissionId));
      toast.success("Submission approved! Payout initiated.", {
        description: `Reward payout queued and anti-spam stake refund unlocked for submission #${submissionId}.`,
      });
    }
  };

  const handleReject = (submissionId: string) => {
    setRejectedSubmissions((prev) => {
      if (prev.includes(submissionId)) {
        return prev.filter((id) => id !== submissionId);
      }
      return [...prev, submissionId];
    });
    setApprovedSubmissions((prev) => prev.filter((id) => id !== submissionId));
    toast.error("Submission rejected", {
      description: rejectReason
        ? `Reason: ${rejectReason}`
        : `Submission #${submissionId} marked as rejected.`,
    });
    setRejectConfirm(null);
    setRejectReason("");
  };

  const getEffectiveStatus = (sub: Submission): Submission["status"] => {
    if (rejectedSubmissions.includes(sub.id)) return "rejected";
    if (approvedSubmissions.includes(sub.id)) return "approved";
    return sub.status;
  };

  const handleEditQuest = () => {
    if (questId) {
      router.push(`/creator/quests/${questId}/edit`);
    }
  };
  const [activeTab, setActiveTab] = useState<"details" | "response">("details");
  return (
    <div className="text-foreground px-3 py-1">
      <QuestHeader />
      <div className="font-inter flex justify-between items-center w-full">
        <div className="flex flex-col justify-normal items-start gap-2 text-foreground py-6">
          <h2 className="text-2xl md:text-4xl font-bold">{quest?.title || "Quest"}</h2>
          <div className="flex gap-4 items-center text-sm md:text-base">
            <span className={`px-3 py-1 rounded-full capitalize ${quest?.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {quest?.status || "unknown"}
            </span>
          </div>
        </div>
        {isActive && (
          <button
            onClick={handleEditQuest}
            className="text-sm text-[#9110FF] pr-6 cursor-pointer hover:text-[#b844ff] transition-colors duration-200"
          >
            Edit Quest
          </button>
        )}
      </div>
      
      {/* Quest Description */}
      {quest?.description && (
        <div className="brutal-border brutal-shadow bg-card  p-4 md:p-6 mb-6">
          <h3 className="text-foreground font-semibold mb-2">Description</h3>
          <p className="text-foreground text-sm md:text-base">{quest.description}</p>
        </div>
      )}
      <div className="flex justify-normal items-start">
        <div className="w-[30%] hidden md:block">
          <p className="text-[#8C86B8] p-2">About survery</p>
          <div className=" border-t border-r border-b border-foreground">
            <div className="text-foreground flex flex-col gap-2 p-3 border-b border-b-[#241B4A] py-6">
              <p>Product link</p>
              <p className="brutal-border bg-background p-2 ">
                https://productlink.com
              </p>
            </div>
          </div>
          <div className=" border-r border-b border-foreground flex flex-col gap-2 items-start text-foreground p-2 py-6">
            <div className="flex items-center gap-2">
              <Image
                src="/quest-detail/stellar-icon.png"
                alt="Stellar"
                width={24}
                height={24}
                className="size-6"
              />
              <h2 className="text-2xl font-semibold">{quest?.reward || 640} XLM</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-3 brutal-border brutal-shadow bg-brutal-pink rounded-full" />
              <p className="text-foreground">{quest?.slots ? Math.floor(quest.reward / quest.slots) : 10} XLM per Winner</p>
            </div>
          </div>
          <div className=" border-r border-b border-foreground flex flex-col gap-2 items-start text-foreground p-2 py-6">
            <h2 className="text-2xl font-semibold">{quest?.slots || 24}</h2>
            <p className="text-foreground">Available Slots</p>
          </div>
          <div className=" border-r border-b border-foreground flex flex-col gap-2 items-start text-foreground p-2 py-6">
            <h2 className="text-2xl font-semibold">{submissions.length}</h2>
            <p className="text-foreground">Total Responses</p>
          </div>
          <div className=" border-r border-b border-foreground flex flex-col gap-2 items-start text-foreground p-2 py-6">
            <h2 className="text-xl font-semibold">{quest?.deadline ? new Date(quest.deadline).toLocaleDateString() : "N/A"}</h2>
            <p className="text-foreground">Deadline</p>
            <p className="text-foreground">Time Left</p>
          </div>
          <div className=" border-r  border-foreground flex flex-col gap-1 items-start text-foreground p-2 py-4 h-screen">
            <p className="text-foreground">Winner announcement</p>
            <p>24th January, 2026</p>
          </div>
        </div>
        {/* END OF ABOUT SURVERY SECTION  */}
        <div className="md:w-[70%] w-full">
          <div className="flex justify-normal items-center gap-6 text-foreground p-0.75 pl-2  border-b-[#241B4A] border-b">
            {["Details", "Response"].map((tab) => (
              <button
                key={tab}
                className={`border-b-2 cursor-pointer flex items-center ${
                  activeTab.toLowerCase() === tab.toLowerCase()
                    ? "border-b-[#601AFF] text-foreground"
                    : "border-transparent text-foreground"
                }`}
                onClick={() =>
                  setActiveTab(
                    tab.toLowerCase() === "details" ? "details" : "response",
                  )
                }
              >
                {tab}
                {submissions.length > 0 && tab === "Response" && (
                  <span className="brutal-border brutal-shadow bg-brutal-pink text-xs ml-2 py-1 mb-2 px-2 rounded-md ">
                    {submissions.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div>
            {activeTab === "details" ? (
              <TaskInfo />
            ) : submissions.length === 0 ? (
              <EmptyState message="No submissions yet." />
            ) : (
              submissions.map((sub) => (
                <div key={sub.id}>
                  <SubmissionCard
                    submission={{ ...sub, status: getEffectiveStatus(sub) }}
                    onApprove={() => handleApprove(sub.id)}
                    onReject={() => setRejectConfirm(sub.id)}
                    isApproved={approvedSubmissions.includes(sub.id)}
                  />
                  {rejectConfirm === sub.id && (
                    <div className="mx-4 mb-4 bg-[#1A1330] border border-red-500/30  p-4">
                      <p className="text-sm text-foreground mb-3">
                        Are you sure you want to reject this submission?
                      </p>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Optional reason for rejection…"
                        rows={2}
                        className="w-full brutal-border bg-background border border-foreground  px-3 py-2 text-foreground text-sm focus:outline-none focus:border-red-400 resize-none mb-3"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleReject(sub.id)}
                          className="bg-red-500 hover:bg-red-600 text-foreground px-4 py-2  text-sm font-medium transition-colors"
                        >
                          Confirm Reject
                        </button>
                        <button
                          onClick={() => { setRejectConfirm(null); setRejectReason(""); }}
                          className="border border-foreground hover:brutal-border bg-background text-foreground px-4 py-2  text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
