/**
 * Credit transaction type enum
 */
export enum CREDIT_TRANSACTION_TYPE {
  MONTHLY_REFRESH = 'MONTHLY_REFRESH',        // Credits earned by monthly refresh (free users)
  REGISTER_GIFT = 'REGISTER_GIFT',            // Credits earned by register gift
  PURCHASE_PACKAGE = 'PURCHASE_PACKAGE',      // Credits earned by purchase package
  SUBSCRIPTION_RENEWAL = 'SUBSCRIPTION_RENEWAL', // Credits earned by subscription renewal
  LIFETIME_MONTHLY = 'LIFETIME_MONTHLY',      // Credits earned by lifetime plan monthly distribution
  USAGE = 'USAGE',                            // Credits spent by usage
  EXPIRE = 'EXPIRE',                          // Credits expired
  DAILY_CHECKIN = 'DAILY_CHECKIN',            // Credits earned by daily check-in
  VIDEO_GENERATION = 'VIDEO_GENERATION',      // Credits spent by video generation
  VIDEO_GENERATION_REFUND = 'VIDEO_GENERATION_REFUND', // Credits refunded for failed video generation
  IMAGE_GENERATION = 'IMAGE_GENERATION',      // Credits spent by image generation
  IMAGE_GENERATION_REFUND = 'IMAGE_GENERATION_REFUND', // Credits refunded for failed image generation
  REFUND = 'REFUND',                          // General refund
  GIFT = 'GIFT',                              // Credits gifted by admin
}

/**
 * Credit package price
 */
export interface CreditPackagePrice {
  priceId: string;                   // Stripe price ID (not product id)
  amount: number;                    // Price amount in currency units (dollars, euros, etc.)
  originalAmount?: number;           // Original price before discount (for showing strikethrough)
  currency: string;                  // Currency code (e.g., USD)
  allowPromotionCode?: boolean;      // Whether to allow promotion code for this price
}

/**
 * Credit package
 */
export interface CreditPackage {
  id: string;                          // Unique identifier for the package
  amount: number;                      // Amount of credits in the package
  price: CreditPackagePrice;           // Price of the package
  popular: boolean;                    // Whether the package is popular
  name?: string;                       // Display name of the package
  description?: string;                // Description of the package
  expireDays?: number;                 // Number of days to expire the credits, undefined means no expire
  disabled?: boolean;                  // Whether the package is disabled in the UI
}
