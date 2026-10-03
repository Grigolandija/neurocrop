#!/usr/bin/env python3
"""Remove only obsolete NeuroCrop release tags; default is a read-only plan."""
import argparse
import datetime as dt
import fcntl
import json
import re
import subprocess
from pathlib import Path

RELEASE = re.compile(r'^(?:ghcr\.io/grigolandija/neurocrop-(?:backend|frontend):[0-9a-f]{40}|neurocrop-(?:backend|frontend):staging-[0-9a-f]{40})$')


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def select_removals(images, protected_ids, now):
    groups = {}
    for image in images:
        if RELEASE.fullmatch(image['ref']):
            groups.setdefault(image['ref'].split(':')[0], []).append(image)
    remove = []
    for group in groups.values():
        group.sort(key=lambda image: image['created'], reverse=True)
        for image in group[3:]:
            if image['id'] not in protected_ids and now - image['created'] >= dt.timedelta(days=1):
                remove.append(image['ref'])
    return sorted(remove)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    # Shared with deploy, rollback and the staging updater.
    with open('/var/lock/neurocrop-release-images.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        protected = set()
        for environment in ('production', 'staging'):
            for name in ('image.env', 'previous-image.env'):
                path = Path('/opt/neurocrop-deploy') / environment / name
                refs = [line.split('=', 1)[1].strip() for line in path.read_text().splitlines()
                        if line.startswith(('NEUROCROP_BACKEND_IMAGE=', 'NEUROCROP_FRONTEND_IMAGE='))]
                if not refs or any(not RELEASE.fullmatch(ref) for ref in refs):
                    raise RuntimeError(f'Cannot verify protected images in {path}')
                for ref in refs:
                    protected.add(docker('image', 'inspect', '--format', '{{.Id}}', ref))
        containers = docker('ps', '-aq').splitlines()
        if containers:
            protected.update(docker('inspect', '--format', '{{.Image}}', *containers).splitlines())
        refs = sorted(set(filter(RELEASE.fullmatch, docker('image', 'ls', '--format', '{{.Repository}}:{{.Tag}}').splitlines())))
        images = []
        for ref in refs:
            item = json.loads(docker('image', 'inspect', ref))[0]
            images.append({'ref': ref, 'id': item['Id'], 'created': dt.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+', r'\1', item['Created']).replace('Z', '+00:00'))})
        removals = select_removals(images, protected, dt.datetime.now(dt.timezone.utc))
        print(f'Release tags: {len(refs)}; keep: {len(refs)-len(removals)}; remove: {len(removals)}', flush=True)
        for ref in removals:
            print(('REMOVE ' if args.apply else 'WOULD REMOVE ') + ref, flush=True)
            if args.apply:
                # No force: Docker also refuses deletion of images used by containers.
                subprocess.run(['docker', 'image', 'rm', ref], check=True)


if __name__ == '__main__':
    main()
