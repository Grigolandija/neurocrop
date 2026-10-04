# Platform monitoring

The internal monitor runs every five minutes and checks:

- API health over public HTTPS;
- required Docker containers and Docker health states;
- both PostgreSQL databases and a real query;
- MQTT publish/subscribe loop;
- root filesystem usage;
- measurement ingest freshness;
- daily backup and weekly offsite restore-test markers.

## Server configuration checks

Keep `/etc` at its standard directory mode 755 so service users can read public NSS and DNS configuration. Secret files remain 600 (or 640 for their dedicated group); never recursively change permissions. A 700 `/etc` prevents `man-db` from resolving its service account and prevents `fwupd-refresh` from resolving download hosts.

On this VPS, ifupdown owns the external network interface and networkd has no managed interfaces. `systemd-networkd-wait-online.service` should therefore be disabled; do not restart or disable the network services themselves.

Publish Mosquitto's plaintext port only on loopback (`127.0.0.1:1883:1883`). Containers continue using `mosquitto:1883` inside the Docker network. External clients use authenticated TLS on 8883. Docker-published ports bypass ordinary UFW INPUT rules, so a UFW deny rule alone does not protect 1883. Rejected unsupported TLS handshakes from public clients are expected security rejections; never lower the TLS version or allow anonymous access to suppress them.

The production Caddy API block is in `ops/caddy-api.conf`. Validate the complete Caddyfile before reloading it. Its five-second retry window handles safe GET/HEAD/OPTIONS reconnects during releases and does not replay write requests. The upstream connection pool expires idle connections after four seconds, before Node's default five-second keepalive timeout. Preserve other virtual hosts when installing the block.

Alerts are sent through Resend only when the issue set changes. Incident keys are stable: changing image counts, measurement ages and backup ages do not resend the same alert. Disk usage escalating to 90% creates a new critical incident. `MONITOR_DRY_RUN=1` checks health without sending email, updating incident state or sending heartbeat requests. A separate recovery email is sent when all checks become healthy.
Individual Node availability is a product-level condition, not a VPS failure, and
is intentionally excluded from this internal infrastructure monitor.

## Install

```sh
install -m 600 /opt/neurocrop-backend/ops/neurocrop-monitor.env.example /etc/neurocrop-monitor.env
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-monitor.service /etc/systemd/system/
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-monitor.timer /etc/systemd/system/
install -d -m 700 /var/lib/neurocrop-monitor
systemctl daemon-reload
systemctl enable --now neurocrop-monitor.timer
systemctl start neurocrop-monitor.service
journalctl -u neurocrop-monitor.service -n 100 --no-pager
```

## External monitoring

The internal timer cannot report a complete VPS, provider, DNS, or outbound-network failure. Configure an external uptime check for `https://api.neurocrop.lt/health` and optionally a dead-man heartbeat URL in `HEARTBEAT_URL` before the paid pilot.
# Monitoring layers

The system uses two independent layers:

- the VPS systemd timer checks API, ingest, MQTT, PostgreSQL, containers, disk, backup and restore freshness;
- `.github/workflows/uptime.yml` checks the public API from outside the VPS, so a full server or network outage is still reported.

The GitHub workflow stores the previous external availability state in an Actions cache. It sends one outage email when a failure is first confirmed, suppresses duplicate outage emails while the failure continues, and sends one recovery email with the outage duration when both public probes become healthy again.

Configure GitHub repository secrets `RESEND_API_KEY` and `MONITOR_EMAIL_TO` (`agrigas1@gmail.com`) before enabling external transition emails.


## Release image retention

`deploy/cleanup-release-images.py` defaults to a read-only plan; `--apply` removes
only NeuroCrop SHA-tagged releases. It preserves every container's image, both
current and previous production/staging image files, the newest three images per
repository, and every image younger than 24 hours. Missing or unresolvable state
files stop cleanup. It never deletes containers, volumes or database backups.

Deploy, rollback, staging updates and cleanup share
`/var/lock/neurocrop-release-images.lock` to prevent concurrent image removal.
Install the script to `/opt/neurocrop-deploy/cleanup-release-images.py` and the
`deploy/systemd/neurocrop-image-cleanup.{service,timer}` units into
`/etc/systemd/system/`. Run `systemctl daemon-reload` and
`systemctl enable --now neurocrop-image-cleanup.timer` for daily cleanup.
Inspect `journalctl -u neurocrop-image-cleanup.service` for results.
