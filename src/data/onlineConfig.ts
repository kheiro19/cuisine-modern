// src/data/onlineConfig.ts
// How the app reaches ambientCG. Its API and its downloads do not send the CORS headers a browser needs, so a page cannot read
// them directly (Firefox shows "NetworkError when attempting to fetch resource"). The fix is a same-origin PROXY:
//   npm run dev / npm run preview : vite.config.ts forwards /proxy/ambientcg/* and /proxy/acgmedia/* (nothing to install)
//   a static host (build)         : set VITE_AMBIENTCG_PROXY to a small forwarder that serves the same two paths (see README)
// Poly Haven answers with open CORS and needs none of this.

export const AMBIENT_SITE = 'https://ambientcg.com';
export const AMBIENT_MEDIA = 'https://f003.backblazeb2.com';
export const AMBIENT_PROXY_PATH = '/proxy/ambientcg';
// (no shared prefix with AMBIENT_PROXY_PATH: Vite picks a proxy by the START of the address, so "/proxy/ambientcg-media" would be caught by "/proxy/ambientcg")
export const AMBIENT_MEDIA_PROXY_PATH = '/proxy/acgmedia';

export interface OnlineEnv {
  DEV?: boolean;
  VITE_AMBIENTCG_PROXY?: string;
}

const swap = (url: string, siteBase: string, mediaBase: string): string => {
  if (url.startsWith(AMBIENT_SITE + '/')) return siteBase + url.slice(AMBIENT_SITE.length);
  if (url.startsWith(AMBIENT_MEDIA + '/')) return mediaBase + url.slice(AMBIENT_MEDIA.length);
  return url;
};

/** Turns an ambientCG address into the one the page can really call (the other addresses are left alone). */
export function makeRewrite(env: OnlineEnv): (url: string) => string {
  const base = (env.VITE_AMBIENTCG_PROXY ?? '').trim().replace(/\/+$/, '');
  if (env.DEV) return (u) => swap(u, AMBIENT_PROXY_PATH, AMBIENT_MEDIA_PROXY_PATH);
  if (base) return (u) => swap(u, base + AMBIENT_PROXY_PATH, base + AMBIENT_MEDIA_PROXY_PATH);
  return (u) => u;
}
