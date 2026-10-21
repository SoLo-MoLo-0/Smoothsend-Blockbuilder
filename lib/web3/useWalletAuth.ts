'use client';

import { useEffect, useState, useMemo } from 'react';
import { usePrivy, useSignMessage } from '@privy-io/react-auth';
import { usePublicClient } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { predictSimpleAccountAddress } from '@smoothsend/sdk/avax';
import { activeChain } from '@/lib/wagmi-config';

export type Address = `0x${string}`;

export const FUJI_ACCOUNT_FACTORY = '0x55326f005a0959F75496cdd692505fFB520972f5' as Address;
export const MAINNET_ACCOUNT_FACTORY = '0x863b8E15D37Abf33d5177108f6a07D541a698D25' as Address;

export function getAccountFactory(): Address {
  const isMainnet =
    process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' ||
    process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  return isMainnet ? MAINNET_ACCOUNT_FACTORY : FUJI_ACCOUNT_FACTORY;
}

export function getFallbackPublicClient(): any {
  const isMainnet =
    process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' ||
    process.env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const rpc =
    process.env.RPC_URL ||
    (isMainnet
      ? 'https://api.avax.network/ext/bc/C/rpc'
      : 'https://api.avax-test.network/ext/bc/C/rpc');

  return createPublicClient({
    chain: activeChain,
    transport: http(rpc),
  });
}

const scwCache = new Map<string, Address>();

export async function resolveSmartAccountAddress(owner: Address, client?: any): Promise<Address> {
  const isConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  if (!isConfigured) {
    return '0x88f20000000000000000000000000000000012c4' as Address;
  }
  const lower = owner.toLowerCase() as Address;
  if (scwCache.has(lower)) {
    return scwCache.get(lower)!;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`bb_scw_${lower}`);
      if (stored && stored.startsWith('0x')) {
        const addr = stored.toLowerCase() as Address;
        scwCache.set(lower, addr);
        return addr;
      }
    } catch {}
  }

  const effectiveClient = client || getFallbackPublicClient();
  const factory = getAccountFactory();
  const scw = await predictSimpleAccountAddress({
    publicClient: effectiveClient,
    factory,
    owner,
    salt: 0n,
  });
  const resolved = scw.toLowerCase() as Address;
  scwCache.set(lower, resolved);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`bb_scw_${lower}`, resolved);
    } catch {}
  }
  return resolved;
}

export interface WalletAuthValue {
  isConfigured: boolean;
  ready: boolean;
  authenticated: boolean;
  eoaAddress: Address | null;
  smartAccountAddress: Address | null;
  login: () => void;
  logout: () => void;
  signMessage: ({ message }: { message: string }) => Promise<{ signature: string }>;
}

/**
 * Hook providing Privy auth + counterfactual ERC-4337 Smart Account address on Avalanche Fuji
 */
export function useWalletAuth(): WalletAuthValue {
  const isConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const wagmiClient = usePublicClient({ chainId: activeChain.id });
  const [demoAuth, setDemoAuth] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('bb-demo-auth') === 'true';
      } catch {}
    }
    return false;
  });

  useEffect(() => {
    const handleAuthChange = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setDemoAuth(custom.detail);
    };
    window.addEventListener('bb-demo-auth-change', handleAuthChange);
    return () => window.removeEventListener('bb-demo-auth-change', handleAuthChange);
  }, []);

  // If Privy is not configured, provide functional demo auth for local development
  if (!isConfigured) {
    const demoEoa = '0xa2f10000000000000000000000000000000044d8' as Address;
    const demoScw = '0x88f20000000000000000000000000000000012c4' as Address;

    return {
      isConfigured: false,
      ready: true,
      authenticated: demoAuth,
      eoaAddress: demoAuth ? demoEoa : null,
      smartAccountAddress: demoAuth ? demoScw : null,
      login: () => {
        try {
          localStorage.setItem('bb-demo-auth', 'true');
        } catch {}
        setDemoAuth(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bb-demo-auth-change', { detail: true }));
        }
      },
      logout: () => {
        try {
          localStorage.removeItem('bb-demo-auth');
        } catch {}
        setDemoAuth(false);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bb-demo-auth-change', { detail: false }));
        }
      },
      signMessage: async () => ({ signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00' }),
    };
  }

  const effectiveClient = wagmiClient || getFallbackPublicClient();
  const privyAuth = usePrivyWalletAuth(effectiveClient);

  if (demoAuth && !privyAuth.authenticated) {
    const demoEoa = '0xa2f10000000000000000000000000000000044d8' as Address;
    const demoScw = '0x88f20000000000000000000000000000000012c4' as Address;
    return {
      ...privyAuth,
      ready: true,
      authenticated: true,
      eoaAddress: demoEoa,
      smartAccountAddress: demoScw,
      signMessage: async () => ({
        signature:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00',
      }),
    };
  }

  return privyAuth;
}

function usePrivyWalletAuth(publicClient: any): WalletAuthValue {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { signMessage } = useSignMessage();
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('bb_last_scw');
        if (stored && stored.startsWith('0x')) return stored.toLowerCase() as Address;
      } catch {}
    }
    return null;
  });

  const eoaAddress = useMemo(() => {
    const raw = user?.wallet?.address;
    return raw && raw.startsWith('0x') ? (raw.toLowerCase() as Address) : null;
  }, [user?.wallet?.address]);

  useEffect(() => {
    let active = true;
    if (!eoaAddress) {
      setSmartAccountAddress(null);
      return;
    }

    // Check cached SCW for this EOA immediately
    try {
      const cached = localStorage.getItem(`bb_scw_${eoaAddress.toLowerCase()}`);
      if (cached && cached.startsWith('0x')) {
        setSmartAccountAddress(cached.toLowerCase() as Address);
      }
    } catch {}

    const client = publicClient || getFallbackPublicClient();

    // Predict counterfactual SimpleAccount address on the active chain
    predictSimpleAccountAddress({
      publicClient: client,
      factory: getAccountFactory(),
      owner: eoaAddress,
      salt: 0n,
    })
      .then((scw) => {
        if (active && scw) {
          const lower = scw.toLowerCase() as Address;
          setSmartAccountAddress(lower);
          try {
            localStorage.setItem(`bb_scw_${eoaAddress.toLowerCase()}`, lower);
            localStorage.setItem('bb_last_scw', lower);
          } catch {}
        }
      })
      .catch((err) => {
        console.warn('Could not derive SCW address:', err);
        // Fallback to EOA if derivation fails
        if (active) setSmartAccountAddress(eoaAddress);
      });

    return () => {
      active = false;
    };
  }, [eoaAddress, publicClient]);

  return {
    isConfigured: true,
    ready,
    authenticated,
    eoaAddress,
    smartAccountAddress,
    login,
    logout,
    signMessage: async ({ message }: { message: string }) => {
      const res = await (signMessage as any)({ message }, { uiOptions: { showWalletUIs: false } });
      return { signature: res.signature };
    },
  };
}
