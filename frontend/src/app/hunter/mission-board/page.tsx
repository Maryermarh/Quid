"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BriefcaseBusiness, RefreshCw, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";

interface Mission {
  id: string;
  brand: string;
  title: string;
  category: string;
  reward: string;
  due: string;
  icon: string;
  status: "open" | "completed";
}

const mockMissions: Mission[] = [
  {
    id: "m-1",
    brand: "Ruze.stellar",
    title: "Download and test the latest Ruze.stellar 2.0",
    category: "Product Quest",
    reward: "640 XLM",
    due: "Due in 6d",
    icon: "/dashboard/brand1.svg",
    status: "open",
  },
  {
    id: "m-2",
    brand: "CatBulk",
    title: "Test our new game and leave feedback",
    category: "Gaming",
    reward: "1500 XLM",
    due: "Due in 4d",
    icon: "/dashboard/brand2.svg",
    status: "open",
  },
  {
    id: "m-3",
    brand: "Mizu",
    title: "Criticize our new feature at Mizu",
    category: "DeFi",
    reward: "730 XLM",
    due: "Due in 5d",
    icon: "/dashboard/brand3.svg",
    status: "open",
  },
  {
    id: "m-4",
    brand: "TradeBot",
    title: "Download and try the latest TradeBot",
    category: "Trading",
    reward: "3000 XLM",
    due: "Due in 2d",
    icon: "/dashboard/brand4.svg",
    status: "open",
  },
];

export default function MissionBoardPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setMissions(mockMissions);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setMissions(mockMissions);
      setLoading(false);
    }, 400);
  };

  const filteredMissions = missions.filter((m) => {
    const matchesFilter = filter === "all" || m.status === filter;
    const matchesSearch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.brand.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background brutal-grid-bg px-5 py-8 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-foreground/70">
              Hunter Portal
            </p>
            <h1 className="mt-1 text-3xl font-black uppercase tracking-tight sm:text-4xl">
              Mission Board
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Browse available quests from Stellar builders, give feedback, and earn rewards.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 brutal-border brutal-shadow bg-card px-4 py-2 text-sm font-bold uppercase tracking-wide hover:bg-muted"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(["all", "open", "completed"] as const).map((tab) => (
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
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search quests or brands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full brutal-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="mt-6">
          {loading ? (
            <SkeletonList count={4} variant="quest" />
          ) : filteredMissions.length === 0 ? (
            <EmptyState
              title={searchQuery ? "No missions match your search" : "No missions available"}
              description={
                searchQuery
                  ? `No quests found matching "${searchQuery}". Try a different search term or clear the filter.`
                  : "There are currently no missions listed in this category. Check back soon for new quests."
              }
              variant="card"
              action={
                searchQuery
                  ? {
                      label: "Clear Search",
                      onClick: () => setSearchQuery(""),
                    }
                  : {
                      label: "View All Missions",
                      onClick: () => {
                        setFilter("all");
                        setSearchQuery("");
                      },
                    }
              }
            />
          ) : (
            <div className="space-y-4">
              {filteredMissions.map((mission) => (
                <article
                  key={mission.id}
                  className="grid gap-4 brutal-border brutal-shadow bg-card p-4 transition-transform hover:translate-x-[-1px] hover:translate-y-[-1px] sm:grid-cols-[80px_1fr_auto] sm:items-center"
                >
                  <Image
                    src={mission.icon}
                    alt={mission.brand}
                    width={80}
                    height={80}
                    className="size-16 brutal-border object-cover sm:size-20"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold">{mission.title}</h2>
                    <p className="text-sm text-muted-foreground">{mission.brand}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-semibold text-foreground/80">
                        <BriefcaseBusiness className="size-3.5" />
                        {mission.category}
                      </span>
                      <span>{mission.due}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className="text-2xl font-black text-foreground">
                      {mission.reward}
                    </span>
                    <Link
                      href="/hunter"
                      className="inline-flex items-center justify-center brutal-border brutal-shadow bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-95"
                    >
                      View Details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
