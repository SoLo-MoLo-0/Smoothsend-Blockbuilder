'use client';

import React, { useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { avalanche, avalancheFuji } from 'viem/chains';
import { SmoothSendAvaxProvider } from '@smoothsend/sdk/avax';
import { wagmiConfig } from '@/lib/wagmi-config';

// Dedicated React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const FUJI_ACCOUNT_FACTORY = '0x55326f005a0959F75496cdd692505fFB520972f5';
const MAINNET_ACCOUNT_FACTORY = '0x863b8E15D37Abf33d5177108f6a07D541a698D25';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const smoothSendApiKey = process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY || 'pk_nogas_dev';
  const network = (process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK as 'testnet' | 'mainnet') || 'testnet';
  const isMainnet = network === 'mainnet' || process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const activeChain = isMainnet ? avalanche : avalancheFuji;
  const accountFactory = isMainnet ? MAINNET_ACCOUNT_FACTORY : FUJI_ACCOUNT_FACTORY;

  // If NEXT_PUBLIC_PRIVY_APP_ID is not yet configured, provide Wagmi + SmoothSend tree
  if (!privyAppId) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SmoothSendAvaxProvider
            apiKey={smoothSendApiKey}
            network={network}
            accountFactory={accountFactory}
          >
            {children}
          </SmoothSendAvaxProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          showWalletUIs: false,
        },
        defaultChain: activeChain,
        supportedChains: [avalanche, avalancheFuji],
        appearance: {
          theme: 'dark',
          accentColor: '#ff5a3d',
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SmoothSendAvaxProvider
            apiKey={smoothSendApiKey}
            network={network}
            accountFactory={accountFactory}
          >
            {children}
          </SmoothSendAvaxProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
