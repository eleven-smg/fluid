import StellarSdk from "@stellar/stellar-sdk";

export interface FluidClientConfig {
  serverUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
}

export interface FeeBumpResponse {
  xdr: string;
  status: string;
  hash?: string;
}

export class FluidClient {
  private serverUrl: string;
  private networkPassphrase: string;
  private horizonServer?: any;

  constructor(config: FluidClientConfig) {
    this.serverUrl = config.serverUrl;
    this.networkPassphrase = config.networkPassphrase;
    if (config.horizonUrl) {
      this.horizonServer = new StellarSdk.Horizon.Server(config.horizonUrl);
    }
  }

  async requestFeeBump(
    signedTransactionXdr: string,
    submit: boolean = false
  ): Promise<FeeBumpResponse> {
    const response = await fetch(`${this.serverUrl}/fee-bump`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        xdr: signedTransactionXdr,
        submit: submit,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Fluid server error: ${JSON.stringify(error)}`);
    }

    const result = (await response.json()) as FeeBumpResponse;
    return {
      xdr: result.xdr,
      status: result.status,
      hash: result.hash,
    };
  }

  async submitFeeBumpTransaction(feeBumpXdr: string): Promise<any> {
    if (!this.horizonServer) {
      throw new Error("Horizon URL not configured");
    }

    const feeBumpTx = StellarSdk.TransactionBuilder.fromXDR(
      feeBumpXdr,
      this.networkPassphrase
    );

    return await this.horizonServer.submitTransaction(feeBumpTx);
  }

  async buildAndRequestFeeBump(
    transaction: any,
    submit: boolean = false
  ): Promise<FeeBumpResponse> {
    const signedXdr = transaction.toXDR();
    return await this.requestFeeBump(signedXdr, submit);
  }
}
