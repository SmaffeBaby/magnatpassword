#!/usr/bin/python3 -I
"""Root-owned receiver. Install as /usr/local/sbin/magnat-deploy, never run from CI checkout."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time

STATE = Path('/var/lib/magnat-deploy')
PROJECT = Path('/home/magnat/magnat')
REPOSITORY = 'https://github.com/SmaffeBaby/magnatpassword.git'
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C.UTF-8', 'GIT_TERMINAL_PROMPT': '0',
       'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
EXCLUDES = ['.env', 'supabase/.env', '.git/', '.local/', 'backups/', 'releases/',
            'node_modules/', '.data/', '.nuxt*/', '.output*/', 'src-tauri/target/',
            'supabase/volumes/db/data/', 'supabase/volumes/storage/',
            'supabase/volumes/snippets/', '._*', '.DS_Store']


def run(args, *, cwd=None, capture=False, stdin=None, stdout=None):
    result = subprocess.run([str(x) for x in args], cwd=cwd, env=ENV,
                            input=stdin, stdout=subprocess.PIPE if capture else stdout,
                            check=True)
    return result.stdout.decode().strip() if capture else None


def plan(paths, initial=False):
    web = initial
    stack = initial
    proxy = initial
    restart = set()
    for path in paths:
        if path in {'docker-compose.yml', 'docker-compose.server.yml'} or (
                path.startswith('supabase/docker-compose') and path.endswith('.yml')):
            stack = True
        if path == 'Dockerfile' or path in {'package.json', 'package-lock.json', 'nuxt.config.ts',
                                          'content.config.ts', 'tsconfig.json', '.dockerignore'}:
            web = True
        if path.startswith(('app/', 'server/', 'shared/', 'modules/', 'i18n/', 'public/')):
            web = True
        if path.startswith('scripts/') and path.endswith(('.py', '.xml', '.json')):
            web = True
        if path.startswith('scripts/templates/'):
            web = True
        if path in {'deploy/windows-server/Caddyfile', 'deploy/windows-server/magnat-root.crt'}:
            proxy = True
        if path.startswith('supabase/volumes/api/'):
            restart.add('api-gw')
        if path.startswith('supabase/volumes/functions/'):
            restart.add('functions')
        if path.startswith('supabase/volumes/pooler/'):
            restart.add('supavisor')
    return {'web': web, 'stack': stack, 'proxy': proxy, 'restart': sorted(restart)}


def sync(source, target):
    target.mkdir(parents=True, exist_ok=True)
    args = ['rsync', '-a', '--delete']
    for pattern in EXCLUDES:
        args.extend(['--exclude', pattern])
    run([*args, str(source) + '/', str(target) + '/'])


def compose(*args, capture=False):
    return run(['docker', 'compose', '-f', 'docker-compose.yml', '-f',
                'docker-compose.server.yml', *args], cwd=PROJECT, capture=capture)


def git(*args, capture=True):
    return run(['git', '--git-dir', STATE / 'repository.git', *args], capture=capture)


def validate_migrations(applied, directory):
    files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.glob('*.sql')}
    for name, checksum in applied.items():
        if files.get(name) != checksum:
            raise RuntimeError(f'Applied migration missing or changed: {name}. Add a new migration.')
    return sorted(set(files) - set(applied))


def health():
    ca = (PROJECT / 'deploy/windows-server/magnat-root.crt').read_text()
    script = """
