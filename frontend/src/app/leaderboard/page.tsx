'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  reputationScore: number;
  completedMissions: number;
  totalEarningsUsdc: number;
  badge: string;
}

const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: 'GBX...9K2L', reputationScore: 980, completedMissions: 42, totalEarningsUsdc: 2500, badge: 'Grandmaster' },
  { rank: 2, address: 'GCD...4M8P', reputationScore: 915, completedMissions: 36, totalEarningsUsdc: 1950, badge: 'Master Hunter' },
  { rank: 3, address: 'GAT...1X9Q', reputationScore: 870, completedMissions: 29, totalEarningsUsdc: 1400, badge: 'Veteran' },
  { rank: 4, address: 'GCK...7P3N', reputationScore: 820, completedMissions: 24, totalEarningsUsdc: 1100, badge: 'Scout' },
  { rank: 5, address: 'GAW...3R6K', reputationScore: 760, completedMissions: 18, totalEarningsUsdc: 850, badge: 'Explorer' },
];

export default function LeaderboardPage() {
  const [leaderboard] = useState<LeaderboardEntry[]>(DEFAULT_LEADERBOARD);
  const [season] = useState<string>('Season 1');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400">Hunter Leaderboard</h1>
            <p className="text-slate-400 text-sm mt-1">Top-N scores on-chain from quid-leaderboard</p>
          </div>
          <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 text-sm font-medium">
            Active: <span className="text-emerald-400 font-bold">{season}</span>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-4 px-6">Rank</th>
                <th className="py-4 px-6">Hunter Address</th>
                <th className="py-4 px-6">Badge</th>
                <th className="py-4 px-6 text-right">Reputation Score</th>
                <th className="py-4 px-6 text-right">Missions</th>
                <th className="py-4 px-6 text-right">Earnings (USDC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {leaderboard.map((item) => (
                <tr key={item.rank} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-300">
                    {item.rank === 1 ? '🥇 #1' : item.rank === 2 ? '🥈 #2' : item.rank === 3 ? '🥉 #3' : `#${item.rank}`}
                  </td>
                  <td className="py-4 px-6 font-mono text-emerald-300">
                    <Link href={`/passport/${item.address}`} className="hover:underline">
                      {item.address}
                    </Link>
                  </td>
                  <td className="py-4 px-6">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {item.badge}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-slate-200">{item.reputationScore}</td>
                  <td className="py-4 px-6 text-right text-slate-300">{item.completedMissions}</td>
                  <td className="py-4 px-6 text-right text-emerald-400 font-semibold">${item.totalEarningsUsdc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
