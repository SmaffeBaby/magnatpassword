# Deploy main from GitHub Actions

The workflow runs on pushes to `main` and can be dispatched manually for `main`.
The production runner lives in the existing Ubuntu VM, so all of its files and
deployment backups are physically on CRM (E:). It needs outgoing HTTPS to GitHub;
no extra incoming ports or SSH secrets in GitHub are required.

## Public repository boundary

The runner runs as `magnat-ci`, a separate system account with no Docker group or
general sudo access. Its systemd service blocks private networks and loopback
services, except the DNS stub. The application environment files and root deployment
state are inaccessible to this user. The workflow does not check out or execute
repository code as this account. Do not add PR jobs or unrelated work to this runner.

Its only sudo command is the root-owned `/usr/local/sbin/magnat-deploy`. This receiver
fetches the hardcoded repository independently, checks that the supplied SHA is the
current `origin/main`, and uses a clean environment and root-owned Git directory.
Obsolete queued jobs skip deployment. A host lock prevents overlapping deployments.
Only trusted code merged into main is used for Docker builds and deployment.

## Deployment behavior

| Changed files | Operation |
| --- | --- |
| Nuxt app, server, shared code, dependencies, Dockerfile, report scripts/templates | Build and replace the web container |
| New SQL migrations | Back up the database and apply unapplied files before starting the new app |
| Compose files | Reconcile Supabase service configuration, then app and proxy |
| Caddyfile | Reload the proxy |
| Kong, Edge Functions or pooler configuration | Recreate the affected service |
| Native shells or documentation only | Sync source; no web image rebuild |

The first deployment builds the web image and reconciles the existing Compose stack.
Subsequent deployments compare against the last successful SHA. Compose preserves
existing named volumes; the receiver refuses project or persistent-volume renames.
Server `.env`, `supabase/.env`, storage, database volumes and published installers are
preserved. Native Windows/macOS/Android/iOS installers are not automatically rebuilt.
Their hosted website still receives ordinary web updates without new installers.

The old web image keeps serving during compilation. Before cutover, the receiver
saves source, environment, database and role backups under
`/var/lib/magnat-deploy/backups`. After deployment it checks HTTPS through the proxy
and database connectivity. If a deployment fails, it restores the previous sources
and web image; SQL migrations are **not automatically reversed**, to avoid overwriting
new user data. Backward-compatible migrations are required for safe web rollback.
Backups are retained; monitor VM disk space. Deployment refuses to start a build
when less than 6 GiB is free.

The receiver records success in `/var/lib/magnat-deploy/last-successful.json` and
updates its protected installed copy from the successfully deployed main commit.

## Operations

On Ubuntu, as an administrator:

```sh
sudo systemctl status actions.runner.SmaffeBaby-magnatpassword.magnat-production.service
sudo journalctl -u actions.runner.SmaffeBaby-magnatpassword.magnat-production.service -n 50
sudo cat /var/lib/magnat-deploy/last-successful.json
sudo /usr/local/sbin/magnat-deploy --plan FULL_MAIN_COMMIT_SHA
```

Run local planning and migration-guard tests with:

```sh
python3 -m unittest discover -s tests -p test_deploy.py -v
```

`install-runner.sh` is a one-time bootstrap installer. It requires a short-lived
registration token in `/home/magnat/migration/github/registration.token`; do not
commit that token. The runner download is checked against GitHub's published SHA-256.
