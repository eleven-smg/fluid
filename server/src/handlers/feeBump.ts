import { NextFunction, Request, Response } from "express";
import StellarSdk, { Transaction } from "@stellar/stellar-sdk";
import { Config, FeePayerAccount, pickFeePayerAccount } from "../config";
import { AppError } from "../errors/AppError";
import { ApiKeyConfig } from "../middleware/apiKeys";
import { Tenant, syncTenantFromApiKey } from "../models/tenantStore";
import { recordSponsoredTransaction } from "../models/transactionLedger";
import { FeeBumpRequest, FeeBumpSchema, FeeBumpBatchRequest, FeeBumpBatchSchema } from "../schemas/feeBump";
import { checkTenantDailyQuota } from "../services/quota";
import { calculateFeeBumpFee } from "../utils/feeCalculator";
import { transactionStore } from "../workers/transactionStore";

export interface FeeBumpResponse {
  xdr: string;
  status: "ready" | "submitted";
  hash?: string;
  fee_payer: string;
  submitted_via?: string;
  submission_attempts?: number;
}

async function processFeeBump(
  xdr: string,
  submit: boolean,
  config: Config,
  tenant: Tenant,
  feePayerAccount: FeePayerAccount
): Promise<FeeBumpResponse> {
  let innerTransaction: Transaction;

  try {
    innerTransaction = StellarSdk.TransactionBuilder.fromXDR(
      xdr,
      config.networkPassphrase
    ) as Transaction;
  } catch (error: any) {
    throw new AppError(`Invalid XDR: ${error.message}`, 400, "INVALID_XDR");
  }

  if (!innerTransaction.signatures || innerTransaction.signatures.length === 0) {
    throw new AppError(
      "Inner transaction must be signed before fee-bumping",
      400,
      "UNSIGNED_TRANSACTION"
    );
  }

  if ("innerTransaction" in innerTransaction) {
    throw new AppError(
      "Cannot fee-bump an already fee-bumped transaction",
      400,
      "ALREADY_FEE_BUMPED"
    );
  }

  const operationCount = innerTransaction.operations?.length || 0;
  const feeAmount = calculateFeeBumpFee(
    innerTransaction, // Pass the transaction object for Soroban check
    config.baseFee,
    config.feeMultiplier
  );

  const quotaCheck = await checkTenantDailyQuota(tenant, feeAmount);
  if (!quotaCheck.allowed) {
    throw new AppError(
      `Daily fee sponsorship quota exceeded. Current spend: ${quotaCheck.currentSpendStroops}, Attempted: ${feeAmount}, Quota: ${quotaCheck.dailyQuotaStroops}`,
      403,
      "QUOTA_EXCEEDED"
    );
  }

  const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
    feePayerAccount.keypair,
    feeAmount.toString(),
    innerTransaction,
    config.networkPassphrase
  );

  feeBumpTx.sign(feePayerAccount.keypair);
  await recordSponsoredTransaction(tenant.id, feeAmount);

  const feeBumpXdr = feeBumpTx.toXDR();

  if (submit && config.horizonUrl) {
    const server = new StellarSdk.Horizon.Server(config.horizonUrl);

    try {
      const submissionResult = await server.submitTransaction(feeBumpTx);
      await transactionStore.addTransaction(submissionResult.hash, tenant.id, "submitted");

      return {
        xdr: feeBumpXdr,
        status: "submitted",
        hash: submissionResult.hash,
        fee_payer: feePayerAccount.publicKey,
      };
    } catch (error: any) {
      console.error("Transaction submission failed:", error);
      throw new AppError(
        `Transaction submission failed: ${error.message}`,
        500,
        "SUBMISSION_FAILED"
      );
    }
  }

  return {
    xdr: feeBumpXdr,
    status: submit ? "submitted" : "ready",
    fee_payer: feePayerAccount.publicKey,
  };
}

export async function feeBumpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config
): Promise<void> {
  try {
    const parsedBody = FeeBumpSchema.safeParse(req.body);

    if (!parsedBody.success) {
      console.warn(
        "Validation failed for fee-bump request:",
        parsedBody.error.format()
      );

      return next(
        new AppError(
          `Validation failed: ${JSON.stringify(parsedBody.error.format())}`,
          400,
          "INVALID_XDR"
        )
      );
    }

    const body: FeeBumpRequest = parsedBody.data;
    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!apiKeyConfig) {
      res.status(500).json({
        error: "Missing tenant context for fee sponsorship",
      });
      return;
    }

    const tenant = syncTenantFromApiKey(apiKeyConfig);
    const feePayerAccount = pickFeePayerAccount(config);

    const response = await processFeeBump(
      body.xdr,
      body.submit || false,
      config,
      tenant,
      feePayerAccount
    );

    res.json(response);
  } catch (error: any) {
    console.error("Error processing fee-bump request:", error);
    next(error);
  }
}

export async function feeBumpBatchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config
): Promise<void> {
  try {
    const parsedBody = FeeBumpBatchSchema.safeParse(req.body);

    if (!parsedBody.success) {
      console.warn(
        "Validation failed for fee-bump batch request:",
        parsedBody.error.format()
      );

      return next(
        new AppError(
          `Validation failed: ${JSON.stringify(parsedBody.error.format())}`,
          400,
          "INVALID_XDR"
        )
      );
    }

    const body: FeeBumpBatchRequest = parsedBody.data;
    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!apiKeyConfig) {
      res.status(500).json({
        error: "Missing tenant context for fee sponsorship",
      });
      return;
    }

    const tenant = syncTenantFromApiKey(apiKeyConfig);
    const results: FeeBumpResponse[] = [];

    for (const xdr of body.xdrs) {
      const feePayerAccount = pickFeePayerAccount(config);
      const result = await processFeeBump(
        xdr,
        body.submit || false,
        config,
        tenant,
        feePayerAccount
      );
      results.push(result);
    }

    res.json(results);
  } catch (error: any) {
    console.error("Error processing fee-bump batch request:", error);
    next(error);
  }
}

