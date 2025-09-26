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

async function testBundle(): Promise<void> {
  // Get RPC endpoint from environment or use a default
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.error("HELIUS_API_KEY not found in environment variables. Please set it in .env file.");
    return;
  }

  const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

  // Initialize connection to Solana
  const connection = new Connection(rpcEndpoint);

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
    console.log("Recommended fees:", JSON.stringify(fees, null, 2));

    // Get random tip account
    const randomTipAccount = await jitoService.getRandomTipAccount();
    const jitoTipAccount = new PublicKey(randomTipAccount);
    console.log("Using Jito tip account:", jitoTipAccount.toString());

    // Get recent blockhash for both transactions
    const { blockhash } = await connection.getLatestBlockhash();

    // === Create First Transaction ===
    const transaction1 = new Transaction();

    // Add priority fee instruction
    transaction1.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(fees.priorityFeeLamports / 1000), // Convert to microLamports
      }),
    );

    // Add memo instruction for first transaction
    const memoText1 = `Bundle TX 1: ${new Date().toISOString()}`;
    const memoInstruction1 = createMemoInstruction(memoText1, [
      walletKeypair.publicKey,
    ]);
    transaction1.add(memoInstruction1);

    // Set blockhash and fee payer for first transaction
    transaction1.recentBlockhash = blockhash;
    transaction1.feePayer = walletKeypair.publicKey;

    // Sign the first transaction
    transaction1.sign(walletKeypair);

    // Serialize and base64 encode the first transaction
    const serializedTransaction1 = transaction1.serialize({
      verifySignatures: false,
    });
    const base64EncodedTransaction1 = Buffer.from(
      serializedTransaction1,
    ).toString("base64");

    // === Create Second Transaction ===
    const transaction2 = new Transaction();

    // Add priority fee instruction for second transaction
    transaction2.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(fees.priorityFeeLamports / 1000),
      }),
    );

    // Add memo instructions for second transaction
    const memoText2 = `Bundle TX 2: Testing Jito bundles`;
    const memoInstruction2 = createMemoInstruction(memoText2, [
      walletKeypair.publicKey,
    ]);
    transaction2.add(memoInstruction2);

    // Add another memo to make the second transaction different
    const memoText3 = `Bundle TX 2: Additional memo`;
    const memoInstruction3 = createMemoInstruction(memoText3, [
      walletKeypair.publicKey,
    ]);
    transaction2.add(memoInstruction3);

    // Add Jito tip instruction at the end of the last transaction
    transaction2.add(
      SystemProgram.transfer({
        fromPubkey: walletKeypair.publicKey,
        toPubkey: jitoTipAccount,
        lamports: fees.jitoTipLamports,
      }),
    );

    // Set blockhash and fee payer for second transaction
    transaction2.recentBlockhash = blockhash;
    transaction2.feePayer = walletKeypair.publicKey;

    // Sign the second transaction
    transaction2.sign(walletKeypair);

    // Serialize and base64 encode the second transaction
    const serializedTransaction2 = transaction2.serialize({
      verifySignatures: false,
    });
    const base64EncodedTransaction2 = Buffer.from(
      serializedTransaction2,
    ).toString("base64");

    // === Simulate Bundle Before Sending ===
    console.log("\n🔍 Simulating bundle before sending...");

    const simulationResult = await jitoService.simulateBundle({
      encodedTransactions: [base64EncodedTransaction1, base64EncodedTransaction2],
      skipSigVerify: false,
      replaceRecentBlockhash: false
    }, rpcEndpoint);

    if (simulationResult.error) {
      console.error("❌ Bundle simulation failed with error:", simulationResult.error);
      return;
    }

    if (simulationResult.result?.err) {
      console.error("❌ Bundle simulation failed:", simulationResult.result.err);
      if (simulationResult.result.logs) {
        console.log("\nSimulation logs:");
        simulationResult.result.logs.forEach((txLogs, index) => {
          console.log(`\nTransaction ${index + 1} logs:`);
          txLogs.forEach(log => console.log(`  ${log}`));
        });
      }
      return;
    }

    console.log("✅ Bundle simulation successful!");
    console.log(`  Slot: ${simulationResult.result?.context.slot}`);
    console.log(`  Units consumed: ${simulationResult.result?.unitsConsumed || 'N/A'}`);

    if (simulationResult.result?.logs) {
      console.log("\nSimulation logs:");
      simulationResult.result.logs.forEach((txLogs, index) => {
        console.log(`\nTransaction ${index + 1} logs:`);
        txLogs.forEach(log => console.log(`  ${log}`));
      });
    }

    console.log("\n📤 Sending bundle with 2 transactions...");

    // Send the bundle with both transactions
    const result = await jitoService.sendBundle([
      [base64EncodedTransaction1, base64EncodedTransaction2],
      { encoding: "base64" },
    ]);
    console.log("Bundle send result:", result);

    if (!result.result) {
      console.error("Failed to get bundle ID from response");
      return;
    }

    const bundleId = result.result;
    console.log("Bundle ID:", bundleId);

    // Wait for confirmation with a longer timeout
    console.log("Waiting for bundle confirmation...");
    const inflightStatus = await jitoService.confirmInflightBundle(
      bundleId,
      120000,
    ); // 120 seconds timeout
    console.log(
      "Inflight bundle status:",
      JSON.stringify(inflightStatus, null, 2),
    );

    // Check the type of response we got
    if (
      "confirmation_status" in inflightStatus &&
      inflightStatus.confirmation_status === "confirmed"
    ) {
      console.log(
        `✅ Bundle successfully confirmed on-chain at slot ${inflightStatus.slot}`,
      );

      // Additional check for bundle finalization
      try {
        console.log("Fetching final bundle status...");
        const finalStatus = await jitoService.getBundleStatuses([[bundleId]]); // Note the double array
        console.log(
          "Final bundle status response:",
          JSON.stringify(finalStatus, null, 2),
        );

        if (
          finalStatus.result &&
          finalStatus.result.value &&
          finalStatus.result.value.length > 0
        ) {
          const status = finalStatus.result.value[0];
          console.log("Confirmation status:", status.confirmation_status);

          const explorerUrl = `https://explorer.jito.wtf/bundle/${bundleId}`;
          console.log("Bundle Explorer URL:", explorerUrl);

          console.log("Final bundle details:", JSON.stringify(status, null, 2));

          // Display transaction URLs
          if (status.transactions && status.transactions.length > 0) {
            console.log(
              `\nTransaction URLs (${status.transactions.length} transaction${
                status.transactions.length > 1 ? "s" : ""
              } in this bundle):`,
            );
            status.transactions.forEach((txId: string, index: number) => {
              const txUrl = `https://solscan.io/tx/${txId}`;
              console.log(`Transaction ${index + 1}: ${txUrl}`);
            });
          } else {
            console.log("No transactions found in the bundle status.");
          }
        } else {
          console.log("Unexpected final bundle status response structure");
        }
      } catch (statusError: any) {
        console.error(
          "Error fetching final bundle status:",
          statusError.message,
        );
        if (statusError.response && statusError.response.data) {
          console.error("Server response:", statusError.response.data);
        }
      }
    } else if ("status" in inflightStatus) {
      // Handle the status-based response
      if (inflightStatus.status === "Landed") {
        const slot =
          "landed_slot" in inflightStatus
            ? inflightStatus.landed_slot
            : "unknown";
        console.log(`✅ Bundle landed at slot ${slot}`);
      } else if (
        inflightStatus.status === "Failed" ||
        inflightStatus.status === "Invalid"
      ) {
        console.log(
          `❌ Bundle processing failed with status: ${inflightStatus.status}`,
        );
      } else if (inflightStatus.status === "Pending") {
        console.log("⏳ Bundle is still pending");
      }
    } else if ("err" in inflightStatus && inflightStatus.err) {
      console.log("❌ Bundle processing failed:", inflightStatus.err);
    } else {
      console.log("⚠️ Unexpected inflight bundle status:", inflightStatus);
    }
  } catch (error: any) {
    console.error("Error sending or confirming bundle:", error.message);
    if (error.response && error.response.data) {
      console.error("Server response:", error.response.data);
    }
  }
}

testBundle().catch(console.error);
