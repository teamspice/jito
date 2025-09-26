import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import {
  JitoService,
  BlockEngineUrl,
  TipPercentile,
} from "../src/jito.service";
import * as fs from "fs";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testTransaction(): Promise<void> {
  // Get Helius API key from environment
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.error("HELIUS_API_KEY not found in environment variables. Please set it in .env file.");
    return;
  }

  // Initialize connection to Solana
  const connection = new Connection(
    `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
  );

  // Read wallet from local path (wallet.json at frameworks root)
  const walletPath = "../wallet.json";

  if (!fs.existsSync(walletPath)) {
    console.error("Wallet file not found. Please update path.");
    return;
  }

  const walletKeypairData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(walletKeypairData),
  );

  console.log("Using wallet:", walletKeypair.publicKey.toString());

  // Get JITO_UUID from environment
  const jitoUuid = process.env.JITO_UUID;
  if (!jitoUuid) {
    console.error("JITO_UUID not found in environment variables. Please set it in .env file.");
    return;
  }

  // Initialize JitoService with UUID
  const jitoService = new JitoService(BlockEngineUrl.MAINNET, jitoUuid);

  try {
    // Get recommended fees dynamically
    console.log("Fetching recommended fees...");
    const fees = await jitoService.getRecommendedFeeFromTipFloor(
      TipPercentile.P75,
    );
    console.log("Recommended fees:", fees);

    // Get random tip account
    const randomTipAccount = await jitoService.getRandomTipAccount();
    const jitoTipAccount = new PublicKey(randomTipAccount);
    console.log("Using Jito tip account:", jitoTipAccount.toString());

    // Create transaction
    const transaction = new Transaction();

    // Add priority fee instruction
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(fees.priorityFeeLamports / 1000), // Convert to microLamports
      }),
    );

    // Add memo instruction using spl-memo
    const memoText = `Test memo from Jito service at ${new Date().toISOString()}`;
    const memoInstruction = createMemoInstruction(memoText, [
      walletKeypair.publicKey,
    ]);
    transaction.add(memoInstruction);

    // Add Jito tip instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: walletKeypair.publicKey,
        toPubkey: jitoTipAccount,
        lamports: fees.jitoTipLamports,
      }),
    );

    // Sign the transaction
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = walletKeypair.publicKey;
    transaction.sign(walletKeypair);

    // Serialize transaction and encode as base64
    const serializedTransaction = transaction.serialize();
    const base64Transaction = Buffer.from(serializedTransaction).toString(
      "base64",
    );

    console.log("Sending transaction...");

    // Send the transaction using JitoService
    const result = await jitoService.sendTransaction({
      transaction: base64Transaction,
      encoding: "base64",
      bundleOnly: false,
    });

    console.log("Transaction send result:", result);

    if (result.result) {
      const signature = result.result;
      console.log("Transaction signature:", signature);

      // Wait for confirmation
      console.log("Waiting for confirmation...");
      const confirmation = await confirmTransaction(
        connection,
        signature,
        120000,
      );
      console.log("Transaction confirmation:", confirmation);

      // Check final status
      const status = await connection.getSignatureStatus(signature);
      console.log("Transaction status:", status);

      if (status?.value?.confirmationStatus === "finalized") {
        const solscanUrl = `https://solscan.io/tx/${signature}`;
        console.log(
          `✅ Transaction finalized. View details on Solscan: ${solscanUrl}`,
        );
      } else {
        console.log(
          "⏳ Transaction was not finalized within the expected time.",
        );
      }
    } else if (result.error) {
      console.error("Error from Jito:", result.error);
    }
  } catch (error) {
    console.error("Error sending or confirming transaction:", error);
    if (error instanceof Error && "response" in error) {
      const axiosError = error as any;
      if (axiosError.response?.data) {
        console.error("Server response:", axiosError.response.data);
      }
    }
  }
}

async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeoutMs: number = 60000,
): Promise<any> {
  const start = Date.now();
  let status = await connection.getSignatureStatus(signature);

  while (Date.now() - start < timeoutMs) {
    status = await connection.getSignatureStatus(signature);
    if (status.value && status.value.confirmationStatus === "finalized") {
      return status;
    }
    // Wait for a short time before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Transaction ${signature} failed to confirm within ${timeoutMs}ms`,
  );
}

testTransaction().catch(console.error);
