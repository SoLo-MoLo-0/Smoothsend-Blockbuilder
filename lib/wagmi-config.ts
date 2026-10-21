import { http, createConfig } from 'wagmi';
import { avalanche, avalancheFuji } from 'viem/chains';

const isMainnet =
  process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' ||
  process.env.NEXT_PUBLIC_CHAIN_ID === '43114';

export const activeChain = isMainnet ? avalanche : avalancheFuji;
export const fallbackChain = isMainnet ? avalancheFuji : avalanche;

export const wagmiConfig = createConfig({
  chains: [activeChain, fallbackChain],
  transports: {
    [avalanche.id]: http(
      process.env.NEXT_PUBLIC_CHAIN_ID === '43114' && process.env.RPC_URL
        ? process.env.RPC_URL
        : 'https://api.avax.network/ext/bc/C/rpc'
    ),
    [avalancheFuji.id]: http(
      process.env.NEXT_PUBLIC_CHAIN_ID === '43113' && process.env.RPC_URL
        ? process.env.RPC_URL
        : 'https://api.avax-test.network/ext/bc/C/rpc'
    ),
  },
  ssr: true,
});
