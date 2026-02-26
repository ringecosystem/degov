# Ansible Deployment

Deploy degov and nginx proxy to a server using Ansible.

## Prerequisites

- Ansible 2.14+
- Target host with Docker and Docker Compose installed
- SSH access to the target host

Install the required collections:

```bash
cd ansible
ansible-galaxy collection install -r requirements.yml
```

## Configuration

1. **Create `inventory`** — Copy `inventory.example` to `inventory` and fill in your server hostname/IP and SSH user:

   ```bash
   cp inventory.example inventory
   ```

   For single-host deployment (both on same server), use the same host for both groups.

2. **Credentials** — Use `.env` in the project root (same as local development). The deploy copies it to the server. Ensure it has `DEGOV_DB_PASSWORD`, `DEGOV_SYNC_AUTH_TOKEN`, `DEGOV_WEB_JWT_SECRET`, and optionally `CHAIN_RPC_38833`, `OPENROUTER_API_KEY`, etc.

3. **Optional** — Override `degov_deploy_path` and `nginx_deploy_path` in `group_vars/all/vars.yml` (default: `/opt/degov` and `/opt/nginx-host`).

## Deployment

Run all commands from the `ansible/` directory.

### Full deploy (degov + nginx)

Ensure `.env` exists in the project root, then:

```bash
cd ansible
ansible-playbook playbooks/deploy.yml -i inventory
```

### Initial Let's Encrypt certificate

After the first deploy, nginx runs with a dummy certificate. To obtain a real certificate, follow [docs/INITIAL_CERT_ACQUISITION.md](../docs/INITIAL_CERT_ACQUISITION.md).

### Update config (no image rebuild)

When you change `degov.yml`, `.env`, or `docker-compose.yml` — **no image rebuild** is needed:

```bash
cd ansible
ansible-playbook playbooks/update.yml -i inventory
```

Only changed files are copied. Containers are recreated if `.env` or `docker-compose.yml` changed, or restarted if only `degov.yml` changed. Does nothing if no files changed.

### Full rebuild (code changes)

When you change application code or Dockerfiles, run the full deploy to rebuild images:

```bash
cd ansible
ansible-playbook playbooks/deploy.yml -i inventory
```
