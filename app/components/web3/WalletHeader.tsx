'use client';

import React from 'react';
import { useWalletAuth } from '@/lib/web3/useWalletAuth';

function formatAddress(addr: string | null): string {
  if (!addr || addr.length < 10) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletHeader() {
  const { isConfigured, authenticated, eoaAddress, smartAccountAddress, login, logout } = useWalletAuth();

  const isMainnet = process.env.NEXT_PUBLIC_SMOOTHSEND_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_CHAIN_ID === '43114';

  return (
    <div
      className="wallet-header"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      {/* Network Badge: Fuji testnet / Avalanche */}
      <div
        id="network-badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          border: '2px solid var(--ink)',
          padding: '2px 8px',
          minHeight: '32px',
          background: 'var(--bg)',
          fontSize: '11px',
          letterSpacing: '0.06em',
          fontWeight: 700,
          textTransform: 'uppercase',
          color: 'var(--ink)',
        }}
        title={`Network: ${isMainnet ? 'Avalanche C-Chain' : 'Avalanche Fuji Testnet (Chain 43113)'}`}
      >
        <span
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            backgroundColor: 'var(--acc)',
          }}
          aria-hidden="true"
        />
        <span>{isMainnet ? 'Avalanche' : 'Fuji'}</span>
      </div>

      {/* Gasless Badge: SmoothSend ERC-4337 */}
      <div
        id="gasless-badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          border: '2px solid var(--ink)',
          padding: '2px 8px',
          minHeight: '32px',
          background: 'var(--bg)',
          fontSize: '11px',
          letterSpacing: '0.06em',
          fontWeight: 500,
          textTransform: 'uppercase',
          color: 'var(--ink)',
        }}
        title="Gasless transactions sponsored via SmoothSend ERC-4337"
      >
        <span>Gasless</span>
      </div>
      {/* Wallet Auth Button & Profile */}
      {authenticated ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            border: '2px solid var(--ink)',
            padding: '2px 8px',
            minHeight: '32px',
            background: 'var(--bg)',
            fontSize: '11px',
            letterSpacing: '0.04em',
            color: 'var(--ink)',
          }}
        >
          <span
            title={`Smart Account: ${smartAccountAddress || 'Pending'}\nOwner: ${eoaAddress || 'N/A'}`}
            style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
          >
            {smartAccountAddress ? formatAddress(smartAccountAddress) : formatAddress(eoaAddress)}
          </span>
          <button
            type="button"
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--mute)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '11px',
              padding: '0 2px',
              textDecoration: 'underline',
            }}
            title="Disconnect wallet"
            aria-label="Disconnect wallet"
          >
            exit
          </button>
        </div>
      ) : (
        <button
          type="button"
          id="connect-wallet-btn"
          className="btn"
          style={{
            minHeight: '32px',
            padding: '0 10px',
            fontSize: '11px',
            letterSpacing: '0.04em',
            fontWeight: 500,
          }}
          onClick={login}
          title={isConfigured ? 'Sign in with Privy embedded wallet' : 'Log in (demo wallet)'}
        >
          {isConfigured ? 'Log in' : 'Log in (demo)'}
        </button>
      )}
    </div>
  );
}
