---
description: Mission Control health check and container status
agent: ops
---

Perform a full health check on Mission Control:

1. Run `make mc-ps` to show container status.
2. Run `curl -s http://localhost:3000/health | jq .` to check the API health endpoint.
3. Check if the UI is accessible: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173`.

Summarize the results:
- Which containers are running vs stopped/unhealthy
- API health response details
- UI accessibility status
- Any issues detected and recommended actions
