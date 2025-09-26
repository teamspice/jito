# @slateos/jito

TypeScript SDK for building Solana MEV bots and high-priority applications with Jito Labs' block engine. Send transactions with guaranteed inclusion, bundle atomic operations, and optimize priority fees for arbitrage, liquidation bots, NFT sniping, and DeFi strategies.

A clean, type-safe wrapper around Jito's Low Latency Transaction Send API with automatic fee optimization and bundle simulation.

## Repository

https://github.com/teamspice/jito

## Installation

```bash
npm install @slateos/jito
# or
yarn add @slateos/jito
# or
pnpm add @slateos/jito
```

## Setup

To run the scripts from this repository:

1. Create a `.env` file from `.env.example`
2. Add a wallet file named `wallet.json` in the root directory

## Why @slateos/jito?

### vs. Raw jito-js-rpc
- **Automatic Fee Optimization** - Built-in 70/30 priority fee/tip split calculation based on live tip floor data
- **Type-Safe API** - Full TypeScript support with interfaces for all methods and responses
- **Pre-configured Tip Accounts** - No need to fetch or manage Jito tip accounts manually
- **Regional Endpoints** - Easy switching between 9 mainnet regions (Amsterdam, Tokyo, NY, etc.)
- **Bundle Simulation** - Integrated bundle simulation via Helius RPC to validate bundles before submission
- **Simplified Interface** - Cleaner API surface with sensible defaults (e.g., one-line tip account retrieval)

### vs. Standard Solana RPC
- **Guaranteed Inclusion** - Transactions bypass mempool and go directly to validators
- **MEV Protection** - Bundle transactions atomically to prevent frontrunning
- **Lower Latency** - Direct connection to Jito block engine reduces confirmation time
- **Priority Scheduling** - Tips ensure your transactions are prioritized by validators

## Quick Start

```typescript
import { JitoService, BlockEngineUrl, TipPercentile } from '@slateos/jito';

// Initialize the service
const jito = new JitoService(BlockEngineUrl.MAINNET);

// Get recommended fees based on tip floor
const fees = await jito.getRecommendedFeeFromTipFloor(TipPercentile.P75);
console.log(`Recommended Jito tip: ${fees.jitoTipSol} SOL`);
console.log(`Priority fee: ${fees.priorityFeeSol} SOL`);

// Send a transaction
const response = await jito.sendTransaction({
  transaction: base64EncodedTx,
  encoding: 'base64',
  bundleOnly: false // Set to true for bundle-only submission
});

// Get a random tip account
const tipAccount = await jito.getRandomTipAccount();
```

## API Reference

### JitoService

Main service class extending `JitoJsonRpcClient`.

#### Constructor

```typescript
new JitoService(blockEngineUrl: BlockEngineUrl, uuid?: string)
```

#### Methods

##### `sendTransaction(params: SendTransactionParams): Promise<SendTransactionResponse>`

Send a transaction through Jito's RPC.

```typescript
interface SendTransactionParams {
  transaction: string;
  encoding?: "base64" | "base58";
  bundleOnly?: boolean;
}
```

##### `getTipFloor(): Promise<TipFloorData[]>`

Get current tip floor data from Jito.

##### `calculateRecommendedFees(totalFeeSol: number): FeeRecommendation`

Calculate recommended fee distribution (70% priority fee, 30% Jito tip).

##### `getRecommendedFeeFromTipFloor(percentile?: TipPercentile): Promise<FeeRecommendation>`

Get fee recommendations based on tip floor percentile.

##### `getRandomTipAccount(): Promise<string>`

Get a random tip account from the predefined list.

##### `simulateBundle(params: SimulateBundleParams, rpcEndpoint: string): Promise<SimulateBundleResponse>`

Simulate a bundle before execution to validate transactions. **Note: Currently only works with Helius RPC.**

```typescript
interface SimulateBundleParams {
  encodedTransactions: string[];
  simulationBank?: string;
  skipSigVerify?: boolean;
  replaceRecentBlockhash?: boolean;
  accounts?: {
    addresses: string[];
    encoding: 'base58' | 'base64' | 'base64+zstd' | 'jsonParsed';
  };
  preExecutionAccountsConfigs?: Array<{
    accountIndex: number;
    addresses: string[];
  } | null>;
  postExecutionAccountsConfigs?: Array<{
    accountIndex: number;
    addresses: string[];
  } | null>;
}

interface SimulateBundleResponse {
  jsonrpc: string;
  id: string;
  result?: {
    context: {
      apiVersion: string;
      slot: number;
    };
    err: any | null;
    logs?: string[] | null;
    preExecutionAccounts?: Array<AccountInfo | null>;
    postExecutionAccounts?: Array<AccountInfo | null>;
    unitsConsumed?: number;
    returnData?: {
      programId: string;
      data: string;
    } | null;
  };
  error?: {
    code: number;
    message: string;
  };
}
```

