declare module 'viem' {
  export type Hex = `0x${string}`;
  export const keccak256: (data: Uint8Array | Hex) => Hex;
  export const toHex: (value: any) => Hex;
  export const encodeAbiParameters: (types: any, values: any) => Hex;
  export const parseAbiParameters: (params: string) => any;
  export const createPublicClient: (config: any) => any;
  export const createWalletClient: (config: any) => any;
  export const http: (url?: string) => any;
  export const defineChain: (chain: any) => any;
}

declare module 'viem/accounts' {
  export const privateKeyToAccount: (privateKey: any) => any;
  export const generatePrivateKey: () => any;
}

declare module 'viem/chains' {
  export const avalancheFuji: any;
  export const avalanche: any;
}
