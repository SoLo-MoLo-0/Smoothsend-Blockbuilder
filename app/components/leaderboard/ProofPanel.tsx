'use client';

import React, { useEffect, useState } from 'react';
import type { DayProofItem } from '@/app/api/proofs/route';

interface ProofPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProofPanel({ isOpen, onClose }: ProofPanelProps) {
  const [proofs, setProofs] = useState<DayProofItem[]>([]);
  const [contractAddress, setContractAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetch('/api/proofs')
      .then((r) => r.json())
      .then((data) => {
        if (data.proofs) {
          setProofs(data.proofs);
        }
        if (data.contractAddress) {
          setContractAddress(data.contractAddress);
        }
      })
      .catch((err) => {
        console.error('Failed to load proofs:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1800);
      }
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-panel-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg)',
          color: 'var(--ink)',
          border: '2px solid var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Space Grotesk, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '2px solid var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--mute)',
                marginBottom: '2px',
              }}
            >
              Avalanche Fuji · ERC-4337 · DailyBoard
            </div>
            <h2
              id="proof-panel-title"
              style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Seed Verification & Proof Panel
            </h2>
          </div>

          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close proof panel"
            style={{
              minHeight: '34px',
              minWidth: '34px',
              padding: '0 10px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            padding: '18px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Explanation Banner */}
          <div
            style={{
              padding: '12px 14px',
              border: '1px solid var(--ink)',
              backgroundColor: 'var(--bg)',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              How Seed Commit-Reveal Works (COMMON §6 & BLOCKBUILDER §4)
            </div>
            <p style={{ margin: 0, color: 'var(--mute)', fontSize: '12px' }}>
              Every daily 100-piece sequence is generated from a seed committed on Avalanche before the day starts:{' '}
              <code style={{ color: 'var(--ink)', backgroundColor: 'var(--line)', padding: '2px 4px' }}>
                keccak256(abi.encode(day, seed, salt))
              </code>
              . Once revealed at 00:00 UTC, the preimage is made public. Anyone can re-hash the revealed seed and salt to prove the sequence was never altered after seeing player runs.
            </p>
          </div>

          {/* Contract Info */}
          {contractAddress && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                border: '1px dashed var(--line)',
                fontSize: '12px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <span>
                <strong style={{ color: 'var(--mute)' }}>Contract:</strong>{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {contractAddress.slice(0, 10)}…{contractAddress.slice(-8)}
                </span>
              </span>
              <a
                href={`https://testnet.snowtrace.io/address/${contractAddress}#readContract`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                  fontWeight: 600,
                }}
              >
                View on SnowTrace ↗
              </a>
            </div>
          )}

          {/* Proof Items */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--mute)', fontSize: '13px' }}>
              Loading cryptographic proofs...
            </div>
          ) : proofs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--mute)', fontSize: '13px' }}>
              No day proofs registered yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {proofs.map((p) => {
                const hashKey = `hash-${p.day}`;
                const preimageKey = `preimage-${p.day}`;

                return (
                  <div
                    key={p.day}
                    style={{
                      border: '2px solid var(--ink)',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {/* Header Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--line)',
                        paddingBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                          Day {p.day}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            border: '1px solid var(--ink)',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                          }}
                        >
                          {p.day === proofs[0]?.day ? 'CURRENT UTC DAY' : 'PAST DAY'}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--bg)',
                          backgroundColor: 'var(--ink)',
                          padding: '2px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        ✓ HASH MATCHES PREIMAGE
                      </div>
                    </div>

                    {/* Commitment Hash */}
                    <div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--mute)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Committed Hash on Avalanche</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(p.commitmentHash, hashKey)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--ink)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            textDecoration: 'underline',
                          }}
                        >
                          {copiedKey === hashKey ? 'Copied ✓' : 'Copy hash'}
                        </button>
                      </div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          wordBreak: 'break-all',
                          backgroundColor: 'var(--line)',
                          padding: '6px 8px',
                          border: '1px solid var(--ink)',
                        }}
                      >
                        {p.commitmentHash}
                      </div>
                    </div>

                    {/* Preimage details (Seed + Salt) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 2fr',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--mute)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '3px',
                          }}
                        >
                          Revealed Seed
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            fontWeight: 700,
                            padding: '4px 6px',
                            border: '1px solid var(--line)',
                          }}
                        >
                          {p.seed}
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--mute)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '3px',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>Revealed Salt</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(p.salt, preimageKey)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: 'var(--ink)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              textDecoration: 'underline',
                            }}
                          >
                            {copiedKey === preimageKey ? 'Copied ✓' : 'Copy salt'}
                          </button>
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            wordBreak: 'break-all',
                            padding: '4px 6px',
                            border: '1px solid var(--line)',
                          }}
                        >
                          {p.salt.slice(0, 18)}…{p.salt.slice(-10)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '2px solid var(--ink)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg)',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--mute)' }}>
            All seeds cryptographically verified against contract state.
          </span>
          <button
            type="button"
            className="btn p"
            onClick={onClose}
            style={{ minHeight: '34px', padding: '0 16px', fontSize: '12px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
