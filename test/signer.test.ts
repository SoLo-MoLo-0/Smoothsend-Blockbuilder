import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { getEip712Domain, hashLog, signRunPayload, RunPayload } from '../lib/signer';

describe('lib/signer EIP-712', () => {
  const TEST_SIGNER_KEY = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d' as const;
  const signerAccount = privateKeyToAccount(TEST_SIGNER_KEY);

  it('produces valid signature with expected fields', async () => {
    const domain = getEip712Domain(43113, '0x1111111111111111111111111111111111111111');
    const logHash = hashLog('tick 0: L, tick 10: HARD');

    const payload: RunPayload = {
      player: '0x2222222222222222222222222222222222222222',
      day: 1n,
      score: 48200,
      lines: 38,
      epochs: 3,
      logHash,
      deadline: 1800000000n,
    };

    const signature = await signRunPayload(payload, TEST_SIGNER_KEY, domain);
    expect(signature).toBeDefined();
    expect(signature.startsWith('0x')).toBe(true);
    expect(signature.length).toBe(132); // 65 bytes = 130 hex chars + 0x
  });
});
