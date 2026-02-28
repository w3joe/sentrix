// Use empty string = same-origin; requests go through Next.js rewrites to backends.
// Override with env vars if you need to point at external API hosts.
export const API_URLS = {
  bridge: process.env.NEXT_PUBLIC_BRIDGE_API_URL ?? '',
  patrol: process.env.NEXT_PUBLIC_PATROL_API_URL ?? '',
  investigation: process.env.NEXT_PUBLIC_INVESTIGATION_API_URL ?? '',
} as const;
