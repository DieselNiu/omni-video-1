/**
 * Typed error thrown when a credit deduction fails because the user's
 * balance is below the required amount. Callers can catch this class
 * to return structured 402 responses instead of sniffing error messages.
 */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const;
  readonly required: number;

  constructor(required: number) {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
    this.required = required;
  }
}
