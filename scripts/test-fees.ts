import { JitoService, BlockEngineUrl, TipPercentile } from "../src/jito.service";

async function main(): Promise<void> {
  const service = new JitoService(BlockEngineUrl.MAINNET);

  try {
    const fees = await service.getRecommendedFeeFromTipFloor(TipPercentile.P75);
    console.log("Recommended fees:", JSON.stringify(fees, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
