import * as fs from 'fs';
import * as path from 'path';
import { createWalletClient, createPublicClient, http, defineChain, Hex, encodeAbiParameters, parseAbiParameters, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Avalanche Fuji Testnet definition
export const avalancheFuji = defineChain({
  id: 43113,
  name: 'Avalanche Fuji',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'SnowTrace', url: 'https://testnet.snowtrace.io' },
  },
  testnet: true,
});

// Avalanche C-Chain Mainnet definition
export const avalancheMainnet = defineChain({
  id: 43114,
  name: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || 'https://api.avax.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'SnowTrace', url: 'https://snowtrace.io' },
  },
  testnet: false,
});

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

async function main() {
  const env = loadEnvFile();
  const deployerKey = (process.env.DEPLOYER_KEY || env.DEPLOYER_KEY) as Hex | undefined;
  const signerKey = (process.env.SIGNER_KEY || env.SIGNER_KEY) as Hex | undefined;
  const isMainnet = process.argv.includes('--mainnet') || process.env.NEXT_PUBLIC_CHAIN_ID === '43114' || env.NEXT_PUBLIC_CHAIN_ID === '43114';
  const targetChain = isMainnet ? avalancheMainnet : avalancheFuji;
  const defaultRpc = isMainnet ? 'https://api.avax.network/ext/bc/C/rpc' : 'https://api.avax-test.network/ext/bc/C/rpc';
  const rpcUrl = process.env.RPC_URL || env.RPC_URL || defaultRpc;

  if (!deployerKey || !deployerKey.startsWith('0x')) {
    console.error('ERROR: DEPLOYER_KEY is missing or invalid in .env (must be 0x-prefixed private key).');
    console.error('Please configure DEPLOYER_KEY in your .env file.');
    process.exit(1);
  }

  const deployerAccount = privateKeyToAccount(deployerKey);
  const signerAccount = signerKey && signerKey.startsWith('0x')
    ? privateKeyToAccount(signerKey)
    : deployerAccount;

  const publicClient = createPublicClient({
    chain: targetChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: targetChain,
    transport: http(rpcUrl),
  });

  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`=== Deploying BlockBuilder to ${targetChain.name} (${targetChain.id}) ===`);
  console.log(`Deployer Address : ${deployerAccount.address}`);
  console.log(`Deployer Balance : ${Number(balance) / 1e18} AVAX`);
  console.log(`Signer Address   : ${signerAccount.address}`);

  if (balance === 0n) {
    if (isMainnet) {
      console.error(`ERROR: Deployer balance is 0 AVAX on Avalanche Mainnet.`);
      console.error(`Please fund your deployer address ${deployerAccount.address} with real AVAX.`);
    } else {
      console.error('ERROR: Deployer balance is 0 AVAX. Please fund your address at:');
      console.error('https://core.app/tools/testnet-faucet/?subnet=c&token=c');
    }
    process.exit(1);
  }

  const artifactPath = path.resolve(process.cwd(), 'out/BlockBuilder.sol/BlockBuilder.json');
  if (!fs.existsSync(artifactPath)) {
    console.error(`ERROR: Contract artifact not found at ${artifactPath}. Run "forge build" first.`);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode.object as Hex;

  const blockNumber = await publicClient.getBlockNumber();
  const block = await publicClient.getBlock({ blockNumber });
  const launchDay = BigInt(Math.floor(Number(block.timestamp) / 86400));

  console.log(`Launch Day Index : ${launchDay}`);
  console.log(`Broadcasting deployment transaction...`);

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [deployerAccount.address, signerAccount.address, launchDay],
  });

  const explorerUrl = targetChain.blockExplorers.default.url;
  console.log(`Tx submitted: ${explorerUrl}/tx/${hash}`);
  console.log(`Waiting for confirmation...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    throw new Error('Deployment failed: No contract address in receipt');
  }

  console.log(`\n======================================================`);
  console.log(`BlockBuilder deployed successfully!`);
  console.log(`Network          : ${targetChain.name} (${targetChain.id})`);
  console.log(`Contract Address : ${contractAddress}`);
  console.log(`Explorer Link    : ${explorerUrl}/address/${contractAddress}`);
  console.log(`======================================================\n`);

  // Initial commits for day 1..3
  try {
    const commit1 = keccak256(encodeAbiParameters(parseAbiParameters('uint256, uint256, bytes32'), [1n, 20261010n, keccak256(toHex('salt_1'))]));
    const commit2 = keccak256(encodeAbiParameters(parseAbiParameters('uint256, uint256, bytes32'), [2n, 20261011n, keccak256(toHex('salt_2'))]));
    const commit3 = keccak256(encodeAbiParameters(parseAbiParameters('uint256, uint256, bytes32'), [3n, 20261012n, keccak256(toHex('salt_3'))]));

    console.log('Committing initial days 2..4...');
    const commitTx = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName: 'commitDays',
      args: [2n, [commit1, commit2, commit3]],
    });
    await publicClient.waitForTransactionReceipt({ hash: commitTx });
    console.log(`Committed days 2..4 in tx: ${commitTx}`);
  } catch (err: any) {
    console.log('Note: Seed commit notice:', err?.message || err);
  }

  // Update .env file
  const envPath = path.resolve(process.cwd(), '.env');
  let currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  if (currentEnv.includes('NEXT_PUBLIC_CONTRACT_ADDRESS=')) {
    currentEnv = currentEnv.replace(/NEXT_PUBLIC_CONTRACT_ADDRESS=.*/g, `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  } else {
    currentEnv += `\nNEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}\n`;
  }

  if (currentEnv.includes('LAUNCH_DAY_INDEX=')) {
    currentEnv = currentEnv.replace(/LAUNCH_DAY_INDEX=.*/g, `LAUNCH_DAY_INDEX=${launchDay}`);
  } else {
    currentEnv += `\nLAUNCH_DAY_INDEX=${launchDay}\n`;
  }

  fs.writeFileSync(envPath, currentEnv.trim() + '\n', 'utf-8');
  console.log(`Updated .env with NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress} and LAUNCH_DAY_INDEX=${launchDay}`);
}

main().catch((err) => {
  console.error('Deployment error:', err);
  process.exit(1);
});
