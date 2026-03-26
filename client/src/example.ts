import StellarSdk from "@stellar/stellar-sdk";
import dotenv from "dotenv";
import { FluidClient } from "./lib";

dotenv.config();

async function main() {
  const client = new FluidClient({
    serverUrl: process.env.FLUID_SERVER_URL || "http://localhost:3000",
    networkPassphrase: StellarSdk.Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
  });

  // Example: create a transaction
  const userKeypair = StellarSdk.Keypair.random();
  console.log("User wallet:", userKeypair.publicKey());

  // fund the wallet (only on testnet)
  await fetch(
    `https://friendbot.stellar.org?addr=${userKeypair.publicKey()}`
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const server = new StellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org"
  );
  const account = await server.loadAccount(userKeypair.publicKey());

  // Build transaction
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: StellarSdk.Keypair.random().publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "5",
      })
    )
    .setTimeout(180)
    .build();

  // Sign transaction
  transaction.sign(userKeypair);

  // Request fee-bump
  const result = await client.requestFeeBump(transaction.toXDR(), false);
  console.log("Fee-bump XDR received:", result.xdr.substring(0, 50) + "...");

  // Submit fee-bump transaction
  const submitResult = await client.submitFeeBumpTransaction(result.xdr);
  console.log("Transaction submitted! Hash:", submitResult.hash);
}

main().catch(console.error);
