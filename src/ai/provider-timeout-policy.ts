/**
 * Keep interactive text generation responsive while allowing image providers
 * enough time to render an image before the transport gives up.
 */
export const TEXT_PROVIDER_TIMEOUT_MS = 60_000;
export const IMAGE_PROVIDER_TIMEOUT_MS = 120_000;
