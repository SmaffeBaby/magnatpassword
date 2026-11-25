#!/usr/bin/python3 -I
"""Reclaim unused Magnat web images and stale Docker build cache."""
import argparse
import fcntl
from pathlib import Path
import re
import shutil
import subprocess

STATE = Path('/var/lib/magnat-deploy')
WEB_IMAGE = 'magnat-password-app'
KEEP_IMAGES = 3
DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}


def docker(*args):
    return subprocess.check_output([*DOCKER, *args], env=ENV, text=True).splitlines()


def old_web_tags(images, container_images):
    # Docker lists newest images first. Count distinct images, rather than tags.
    recent = set()
    protected = set(container_images)
    tagged_revisions = []
    for image_id, tag in images:
        if tag == 'latest':
            protected.add(image_id)
        if re.fullmatch('[a-f0-9]{40}', tag):
            if len(recent) < KEEP_IMAGES:
                recent.add(image_id)
            tagged_revisions.append((image_id, tag))
    return [tag for image_id, tag in tagged_revisions if image_id not in recent | protected]


def clean(dry_run):
    with (STATE / 'deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Deploy or disk cleanup is already running. Skipping.')
            return

        free_before = shutil.disk_usage(STATE).free
        image_rows = docker('image', 'ls', '--no-trunc', '--format', '{{.ID}} {{.Tag}}', WEB_IMAGE)
        container_ids = docker('container', 'ls', '--all', '--quiet')
        container_images = docker('container', 'inspect', '--format', '{{.Image}}', *container_ids) if container_ids else []
        candidates = old_web_tags([line.split() for line in image_rows], container_images)
        print(f'{len(candidates)} unused Magnat image tags outside the latest {KEEP_IMAGES} images.', flush=True)
        if dry_run:
            for tag in candidates:
                print(f'Would remove {WEB_IMAGE}:{tag}')
            print('Would prune Docker build cache unused for at least 72 hours.')
            return

        failures = []
        for tag in candidates:
            try:
                for line in docker('image', 'rm', '--no-prune', f'{WEB_IMAGE}:{tag}'):
                    print(line, flush=True)
            except subprocess.CalledProcessError:
                failures.append(tag)
        for line in docker('builder', 'prune', '--force', '--filter', 'until=72h'):
            print(line, flush=True)
        free_after = shutil.disk_usage(STATE).free
        print(f'Free space: {free_after / 1024**3:.2f} GiB (before: {free_before / 1024**3:.2f} GiB).', flush=True)
        if failures:
            raise SystemExit(f'Could not remove {len(failures)} image tags.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='print planned cleanup without deleting anything')
    clean(parser.parse_args().dry_run)
