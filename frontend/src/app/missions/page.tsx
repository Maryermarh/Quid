'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletProvider';
import WalletConnectButton from '@/components/wallet/WalletConnectButton';
import { EmptyState } from '@/components/ui/empty-state';
import { ONBOARDING_ROUTES } from '@/lib/onboarding';

export default function MissionsPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!connected) {
      router.replace(ONBOARDING_ROUTES.signUp);
    }
  }, [connected, router]);

  if (!connected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background brutal-grid-bg text-foreground">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mission Board</h1>
        <WalletConnectButton variant="primary" />
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-6 text-center">
          <p className="text-muted-foreground mb-1">Welcome, hunter</p>
          <p className="text-xs text-muted-foreground font-mono truncate max-w-sm mx-auto">{publicKey}</p>
        </div>

        <EmptyState
          title="Available Missions Coming Soon"
          description="Browse feedback bounties from Stellar founders, complete missions, and earn USDC rewards. This board will populate once new missions go live."
          variant="card"
          action={{
            label: "Explore Hunter Dashboard",
            href: "/hunter",
          }}
          secondaryAction={{
            label: "Back to Home",
            href: "/",
            variant: "outline",
          }}
        />
      </main>
    </div>
  );
}
