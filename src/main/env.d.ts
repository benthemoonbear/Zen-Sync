interface ImportMetaEnv {
  /** Zen Sync licence server, e.g. https://zen-sync-licences.<account>.workers.dev */
  readonly MAIN_VITE_LICENCE_SERVER_URL?: string
  /** Stripe Payment Link, e.g. https://buy.stripe.com/… */
  readonly MAIN_VITE_CHECKOUT_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
