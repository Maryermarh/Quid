'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export interface ReputationProfile {
  address: string;
  reputationScore: number;
  totalAttestations: number;
  verifiedStatus: boolean;
  attestations: Array<{
    id: string;
    issuer: string;
    topic: string;
    timestamp: string;
  }>;
}

function getMockProfile(address: string): ReputationProfile {
  return {
    address,
    reputationScore: 920,
    totalAttestations: 12,
    verifiedStatus: true,
    attestations: [
      { id: 'att_01', issuer: 'GADMIN...9921', topic: 'Mission Execution Quality', timestamp: '2026-03-20' },
      { id: 'att_02', issuer: 'GORACLE..4011', topic: 'On-Chain Verifiable Payout', timestamp: '2026-03-15' },
      { id: 'att_03', issuer: 'GREGISTRY.1102', topic: 'KYC & Wallet Ownership', timestamp: '2026-02-28' },
    ],
  };
}

export default function PassportProfilePage() {
  const params = useParams();
  const addressParam = (params?.address as string) || 'GA...UNKNOWN';
  const profile = getMockProfile(addressParam);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 text-sm text-slate-400 mb-2">
          <Link href="/leaderboard" className="hover:text-emerald-400">← Back to Leaderboard</Link>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex justify-between items-center">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">On-Chain Reputation Passport</span>
              <h1 className="text-2xl font-mono font-bold text-emerald-400 mt-1">{profile.address}</h1>
              <p className="text-sm text-slate-400 mt-1">Verified Status: <span className="text-emerald-400 font-semibold">Active Attested</span></p>
            </div>
            <div className="text-right bg-slate-950 px-6 py-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Score</span>
              <div className="text-4xl font-extrabold text-emerald-400">{profile.reputationScore}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-slate-200 mb-4">On-Chain Attestations ({profile.totalAttestations})</h2>
            <div className="space-y-3">
              {profile.attestations.map((att) => (
                <div key={att.id} className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-slate-200">{att.topic}</h3>
                    <p className="text-xs font-mono text-slate-500 mt-1">Issuer: {att.issuer}</p>
                  </div>
                  <span className="text-xs text-slate-400">{att.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
