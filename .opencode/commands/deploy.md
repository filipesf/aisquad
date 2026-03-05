---
description: Deploy a service (sentinel, mc, or full update)
agent: ops
---

Deploy the specified service: $ARGUMENTS

Follow these procedures based on the target:

**sentinel** — Run `make sentinel-deploy` which builds, syncs to VM, and restarts the service.

**mc** or **mission-control** — Run `docker compose -f mission-control/docker-compose.yml up -d --build` to rebuild and restart Mission Control.

**commands** — Run `make sentinel-commands` to register Discord slash commands.

**all** or **update** — Run `make update` which pulls latest, rebuilds everything, and restarts all services.

After deployment, verify the service is running by checking status. Report the result.
