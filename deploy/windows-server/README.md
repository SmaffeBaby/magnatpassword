# Magnat on Windows Server 2022

Deployment prepared on 2026-11-06. Public origin: `https://192.168.10.250`.

## Storage and network

All Linux files, Docker volumes, application files and database files live inside
`E:\Magnat\Disks\Magnat-Linux.vhdx`. Windows system components remain on its system disk.
The VHDX is dynamic with a 60 GiB maximum; monitor free space on both E: and Linux `/`.

| Item | Location |
| --- | --- |
| Hyper-V VM | `Magnat-Linux`, configuration under `E:\Magnat\VM` |
| Linux address | `172.29.250.2/24` |
| Internal gateway | `172.29.250.1` |
| SSH through Windows | `192.168.10.250:2222` to `172.29.250.2:22` |
| Project in Linux | `/home/magnat/magnat` |
| Installer archive in Linux | `/home/magnat/releases` |
| Migration backup and logs | `/home/magnat/migration` |
| Web backend | Linux loopback `127.0.0.1:3003` |
| HTTPS / HTTP proxy | Linux `172.29.250.2:443` / `:80` |

The internal Hyper-V switch does not bridge or reconfigure the physical Ethernet
adapter. Windows must forward TCP ports 80 and 443 to the same ports in Linux,
with inbound firewall access limited to the office subnet `192.168.10.0/24`.

## HTTPS trust

Caddy issues the IP certificate using a private CA. The public root certificate is
`magnat-root.crt` beside this document and is also available at
`http://192.168.10.250/magnat-root.crt` after port forwarding is enabled.

Public root certificate file SHA-256:

```text
11518cb7ccdad0a812a0752f768aaddf74681952b0f93b380b879380813a6ccc
```

Install this CA in the trusted root store of each client that accesses the site.
Keep the Docker volume `magnat-password_magnat-tls-data`: it contains the CA private
key and certificate renewal state. Back it up securely along with the database,
storage volume, `.env` and `supabase/.env`. Do not publish those private files.
The certificate endpoint exposes only the public root certificate.

## Start and update

Inside Ubuntu:

```sh
cd /home/magnat/magnat
sudo docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build --wait
sudo docker compose -f docker-compose.yml -f docker-compose.server.yml ps
```

Always include the server override. It keeps the backend port private and runs
Caddy. Stop containers with `stop`; avoid `down -v`, which deletes persistent data.

The imported snapshot contains 28 migration files through `027_account_devices.sql`
(there are two files numbered 011). Their names and hashes were registered in
`magnat_internal.schema_migrations` after restoring the snapshot. The same metadata
was registered in the original local database. New migrations run once; changing
an already applied migration causes startup to fail. Add a new SQL migration instead.
When importing an existing database into another installation, register only the
migrations actually included in that snapshot before starting the application.

The source application remains a separate installation. The imported backup is a
snapshot, not ongoing replication. Do not use both as concurrent production databases.

## Verification and remaining cutover work

The restored snapshot has 5 users and 9 storage objects. SQL roles, ownership,
grants, application encryption keys and storage files were preserved. The web image
was built for amd64 on Ubuntu. The homepage, downloads page and `/api/health` were
checked through HTTPS using the CA; the database health check passed. The migration
runner skipped all 28 baseline files. Edge Runtime dependencies were copied from the
source Deno cache so startup does not depend on downloading them again.

Windows web port forwarding is enabled and verified from the LAN. The CA was installed on the Windows Server, the development Mac and Windows test VM, and on the paired iPhone by the user. Other Windows/macOS/iOS clients need to install this CA once. Android 0.2.1 bundles this public CA only for the configured server host.

Release 0.2.1 is published at `/downloads` for all four platforms. Builds ran sequentially: Windows, macOS, Android, then iOS. The downloaded bytes of all four server-hosted packages match their SHA-256 manifests. Windows was checked through WebView2, macOS was launched and its signature checked, and Android was checked in the emulator with the previous signing key. At zero unread notifications macOS now receives `None` instead of `Some(0)`, removing the badge. Windows removes the overlay; iOS uses a zero badge count; Android clears the active notification.

The paired iPhone was updated in place to 0.2.1 and launched successfully; HTTPS requests from the application were observed on the new server with no HTTP errors. Its development provisioning profile expires on **2026-11-10 at 10:02 UTC** and is limited to registered devices. Renew the profile and rebuild before expiration.

The older 0.2.0 archive is retained for rollback and still contains the old origin. Use the new installers and server for further work. A new origin may require signing in again.

Before publishing 0.2.1, the contents of 31 public application tables were compared between source and destination using row hashes; no differences were found. The live device heartbeat table was excluded from that comparison.
