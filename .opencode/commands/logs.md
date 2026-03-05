---
description: Tail logs for a service
agent: ops
---

Tail the logs for the specified service: $ARGUMENTS

Use the appropriate command based on the service:

- **mc** or **mission-control** — `make mc-logs` (all MC services) or `docker compose -f mission-control/docker-compose.yml logs -f <service>` for a specific service (control-api, mission-ui, postgres, redis, offline-detector, assigner, notification-dispatcher)
- **sentinel** — SSH into the VM and check journalctl: `orb -m aisquad sudo journalctl -u sentinel -f --no-pager -n 50`
- **openclaw** — SSH into the VM and check journalctl: `orb -m aisquad sudo journalctl -u openclaw -f --no-pager -n 50`

Show the last 50 lines of logs. Highlight any errors or warnings found.
