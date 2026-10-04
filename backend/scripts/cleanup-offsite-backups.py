#!/usr/bin/env python3
"""Prune only complete, expired DB dump/checksum pairs in the encrypted remote."""
import argparse
import datetime as dt
import json
import re
import subprocess

UTC = dt.timezone.utc


def cleanup_plan(entries, databases, days, now=None):
    if not 30 <= days <= 3650:
        raise ValueError('offsite retention must be between 30 and 3650 days')
    if not databases or any(not re.fullmatch(r'[a-zA-Z0-9_]+', d) for d in databases):
        raise ValueError('invalid database allowlist')
    now = now or dt.datetime.now(UTC)
    files = {e['Path']: e for e in entries if not e.get('IsDir')}
    plan = []
    for database in databases:
        pattern = re.compile(re.escape(database) + r'-(\d{8}T\d{6}Z)\.dump$')
        pairs = []
        for path, entry in files.items():
            match = pattern.fullmatch(path)
            checksum = files.get(path + '.sha256')
            if not match or not checksum or entry.get('Size', 0) <= 0 or checksum.get('Size', 0) <= 0:
                continue
            timestamp = dt.datetime.strptime(match[1], '%Y%m%dT%H%M%SZ').replace(tzinfo=UTC)
            pairs.append((timestamp, path))
        pairs.sort(reverse=True)
        if not pairs or not dt.timedelta(0) <= now - pairs[0][0] <= dt.timedelta(hours=36):
            raise ValueError('no recent complete offsite backup for ' + database + '; cleanup refused')
        # Always protect the newest three complete backups, even with unusual dates.
        for timestamp, path in pairs[3:]:
            if timestamp < now - dt.timedelta(days=days):
                plan.extend([path, path + '.sha256'])
    return sorted(plan)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remote', required=True)
    parser.add_argument('--days', type=int, default=90)
    parser.add_argument('--databases', nargs='+', default=['neurocrop', 'chirpstack'])
    parser.add_argument('--apply', action='store_true', help='default is a read-only preview')
    args = parser.parse_args()
    if not args.remote or ':' not in args.remote:
        parser.error('an explicit rclone remote is required')
    entries = json.loads(subprocess.check_output(['rclone', 'lsjson', args.remote, '--files-only']))
    plan = cleanup_plan(entries, args.databases, args.days)
    print('[offsite-retention] expired complete backup pairs: {} (retention {} days)'.format(len(plan) // 2, args.days), flush=True)
    for path in plan:
        print('[offsite-retention] ' + ('deleting ' if args.apply else 'would delete ') + path, flush=True)
        if args.apply:
            subprocess.run(['rclone', 'deletefile', args.remote.rstrip('/') + '/' + path], check=True)


if __name__ == '__main__':
    main()
