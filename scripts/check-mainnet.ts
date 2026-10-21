import * as fs from 'fs';
import * as path from 'path';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { avalanche, avalancheFuji } from 'viem/chains';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const deployerKey = (process.env.DEPLOYER_KEY || env.DEPLOYER_KEY) as `0x${string}`;
  const signerKey = (process.env.SIGNER_KEY || env.SIGNER_KEY) as `0x${string}`;

  if (!deployerKey) {
    console.log('No DEPLOYER_KEY found in .env');
    return;
  }

  const deployer = privateKeyToAccount(deployerKey);
  const signer = signerKey ? privateKeyToAccount(signerKey) : deployer;

  const fujiClient = createPublicClient({
    chain: avalancheFuji,
    transport: http('https://api.avax-test.network/ext/bc/C/rpc'),
  });

  const mainnetClient = createPublicClient({
    chain: avalanche,
    transport: http('https://api.avax.network/ext/bc/C/rpc'),
  });

  const [fujiBal, mainBal] = await Promise.all([
    fujiClient.getBalance({ address: deployer.address }).catch(() => 0n),
    mainnetClient.getBalance({ address: deployer.address }).catch(() => 0n),
  ]);

  console.log('--- Avalanche Accounts & Balances ---');
  console.log('Deployer Address :', deployer.address);
  console.log('Signer Address   :', signer.address);
  console.log('Fuji Balance     :', Number(fujiBal) / 1e18, 'AVAX');
  console.log('Mainnet Balance  :', Number(mainBal) / 1e18, 'AVAX');
  console.log('-------------------------------------');
}

main().catch(console.error);