const https = require('node:https');
const tls = require('node:tls');
const req = https.get({hostname:'proxy', port:443, path:'/api/health',
  servername:'192.168.10.250', headers:{Host:'192.168.10.250'}, ca:CA,
  checkServerIdentity: (_, cert) => tls.checkServerIdentity('192.168.10.250', cert)}, r => {
  let body=''; r.on('data', d => body+=d); r.on('end', () => {
    try { if(r.statusCode!==200 || !JSON.parse(body).ok) process.exit(1);
      console.log('HTTPS and database health check passed.'); } catch { process.exit(1); }
  });
}); req.setTimeout(15000, () => req.destroy()); req.on('error', e => {console.error(e.message); process.exit(1)});
""".replace('ca:CA', 'ca:' + json.dumps(ca))
    run(['docker', 'exec', '-i', 'magnat-password-app-1', 'node', '-'], stdin=script.encode())


def deploy(sha, dry_run=False):
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Expected a full, lowercase Git commit SHA.')
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(STATE, 0o700)
    with (STATE / 'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        repo = STATE / 'repository.git'
        if not repo.exists():
            run(['git', 'init', '--bare', repo])
            git('remote', 'add', 'origin', REPOSITORY)
        # Do not trust job inputs, checkout files, inherited Git config, or runner credentials.
        if git('remote', 'get-url', 'origin') != REPOSITORY:
            raise RuntimeError('Unexpected deployment repository.')
        git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/heads/main', capture=False)
        head = git('rev-parse', 'refs/heads/main')
        if sha != head:
            print('Skipping stale job: a newer main commit exists.', flush=True)
            return
        last = STATE / 'last-successful.json'
        previous = json.loads(last.read_text())['sha'] if last.exists() else None
        if previous == sha:
            health()
            print('This commit is already deployed.', flush=True)
            return
        paths = git('diff', '--name-only', '--no-renames', previous, sha).splitlines() if previous else []
        actions = plan(paths, initial=previous is None)
        revision = STATE / 'revisions' / sha
        revision.mkdir(parents=True, exist_ok=True)
        archive = STATE / 'source.tar'
        git('archive', '--format=tar', '-o', archive, sha, capture=False)
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                if member.issym() or member.islnk():
                    raise RuntimeError('Symlinks are not supported in deployment sources.')
                if member.name in {'.env', 'supabase/.env'}:
                    raise RuntimeError('Production environment files must not be committed.')
            tar.extractall(revision, filter='data')
        applied_raw = run(['docker', 'exec', 'magnat-password-supabase-db', 'psql',
                          '-U', 'postgres', '-d', 'postgres', '-Atc',
                          "SELECT filename || '|' || sha256 FROM magnat_internal.schema_migrations"], capture=True)
        applied = dict(line.split('|', 1) for line in applied_raw.splitlines() if line)
        pending = validate_migrations(applied, revision / 'supabase/migrations')
        print(json.dumps({'sha': sha, 'plan': actions, 'pendingMigrations': pending}), flush=True)
        if dry_run:
            return
        if shutil.disk_usage(STATE).free < 6 * 1024 ** 3:
            raise RuntimeError('Less than 6 GiB free: refusing to deploy before disk space is reclaimed.')
        old_image = run(['docker', 'inspect', '--format', '{{.Image}}', 'magnat-password-app-1'], capture=True)
        if actions['web']:
            run(['docker', 'build', '--label', f'org.opencontainers.image.revision={sha}',
                 '-t', f'magnat-password-app:{sha}', revision])
        # A second push during compilation must not make this job deploy an obsolete revision.
        git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/heads/main', capture=False)
        if sha != git('rev-parse', 'refs/heads/main'):
            print('Skipping obsolete build; newer main is queued.', flush=True)
            return
        backup = STATE / 'backups' / (time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + sha[:12])
        backup.mkdir(mode=0o700, parents=True)
        sync(PROJECT, backup / 'source')
        for name in ['.env', 'supabase/.env']:
            dest = backup / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(PROJECT / name, dest)
            os.chmod(dest, 0o600)
        with (backup / 'database.dump').open('wb') as out:
            run(['docker', 'exec', 'magnat-password-supabase-db', 'pg_dump', '-U',
                 'supabase_admin', '-d', 'postgres', '-Fc'], stdout=out)
        with (backup / 'roles.sql').open('wb') as out:
            run(['docker', 'exec', 'magnat-password-supabase-db', 'pg_dumpall', '-U',
                 'supabase_admin', '--roles-only'], stdout=out)
        print(f'Pre-deployment backup: {backup}', flush=True)
        try:
            sync(revision, PROJECT)
            compose('config', '--quiet')
            # Prevent accidental project renames or creation of replacement data volumes.
            config = json.loads(compose('config', '--format', 'json', capture=True))
            if config['name'] != 'magnat-password':
                raise RuntimeError('Changing the production Compose project name is not supported.')
            if config['services']['app'].get('image') not in {None, 'magnat-password-app:latest'}:
                raise RuntimeError('An explicit custom web image requires updating the deployment receiver.')
            for volume, expected in {'db-data': 'magnat-password_db-data',
                                     'storage-data': 'magnat-password_storage-data',
                                     'magnat-tls-data': 'magnat-password_magnat-tls-data'}.items():
                if config['volumes'][volume]['name'] != expected:
                    raise RuntimeError(f'Changing the persistent volume {volume} is not supported.')
            if actions['stack']:
                services = [s for s in config['services'] if s not in {'app', 'proxy', 'migrate'}]
                compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '180', *services)
            elif actions['restart']:
                compose('up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait',
                        '--wait-timeout', '120', *actions['restart'])
            if pending:
                compose('run', '--rm', '--no-deps', 'migrate')
            if actions['web']:
                run(['docker', 'tag', f'magnat-password-app:{sha}', 'magnat-password-app:latest'])
            if actions['web'] or actions['stack']:
                compose('up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '120', 'app')
            if actions['proxy'] or actions['stack']:
                compose('up', '-d', '--no-deps', '--no-build', 'proxy')
                run(['docker', 'exec', 'magnat-password-proxy-1', 'caddy', 'reload',
                     '--config', '/etc/caddy/Caddyfile'])
            health()
        except Exception:
            print('Deployment failed. Restoring previous sources and web image.', flush=True)
            sync(backup / 'source', PROJECT)
            run(['docker', 'tag', old_image, 'magnat-password-app:latest'])
            compose('up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '120', 'app')
            if actions['proxy'] or actions['stack']:
                run(['docker', 'exec', 'magnat-password-proxy-1', 'caddy', 'reload',
                     '--config', '/etc/caddy/Caddyfile'])
            print(f'Database migrations are NOT automatically reversed. Recovery backup: {backup}', flush=True)
            raise
        state = {'sha': sha, 'deployedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                 'plan': actions, 'backup': str(backup)}
        temp = STATE / 'last-successful.tmp'
        temp.write_text(json.dumps(state, indent=2) + '\n')
        os.replace(temp, last)
        # Only trusted main can update the installed receiver itself.
        receiver = PROJECT / 'deploy/github/deploy.py'
        if receiver.exists():
            dest = Path('/usr/local/sbin/magnat-deploy.next')
            shutil.copyfile(receiver, dest)
            os.chmod(dest, 0o755)
            os.replace(dest, '/usr/local/sbin/magnat-deploy')
        print(f'Deployed {sha}; HTTPS and database are healthy.', flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    if os.geteuid() != 0:
        sys.exit('Run through the installed sudo receiver.')
    args = sys.argv[1:]
    dry_run = len(args) == 2 and args[0] == '--plan'
    if not (len(args) == 1 or dry_run):
        sys.exit('Usage: magnat-deploy [--plan] COMMIT_SHA')
    deploy(args[-1], dry_run=dry_run)
