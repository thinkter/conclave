# SFU Infrastructure Summary

## Current AWS Layout

- Proxy/dashboard: `conclave-sfu-proxy`
  - Instance: `i-04a730a496a4bdda3`
  - Type: `t3.micro`
  - Elastic IP: `13.207.75.240`
  - Runs Nginx, Prometheus, Loki, Grafana, and node-exporter.
- Active SFU: `conclave-sfu-1`
  - Instance: `i-0d440ca9c3dc947d3`
  - Type: `t3.micro`
  - Private IP: `172.31.41.129`
  - Public IP: `52.66.110.233`
- Stopped SFU standby nodes:
  - `conclave-sfu-2` / `i-0f8372c3bab63ee95` / private IP `172.31.40.122`
  - `conclave-sfu-3` / `i-077e30fa6a0b0bf1b` / private IP `172.31.45.155`
- TURN server:
  - Instance: `i-0545a4ea22c88c829`
  - Elastic IP: `3.111.140.242`
- Old SFU:
  - Instance: `i-05db2cf4ca5d32c75`
  - Stopped.
  - Old Elastic IP `13.235.175.67` was released.

## DNS

All SFU hostnames point to the proxy, not directly to SFU nodes:

```txt
sfu-1.ashman.foo -> 13.207.75.240
sfu-2.ashman.foo -> 13.207.75.240
sfu-3.ashman.foo -> 13.207.75.240
sfu-dashboard.ashman.foo -> 13.207.75.240
```

The proxy routes by hostname to the SFU private IPs.

## Runtime

The SFU is not built as a Docker image. Each SFU node runs:

```bash
npm install --workspaces=false
npm run start
```

via the `conclave-sfu.service` systemd unit.

The SFU nodes use Node 22 because mediasoup requires Node `>=22`.

## Web Routing

The web app join route supports an SFU pool:

```env
SFU_POOL=sfu-1=https://sfu-1.ashman.foo,sfu-2=https://sfu-2.ashman.foo,sfu-3=https://sfu-3.ashman.foo
SFU_INTERNAL_POOL=sfu-1=https://sfu-1.ashman.foo,sfu-2=https://sfu-2.ashman.foo,sfu-3=https://sfu-3.ashman.foo
```

Behavior:

- Healthy SFUs are checked through `/status`.
- Room routing uses deterministic hashing over the healthy SFU set.
- Stopped SFUs can remain in `SFU_POOL`; health checks skip them.
- If all SFUs are unhealthy, joins fail.

## Important Caveat

Rooms are not centrally registered yet. Routing is deterministic, but not authoritative.

This means duplicate rooms can happen if:

- the healthy SFU set changes while a room is active,
- old and new SFUs are both receiving traffic,
- some deployments use `SFU_URL` while others use `SFU_POOL`,
- or a room is already active on an SFU that later becomes absent from the healthy set.

The proper fix is a central registry, for example Redis:

```txt
roomId -> sfuInstanceId
```

Every join should check the registry first before choosing a new SFU.

## Monitoring

Grafana:

```txt
https://sfu-dashboard.ashman.foo/grafana/
```

Data sources:

- Prometheus for SFU and node metrics.
- Loki for SFU logs.

Useful Loki queries:

```logql
{job="sfu"}
{job="sfu", instance="sfu-1"}
{job="sfu"} |= "joined room"
{job="sfu"} |= "Chat in room"
{job="sfu"} | json | level = "error"
```

Useful Prometheus queries:

```promql
conclave_sfu_rooms
conclave_sfu_participants
conclave_sfu_producers
conclave_sfu_consumers
conclave_sfu_process_memory_bytes
```

## Logging

SFU logs are JSON-formatted:

```env
SFU_LOG_FORMAT=json
SFU_LOG_LEVEL=debug
```

Promtail tails:

```txt
/var/log/conclave-sfu.log
```

and sends logs to Loki on the proxy.

Public chat messages are logged in this format:

```txt
Chat in room <roomId>: <displayName>: <first 50 chars>
```

Direct messages do not log message bodies. They only log metadata:

```txt
DM in room <roomId>: <sender> -> <receiver> (messageId=<id>)
```

## Current Cost Shape

Current running resources:

- `1 x t3.micro` proxy/dashboard
- `1 x t3.micro` SFU
- `1 x t3.micro` TURN
- `6 x 8 GiB gp3` EBS volumes
- `3 x Elastic IPs` for proxy, TURN, and active `sfu-1`

Rough steady monthly estimate:

```txt
~$36/month before credits, taxes, and data transfer
```

If `t3.micro` usage is covered by free tier/credits, practical near-term cost may be closer to:

```txt
~$18/month + data transfer/tax
```

## Operational Notes

- Stopping an EC2 instance has no separate cold-start fee.
- Stopped instances still charge for EBS volumes.
- Public IPv4 and Elastic IP usage is charged while in use.
- The active SFU uses an Elastic IP so its mediasoup `ANNOUNCED_IP` remains stable across stop/start and instance resize operations.
- Do not release the proxy Elastic IP unless all SFU DNS records are being repointed.
