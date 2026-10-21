import { keccak256, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const DOMAIN_NAME = 'Block Builder';
export const DOMAIN_VERSION = '1';

export const RUN_TYPES = {
  Run: [
    { name: 'player', type: 'address' },
    { name: 'day', type: 'uint256' },
    { name: 'score', type: 'uint32' },
    { name: 'lines', type: 'uint16' },
    { name: 'epochs', type: 'uint8' },
    { name: 'logHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface RunPayload {
  player: `0x${string}`;
  day: bigint;
  score: number;
  lines: number;
  epochs: number;
  logHash: `0x${string}`;
  deadline: bigint;
}

export function getEip712Domain(chainId: number, verifyingContract: `0x${string}`) {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

export function hashLog(logStringOrBytes: string | Uint8Array): `0x${string}` {
  if (typeof logStringOrBytes === 'string') {
    return keccak256(toHex(logStringOrBytes));
  }
  return keccak256(logStringOrBytes);
}

export async function signRunPayload(
  payload: RunPayload,
  signerPrivateKey: Hex,
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  }
): Promise<Hex> {
  const account = privateKeyToAccount(signerPrivateKey);
  return account.signTypedData({
    domain,
    types: RUN_TYPES,
    primaryType: 'Run',
    message: payload,
  });
}
