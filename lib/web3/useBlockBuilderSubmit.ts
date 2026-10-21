'use client';

import { useState } from 'react';
import { usePublicClient } from 'wagmi';
import { useSmoothSendPrivyWrite, SmoothSendAvaxSubmitter } from '@smoothsend/sdk/avax';
import { BLOCK_BUILDER_ABI } from './abi';
import { useWalletAuth, Address, getAccountFactory, getFallbackPublicClient } from './useWalletAuth';
import { activeChain } from '@/lib/wagmi-config';

export type Hex = `0x${string}`;

export interface SubmitRunArgs {
  day: number | bigint;
  score: number;
  lines: number;
  epochs: number;
  logHash: Hex;
  deadline: number | bigint;
  signature: Hex;
}

export function useBlockBuilderSubmit() {
  const wagmiClient = usePublicClient({ chainId: activeChain.id });
  const effectiveClient = (wagmiClient || getFallbackPublicClient()) as any;
  const { eoaAddress, smartAccountAddress, signMessage, isConfigured, authenticated } = useWalletAuth();

  const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    '0x8e3be8a5a13a8fc89d8e04cc07447514f2bf2c40') as Address;
  const rawApiKey = process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY;
  const apiKey = rawApiKey || 'pk_nogas_dev';
  const network = (process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK as 'testnet' | 'mainnet') || 'testnet';

  const { writeContract, isPending: sdkPending } = useSmoothSendPrivyWrite({
    publicClient: effectiveClient,
    ownerAddress: (eoaAddress || '0x0000000000000000000000000000000000000000') as Address,
    signMessage: async ({ message }) => (await signMessage({ message })).signature,
    apiKey,
    network,
    smartAccountAddress: smartAccountAddress || undefined,
    accountFactory: getAccountFactory(),
  });

  const [txHash, setTxHash] = useState<string | null>(null);
  const [userOpHash, setUserOpHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalPending, setInternalPending] = useState<boolean>(false);
  const [submissionPhase, setSubmissionPhase] = useState<'idle' | 'sponsoring' | 'confirming' | 'success' | 'error'>('idle');

  const submitOnChain = async (args: SubmitRunArgs): Promise<string> => {
    setError(null);
    setTxHash(null);

    const isDemoAuthed = typeof window !== 'undefined' && localStorage.getItem('bb-demo-auth') === 'true';
    if (!authenticated && !isDemoAuthed) {
      throw new Error(`Wallet not connected. Please connect your wallet to record on ${network === 'mainnet' ? 'Avalanche C-Chain' : 'Avalanche Fuji'}.`);
    }

    setInternalPending(true);
    setSubmissionPhase('sponsoring');

    try {
      // If SmoothSend API key and Privy are configured and real wallet is connected, perform real gasless write
      if (rawApiKey && isConfigured && eoaAddress && !isDemoAuthed) {
        setSubmissionPhase('sponsoring');
        const userOpHash = await writeContract({
          address: contractAddress,
          abi: BLOCK_BUILDER_ABI,
          functionName: 'submitRun',
          args: [
            BigInt(args.day),
            args.score,
            args.lines,
            args.epochs,
            args.logHash,
            BigInt(args.deadline),
            args.signature,
          ],
          mode: 'developer-sponsored',
          waitForReceipt: false,
        });

        setUserOpHash(userOpHash);
        setSubmissionPhase('confirming');
        setInternalPending(false);

        // Resolve the real on-chain transaction hash for SnowTrace from the bundler receipt in background
        (async () => {
          try {
            // First try server-side resolver route
            const receiptResp = await fetch('/api/run/receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userOpHash,
                player: (smartAccountAddress || eoaAddress || '').toLowerCase(),
                day: Number(args.day),
              }),
            }).catch(() => null);

            if (receiptResp && receiptResp.ok) {
              const data = await receiptResp.json().catch(() => null);
              if (data?.ok && data?.txHash && data.txHash.startsWith('0x')) {
                setTxHash(data.txHash);
                setSubmissionPhase('success');
                return;
              }
            }

            // Fallback: poll client-side submitter
            const submitter = new SmoothSendAvaxSubmitter({ apiKey, network });
            const res = await submitter.waitForUserOperationReceipt(userOpHash, { timeoutMs: 25000 });
            const onChainHash = (res as any)?.receipt?.transactionHash || (res as any)?.transactionHash;
            if (onChainHash && typeof onChainHash === 'string' && onChainHash.startsWith('0x')) {
              setTxHash(onChainHash);
              setSubmissionPhase('success');

              fetch('/api/run/record-tx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  player: (smartAccountAddress || eoaAddress || '').toLowerCase(),
                  day: Number(args.day),
                  txHash: onChainHash,
                }),
              }).catch(() => {});
              return;
            }
          } catch (receiptErr) {
            console.warn('Background receipt resolution note:', receiptErr);
          }
          setSubmissionPhase('success');
        })();

        return userOpHash;
      }

      if (isDemoAuthed || !eoaAddress) {
        setSubmissionPhase('idle');
        return '';
      }

      throw new Error('SmoothSend API key or Privy configuration missing for on-chain submission.');
    } catch (err: any) {
      const message = err?.message || 'On-chain submission failed';
      setError(message);
      setSubmissionPhase('error');
      throw err;
    } finally {
      setInternalPending(false);
    }
  };

  return {
    submitOnChain,
    isPending: sdkPending || internalPending,
    status: submissionPhase,
    submissionPhase,
    txHash,
    userOpHash,
    error,
  };
}
