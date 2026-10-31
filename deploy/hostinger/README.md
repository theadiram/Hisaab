# Hostinger deployment

Hisaab runs as an unprivileged `hisaab` systemd service on Ubuntu 24.04, Node 24.14.0. Nginx terminates HTTPS and proxies only to 127.0.0.1:3000. Cloudflare remains the public proxy; map files remain on maps.adiram.me (R2). Public catalogue reads use PostgreSQL on the VPS through a restricted loopback API. Historical asset details/counts use the local SQLite edition; R2 delivers map files. Supabase Auth/private Storage remain retained and application writes are paused during migration. See [the current architecture](../../docs/architecture.md) and [catalogue guide](../../docs/vps-public-catalogue.md).

## Configuration

Install `hisaab.service` in `/etc/systemd/system/` and `nginx.conf` in `/etc/nginx/sites-available/hisaab`. The release directory is `/srv/hisaab/releases/<release>`, with `/srv/hisaab/current` pointing at the active release. Install dependencies and build on Linux; do not copy macOS native modules.

Store the production configuration in `.env.production`, mode 0600, owned by hisaab. Never commit it. Preserve public-preview and read-only access settings. Set `HISAAB_TRUST_PROXY_IP=true` and `HISAAB_TRUST_NETLIFY_IP=false`. Only enable proxy trust with Next.js bound to loopback and Nginx overwriting X-Hisaab-Client-IP. Nginx's real-IP configuration must trust only Cloudflare's published IPv4/IPv6 ranges, fetched from https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6; use CF-Connecting-IP. Never trust that header from arbitrary source addresses.

The hourly Netlify retention function is disabled in the current production configuration. Do not enable it on either platform without configuring and validating a single scheduled worker.

## Deploy and verify

1. Review code, run `npm test` and `npm run typecheck`.
2. Upload the reviewed source into a new release directory, excluding acquisition originals, credentials, local caches, and node_modules.
3. Install dependencies with `npm ci --no-audit --no-fund` and run `npm run build` as hisaab, using the production configuration and NEXT_TELEMETRY_DISABLED=1.
4. Retain the previous release. Switch the current symlink and restart hisaab. Check logs immediately. Roll back the symlink and restart if verification fails.
5. Check home, state cards, coverage, map queries, static chunks, and R2 delivery. Unauthenticated administration must remain denied and citizen writes closed.
6. Check `systemctl show hisaab -p MemoryCurrent -p MemoryPeak -p NRestarts` and provider CPU-credit graphs. Short tests do not establish sustained capacity.

Production builds are stopped on Netlify. GitHub pushes do not automatically deploy to this VPS; use the reviewed deployment process above.

## HTTPS and recovery

Let's Encrypt covers adiram.me and www.adiram.me. Renewal uses the webroot `/var/www/acme`; preserve the HTTP ACME location and certbot timer. `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` reloads Nginx after renewal. Test renewal after changes to DNS or proxy rules.

The Cloudflare maintenance worker is retained on `maintenance-standby.adiram.me/*`. To restore the notice, change its route back to `adiram.me/*`. The previous Netlify root origins were 75.2.60.5 and 99.83.231.61; the latter is preserved as netlify-origin-backup.adiram.me. Do not point traffic back at Netlify until its hosting is available.

Keep independent backups of production configuration and release information. Hostinger weekly backups do not replace application recovery checks.
