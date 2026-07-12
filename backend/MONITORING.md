# Platform monitoring

The internal monitor runs every five minutes and checks:

- API health over public HTTPS;
- required Docker containers and Docker health states;
- both PostgreSQL databases and a real query;
- MQTT publish/subscribe loop;
- root filesystem usage;
- measurement ingest freshness;
- assigned Nodes that stopped reporting;
- daily backup and weekly offsite restore-test markers.

Alerts are sent through Resend only when the issue set changes. A separate recovery email is sent when all checks become healthy.

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

- the VPS systemd timer checks API, ingest, MQTT, PostgreSQL, containers, disk, nodes, backup and restore freshness;
- `.github/workflows/uptime.yml` checks the public API from outside the VPS, so a full server or network outage is still reported.

Configure GitHub repository secrets `RESEND_API_KEY` and `MONITOR_EMAIL_TO` (`agrigas1@gmail.com`) before enabling external alerts.
