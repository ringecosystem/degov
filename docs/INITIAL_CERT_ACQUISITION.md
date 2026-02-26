# Initial Let's Encrypt Certificate Acquisition

The nginx config includes ACME challenge support at `/.well-known/acme-challenge/`. The Ansible deploy creates a dummy certificate so nginx can start. To obtain a real Let's Encrypt certificate:

## Prerequisites

- Domain `governance.igralabs.com` (or your domain) points to your server's public IP
- degov and nginx are deployed and running
- Ports 80 and 443 are open

## Steps

### 1. Remove the dummy certificate

On the server (or via Ansible ad-hoc):

```bash
cd /opt/nginx-host  # or your nginx_deploy_path
rm -rf certbot/conf/live/governance.igralabs.com
rm -rf certbot/conf/archive/governance.igralabs.com
rm -rf certbot/conf/renewal/governance.igralabs.com.conf
```

### 2. Request the certificate with Certbot

Replace `YOUR_EMAIL` with your email for Let's Encrypt notifications:

```bash
cd /opt/nginx-host
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  --domain governance.igralabs.com \
  --email YOUR_EMAIL \
  --rsa-key-size 4096 \
  --agree-tos \
  --force-renewal" certbot
```

For testing (staging, no rate limits):

```bash
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  --domain governance.igralabs.com \
  --email YOUR_EMAIL \
  --rsa-key-size 4096 \
  --agree-tos \
  --staging \
  --force-renewal" certbot
```

### 3. Reload nginx

```bash
docker compose exec nginx nginx -s reload
```

### 4. Verify

Visit `https://governance.igralabs.com` — you should see a valid certificate.

---

**Note:** The certbot container in the nginx docker-compose runs `certbot renew` every 12 hours. No further action is needed for renewals.
