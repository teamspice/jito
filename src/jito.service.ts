import { JitoJsonRpcClient } from "jito-js-rpc";

export enum BlockEngineUrl {
  // Mainnet endpoints
  MAINNET = "https://mainnet.block-engine.jito.wtf/api/v1",
  AMSTERDAM = "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1",
  DUBLIN = "https://dublin.mainnet.block-engine.jito.wtf/api/v1",
  FRANKFURT = "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1",
  LONDON = "https://london.mainnet.block-engine.jito.wtf/api/v1",
  NY = "https://ny.mainnet.block-engine.jito.wtf/api/v1",
  SLC = "https://slc.mainnet.block-engine.jito.wtf/api/v1",
  SINGAPORE = "https://singapore.mainnet.block-engine.jito.wtf/api/v1",
  TOKYO = "https://tokyo.mainnet.block-engine.jito.wtf/api/v1",

  // Testnet endpoints
  TESTNET = "https://testnet.block-engine.jito.wtf/api/v1",
  TESTNET_DALLAS = "https://dallas.testnet.block-engine.jito.wtf/api/v1",
  TESTNET_NY = "https://ny.testnet.block-engine.jito.wtf/api/v1",
}

export enum TipPercentile {
  P50 = "p50",
  P75 = "p75",
  P95 = "p95",
  P99 = "p99",
}

export const TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export interface SendTransactionParams {
  transaction: string;
  encoding?: "base64" | "base58";
  bundleOnly?: boolean;
}

export interface SendTransactionResponse {
  jsonrpc: string;
  result?: string;
  error?: {
    code: number;
    message: string;
  };
  id: number;
}

export interface TipFloorData {
  time: string;
  landed_tips_25th_percentile: number;
  landed_tips_50th_percentile: number;
  landed_tips_75th_percentile: number;
  landed_tips_95th_percentile: number;
  landed_tips_99th_percentile: number;
  ema_landed_tips_50th_percentile: number;
}

export interface FeeRecommendation {
  priorityFeeLamports: number;
  jitoTipLamports: number;
  totalFeeLamports: number;
  priorityFeeSol: number;
  jitoTipSol: number;
  totalFeeSol: number;
}

export interface SimulateBundleParams {
  encodedTransactions: string[];
  skipSigVerify?: boolean;
  replaceRecentBlockhash?: boolean;
}

export interface SimulateBundleResponse {
  jsonrpc: string;
  id: string;
  result?: {
    context: {
      apiVersion: string;
      slot: number;
    };
    err: any | null;
    logs?: string[][];
    unitsConsumed?: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class JitoService extends JitoJsonRpcClient {
  private static readonly LAMPORTS_PER_SOL = 1_000_000_000;
  private static readonly MIN_TIP_LAMPORTS = 1000;

  public blockEngineUrl: BlockEngineUrl;

  constructor(blockEngineUrl: BlockEngineUrl, uuid?: string) {
    super(blockEngineUrl, uuid);
    this.blockEngineUrl = blockEngineUrl;
  }

  async sendTransaction(
    params: SendTransactionParams,
  ): Promise<SendTransactionResponse> {
    const { transaction, encoding = "base64", bundleOnly = false } = params;

    const sendParams: any =
      encoding === "base64"
        ? [transaction, { encoding: "base64" }]
        : [transaction];

    const response = await this.sendTxn(sendParams, bundleOnly);

    return response as SendTransactionResponse;
  }

  async getTipFloor(): Promise<TipFloorData[]> {
    const url = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch tip floor: ${response.status}`);
    }

    return (await response.json()) as TipFloorData[];
  }

  calculateRecommendedFees(totalFeeSol: number): FeeRecommendation {
    const totalFeeLamports = totalFeeSol * JitoService.LAMPORTS_PER_SOL;

    const priorityFeeLamports = Math.floor(totalFeeLamports * 0.7);
    const jitoTipLamports = Math.max(
      Math.floor(totalFeeLamports * 0.3),
      JitoService.MIN_TIP_LAMPORTS,
    );

    return {
      priorityFeeLamports,
      jitoTipLamports,
      totalFeeLamports: priorityFeeLamports + jitoTipLamports,
      priorityFeeSol: priorityFeeLamports / JitoService.LAMPORTS_PER_SOL,
      jitoTipSol: jitoTipLamports / JitoService.LAMPORTS_PER_SOL,
      totalFeeSol:
        (priorityFeeLamports + jitoTipLamports) / JitoService.LAMPORTS_PER_SOL,
    };
  }

  async getRecommendedFeeFromTipFloor(
    percentile: TipPercentile = TipPercentile.P75,
  ): Promise<FeeRecommendation> {
    const tipFloor = await this.getTipFloor();

    if (!tipFloor || tipFloor.length === 0) {
      throw new Error("No tip floor data available");
    }

    const latestData = tipFloor[0];
    let tipAmount: number;

    switch (percentile) {
      case TipPercentile.P50:
        tipAmount = latestData.landed_tips_50th_percentile;
        break;
      case TipPercentile.P75:
        tipAmount = latestData.landed_tips_75th_percentile;
        break;
      case TipPercentile.P95:
        tipAmount = latestData.landed_tips_95th_percentile;
        break;
      case TipPercentile.P99:
        tipAmount = latestData.landed_tips_99th_percentile;
        break;
    }

    const jitoTipSol = tipAmount;
    const totalFeeSol = jitoTipSol / 0.3;

    return this.calculateRecommendedFees(totalFeeSol);
  }

  override async getRandomTipAccount(): Promise<string> {
    const randomIndex = Math.floor(Math.random() * TIP_ACCOUNTS.length);
    return TIP_ACCOUNTS[randomIndex];
  }

  async simulateBundle(
    params: SimulateBundleParams,
    rpcEndpoint?: string,
  ): Promise<SimulateBundleResponse> {
    const { encodedTransactions, skipSigVerify = false, replaceRecentBlockhash = false } = params;

    // Use provided RPC endpoint or throw error if not provided
    if (!rpcEndpoint) {
      throw new Error("RPC endpoint is required for bundle simulation");
    }

    const rpcUrl = rpcEndpoint;

    const requestBody = {
      jsonrpc: "2.0",
      id: "1",
      method: "simulateBundle",
      params: [
        {
          encodedTransactions,
          skipSigVerify,
          replaceRecentBlockhash
        }
      ]
    };

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to simulate bundle: ${response.status}`);
    }

    return (await response.json()) as SimulateBundleResponse;
  }
}
