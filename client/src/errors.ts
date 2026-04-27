/**
 * Base class for all Fluid-related errors.
 */
export class FluidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FluidError";
    Object.setPrototypeOf(this, FluidError.prototype);
  }
}

/**
 * Error thrown when a network request fails (e.g., DNS, timeout, no connectivity).
 */
export class FluidNetworkError extends FluidError {
  public readonly serverUrl?: string;

  constructor(message: string, serverUrl?: string) {
    super(message);
    this.name = "FluidNetworkError";
    this.serverUrl = serverUrl;
    Object.setPrototypeOf(this, FluidNetworkError.prototype);
  }
}

/**
 * Error thrown when the Fluid server returns an error response (4xx or 5xx).
 */
export class FluidServerError extends FluidError {
  public readonly status: number;
  public readonly serverUrl: string;
  public readonly responseBody?: any;

  constructor(message: string, status: number, serverUrl: string, responseBody?: any) {
    super(message);
    this.name = "FluidServerError";
    this.status = status;
    this.serverUrl = serverUrl;
    this.responseBody = responseBody;
    Object.setPrototypeOf(this, FluidServerError.prototype);
  }
}

/**
 * Error thrown when the Fluid client is misconfigured.
 */
export class FluidConfigurationError extends FluidError {
  constructor(message: string) {
    super(message);
    this.name = "FluidConfigurationError";
    Object.setPrototypeOf(this, FluidConfigurationError.prototype);
  }
}

/**
 * Error thrown when a required wallet/keypair is missing or operation is rejected by user.
 */
export class FluidWalletError extends FluidError {
  constructor(message: string) {
    super(message);
    this.name = "FluidWalletError";
    Object.setPrototypeOf(this, FluidWalletError.prototype);
  }
}
