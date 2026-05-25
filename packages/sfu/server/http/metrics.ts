import { config as defaultConfig } from "../../config/config.js";
import { toClusterSnapshot } from "../admin/controlPlane.js";
import type { SfuState } from "../state.js";

type MetricLine = {
  name: string;
  help: string;
  type: "counter" | "gauge";
  value: number;
  labels?: Record<string, string | number | boolean | null | undefined>;
};

const escapeLabel = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

const formatLabels = (
  labels: MetricLine["labels"],
): string => {
  const entries = Object.entries(labels ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) {
    return "";
  }

  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabel(String(value))}"`)
    .join(",")}}`;
};

const renderMetrics = (metrics: MetricLine[]): string => {
  const headers = new Set<string>();
  const lines: string[] = [];

  for (const metric of metrics) {
    if (!headers.has(metric.name)) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
      headers.add(metric.name);
    }
    lines.push(`${metric.name}${formatLabels(metric.labels)} ${metric.value}`);
  }

  return lines.join("\n");
};

export const renderPrometheusMetrics = (
  state: SfuState,
  config = defaultConfig,
): string => {
  const snapshot = toClusterSnapshot(state);
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const baseLabels = {
    instance: config.instanceId,
    version: config.version,
  };

  const metrics: MetricLine[] = [
    {
      name: "conclave_sfu_up",
      help: "Whether the SFU process is up.",
      type: "gauge",
      value: 1,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_draining",
      help: "Whether the SFU is rejecting new room joins for draining.",
      type: "gauge",
      value: snapshot.draining ? 1 : 0,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_uptime_seconds",
      help: "SFU process uptime in seconds.",
      type: "gauge",
      value: process.uptime(),
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_rooms",
      help: "Current active room count.",
      type: "gauge",
      value: snapshot.counts.rooms,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_participants",
      help: "Current active participant count.",
      type: "gauge",
      value: snapshot.counts.participants,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_pending_users",
      help: "Current pending user count.",
      type: "gauge",
      value: snapshot.counts.pendingUsers,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_admins",
      help: "Current active admin count.",
      type: "gauge",
      value: snapshot.counts.admins,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_webinar_attendees",
      help: "Current webinar attendee count.",
      type: "gauge",
      value: snapshot.counts.webinarAttendees,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_producers",
      help: "Current mediasoup producer count.",
      type: "gauge",
      value: snapshot.counts.producers,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_consumers",
      help: "Current mediasoup consumer count.",
      type: "gauge",
      value: snapshot.counts.consumers,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_workers_total",
      help: "Total mediasoup worker count.",
      type: "gauge",
      value: snapshot.workers.total,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_workers_healthy",
      help: "Healthy mediasoup worker count.",
      type: "gauge",
      value: snapshot.workers.healthy,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_workers_closed",
      help: "Closed mediasoup worker count.",
      type: "gauge",
      value: snapshot.workers.closed,
      labels: baseLabels,
    },
    {
      name: "conclave_sfu_process_memory_bytes",
      help: "Node.js process memory usage by area.",
      type: "gauge",
      value: memoryUsage.rss,
      labels: { ...baseLabels, area: "rss" },
    },
    {
      name: "conclave_sfu_process_memory_bytes",
      help: "Node.js process memory usage by area.",
      type: "gauge",
      value: memoryUsage.heapUsed,
      labels: { ...baseLabels, area: "heap_used" },
    },
    {
      name: "conclave_sfu_process_memory_bytes",
      help: "Node.js process memory usage by area.",
      type: "gauge",
      value: memoryUsage.heapTotal,
      labels: { ...baseLabels, area: "heap_total" },
    },
    {
      name: "conclave_sfu_process_cpu_seconds_total",
      help: "Node.js process CPU time by mode.",
      type: "counter",
      value: cpuUsage.user / 1_000_000,
      labels: { ...baseLabels, mode: "user" },
    },
    {
      name: "conclave_sfu_process_cpu_seconds_total",
      help: "Node.js process CPU time by mode.",
      type: "counter",
      value: cpuUsage.system / 1_000_000,
      labels: { ...baseLabels, mode: "system" },
    },
  ];

  for (const [clientId, rooms] of Object.entries(snapshot.roomsByClientId)) {
    metrics.push({
      name: "conclave_sfu_rooms_by_client",
      help: "Current active room count by client id.",
      type: "gauge",
      value: rooms,
      labels: { ...baseLabels, client_id: clientId },
    });
  }

  return `${renderMetrics(metrics)}\n`;
};
