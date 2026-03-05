---
description: Check status of all aisquad services
agent: ops
---

Run `make status` from the repository root to check the state of all services.

After running the command, provide a clear summary of:
1. VM service status (OpenClaw, Sentinel — are they running?)
2. Mission Control container status (all Docker Compose services)
3. Any services that are down or unhealthy

Also run `curl -s http://localhost:3000/health` to check the Mission Control API health endpoint.

If any service is not healthy, suggest the relevant troubleshooting steps from the runbooks.