### Enums

#### `BlockEngineUrl`

**Mainnet Endpoints:**
- `MAINNET`: Main Jito block engine endpoint
- `AMSTERDAM`: 🇳🇱 Amsterdam region endpoint
- `DUBLIN`: 🇮🇪 Dublin region endpoint
- `FRANKFURT`: 🇩🇪 Frankfurt region endpoint
- `LONDON`: 🇬🇧 London region endpoint
- `NY`: 🇺🇸 New York region endpoint
- `SLC`: 🇺🇸 Salt Lake City region endpoint
- `SINGAPORE`: 🇸🇬 Singapore region endpoint
- `TOKYO`: 🇯🇵 Tokyo region endpoint

**Testnet Endpoints:**
- `TESTNET`: Main testnet endpoint
- `TESTNET_DALLAS`: 🇺🇸 Dallas testnet endpoint
- `TESTNET_NY`: 🇺🇸 New York testnet endpoint

#### `TipPercentile`
- `P50`: 50th percentile
- `P75`: 75th percentile (recommended)
- `P95`: 95th percentile
- `P99`: 99th percentile

### Constants

#### `TIP_ACCOUNTS`
Array of valid Jito tip accounts.

## Fee Recommendations

The framework automatically calculates optimal fee distribution:
- 70% allocated to priority fees
- 30% allocated to Jito tips
- Minimum tip of 1000 lamports enforced

## Example: Building a Simple Transaction

```typescript
import {
  JitoService,
  BlockEngineUrl,
  TipPercentile,
  FeeRecommendation
} from '@slateos/jito';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';

async function submitTransaction() {
  // Initialize Jito service
  const jito = new JitoService(BlockEngineUrl.MAINNET);

  // Get fee recommendations
  const fees = await jito.getRecommendedFeeFromTipFloor(TipPercentile.P75);

  // Build your transaction
  const transaction = new Transaction();
  // ... add your instructions

  // Add tip instruction
  const tipAccount = await jito.getRandomTipAccount();
  // ... add tip transfer instruction using tipAccount and fees.jitoTipLamports

  // Serialize and send
  const serialized = transaction.serialize().toString('base64');
  const response = await jito.sendTransaction({
    transaction: serialized,
    encoding: 'base64'
  });

  console.log('Transaction sent:', response.result);
}
```

## Example: Bundle with Simulation

```typescript
import {
  JitoService,
  BlockEngineUrl,
  TipPercentile
} from '@slateos/jito';
import { Connection, Transaction } from '@solana/web3.js';

async function submitBundleWithSimulation() {
  // Initialize services
  const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const jito = new JitoService(BlockEngineUrl.MAINNET, process.env.JITO_UUID);

  // Build transactions
  const tx1 = new Transaction();
  const tx2 = new Transaction();
  // ... add instructions to transactions

  // Serialize transactions
  const encodedTx1 = tx1.serialize().toString('base64');
  const encodedTx2 = tx2.serialize().toString('base64');

  // Simulate bundle before sending
  const simulationResult = await jito.simulateBundle({
    encodedTransactions: [encodedTx1, encodedTx2],
    skipSigVerify: false,
    replaceRecentBlockhash: false,
    // Optional: Monitor specific accounts
    // accounts: {
    //   addresses: ['YourAccountPubkey'],
    //   encoding: 'base64'
    // }
  }, rpcEndpoint);

  if (simulationResult.result?.err) {
    console.error('Simulation failed:', simulationResult.result.err);
    if (simulationResult.result.logs) {
      console.log('Logs:', simulationResult.result.logs);
    }
    return;
  }

  console.log('Simulation successful!');
  console.log('Units consumed:', simulationResult.result?.unitsConsumed);
  if (simulationResult.result?.logs) {
    console.log('Logs:', simulationResult.result.logs);
  }

  // Send bundle
  const result = await jito.sendBundle([
    [encodedTx1, encodedTx2],
    { encoding: 'base64' }
  ]);

  console.log('Bundle sent:', result.result);
}
```

## Support

For issues and questions, reach out to [@waniak_](https://twitter.com/waniak_) on Twitter/X.