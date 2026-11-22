/**
 * Public payment settings (not secrets — customers see both URLs).
 * Build-time env vars override these: MAIN_VITE_CHECKOUT_URL, MAIN_VITE_LICENCE_SERVER_URL.
 */
export const PAYMENTS = {
  /** Stripe Payment Link (Managed Payments on). Test mode until going live. */
  checkoutUrl: 'https://buy.stripe.com/dRm4gAaVnbwschbgKw4sE00',
  /** Zen Sync licence server (Cloudflare Worker). Filled in after the first deploy. */
  licenceServerUrl: 'https://zen-sync-licences.haywood1999.workers.dev'
}
