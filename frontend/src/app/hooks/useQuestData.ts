'use client';
import { useState, useEffect } from "react";

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type QuestStatus = "active" | "completed" | "cancelled" | "draft";

export type Quest = {
  id: string;
  title: string;
  description: string;
  reward: number;
  slots: number;
  deadline: Date;
  status: QuestStatus;
};

export type Submission = {
  id: string;
  user: string;
  content: string;
  status: SubmissionStatus;
  date: Date;
};

export function useQuestData(questId: string) {
  const [quest, setQuest] = useState<Quest | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Replace with actual data fetching logic
    async function fetchQuestData() {
      setLoading(true);
      // Example: fetch quest and submissions from an API
      // const questRes = await fetch(`/api/quests/${questId}`);
      // const questData = await questRes.json();
      // setQuest(questData);
      // const submissionsRes = await fetch(`/api/quests/${questId}/submissions`);
      // const submissionsData = await submissionsRes.json();
      // setSubmissions(submissionsData);
      
      setQuest({
        id: questId,
        title: "Download and test the latest Ruze.stellar 2.0",
        description: "Test the new features of Ruze.stellar 2.0 and provide detailed feedback. Complete all test scenarios and submit your findings.",
        reward: 640,
        slots: 24,
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        status: "active",
      });
      
      setSubmissions([
        {
          id: "1",
          user: "User1",
          content: "Great product! Easy to use.",
          status: "pending",
          date: new Date(),
        },
      ]);
      setLoading(false);
    }
    fetchQuestData();
  }, [questId]);

  return { quest, submissions, loading };
}
