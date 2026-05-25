#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

AWS_REGION="${AWS_REGION:-$(aws configure get region)}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

CLUSTER_NAME="${CLUSTER_NAME:-conclave-sfu}"
DOMAIN="${DOMAIN:-ashman.foo}"
VPC_ID="${VPC_ID:-vpc-03deadeca0929d2ac}"
SUBNET_ID="${SUBNET_ID:-subnet-013be40da2fa779e7}"
AMI_ID="${AMI_ID:-ami-034a8236c75419857}"
KEY_NAME="${KEY_NAME:-asd}"
SFU_INSTANCE_TYPE="${SFU_INSTANCE_TYPE:-t3.small}"
PROXY_INSTANCE_TYPE="${PROXY_INSTANCE_TYPE:-t3.small}"
SFU_SECRET="${SFU_SECRET:-}"
RTC_MIN_PORT="${RTC_MIN_PORT:-40000}"
RTC_MAX_PORT="${RTC_MAX_PORT:-41000}"
SFU_PORT="${SFU_PORT:-3031}"
ADMIN_CIDR="${ADMIN_CIDR:-0.0.0.0/0}"
PUBLIC_CIDR="${PUBLIC_CIDR:-0.0.0.0/0}"
CODE_BUCKET="${CODE_BUCKET:-conclave-sfu-deploy-${AWS_ACCOUNT_ID}-${AWS_REGION}}"
CODE_KEY="${CODE_KEY:-${CLUSTER_NAME}/conclave-$(date +%Y%m%d%H%M%S).tar.gz}"
PROXY_SETUP_KEY="${PROXY_SETUP_KEY:-${CLUSTER_NAME}/proxy-setup-$(date +%Y%m%d%H%M%S).sh}"
SFU_1_SETUP_KEY="${SFU_1_SETUP_KEY:-${CLUSTER_NAME}/sfu-1-setup-$(date +%Y%m%d%H%M%S).sh}"
SFU_2_SETUP_KEY="${SFU_2_SETUP_KEY:-${CLUSTER_NAME}/sfu-2-setup-$(date +%Y%m%d%H%M%S).sh}"
SFU_3_SETUP_KEY="${SFU_3_SETUP_KEY:-${CLUSTER_NAME}/sfu-3-setup-$(date +%Y%m%d%H%M%S).sh}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${SFU_SECRET:-}" ]]; then
  echo "SFU_SECRET is required. Set it in .env or export SFU_SECRET." >&2
  exit 1
fi

tag_value() {
  local resource_id="$1"
  local name="$2"
  aws ec2 create-tags \
    --resources "$resource_id" \
    --tags "Key=Name,Value=${name}" "Key=Project,Value=conclave" "Key=Cluster,Value=${CLUSTER_NAME}" \
    >/dev/null
}

ensure_bucket() {
  if aws s3api head-bucket --bucket "$CODE_BUCKET" >/dev/null 2>&1; then
    return
  fi

  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$CODE_BUCKET" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "$CODE_BUCKET" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}" \
      >/dev/null
  fi
}

package_code() {
  local archive
  archive="$(mktemp -t conclave-sfu.XXXXXX.tar.gz)"
  tar \
    --exclude=".git" \
    --exclude=".env" \
    --exclude="node_modules" \
    --exclude="apps/*/node_modules" \
    --exclude="packages/*/node_modules" \
    -czf "$archive" \
    -C "$ROOT_DIR" \
    .
  ensure_bucket
  aws s3 cp "$archive" "s3://${CODE_BUCKET}/${CODE_KEY}" >/dev/null
  rm -f "$archive"
  aws s3 presign "s3://${CODE_BUCKET}/${CODE_KEY}" --expires-in 604800
}

ensure_security_group() {
  local group_name="$1"
  local description="$2"
  local group_id
  group_id="$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${group_name}" \
    --query "SecurityGroups[0].GroupId" \
    --output text)"

  if [[ "$group_id" == "None" || -z "$group_id" ]]; then
    group_id="$(aws ec2 create-security-group \
      --group-name "$group_name" \
      --description "$description" \
      --vpc-id "$VPC_ID" \
      --query GroupId \
      --output text)"
    tag_value "$group_id" "$group_name"
  fi

  printf "%s" "$group_id"
}

authorize_ingress() {
  local group_id="$1"
  shift
  aws ec2 authorize-security-group-ingress --group-id "$group_id" "$@" >/dev/null 2>&1 || true
}

allocate_eip() {
  local name="$1"
  local allocation_id public_ip
  allocation_id="$(aws ec2 allocate-address \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${name}},{Key=Project,Value=conclave},{Key=Cluster,Value=${CLUSTER_NAME}}]" \
    --query AllocationId \
    --output text)"
  public_ip="$(aws ec2 describe-addresses \
    --allocation-ids "$allocation_id" \
    --query "Addresses[0].PublicIp" \
    --output text)"
  printf "%s %s" "$allocation_id" "$public_ip"
}

render_sfu_user_data() {
  local instance_id="$1"
  local announced_ip="$2"
  local code_url="$3"
  local proxy_private_ip="$4"
  cat <<EOF
#!/bin/bash
set -euxo pipefail
dnf update -y
dnf install -y docker tar gzip xz
systemctl enable --now docker
mkdir -p /opt/conclave
curl -fsSL "${code_url}" -o /tmp/conclave.tar.gz
tar -xzf /tmp/conclave.tar.gz -C /opt/conclave
cd /tmp
node_file=\$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/linux-x64.tar.xz/ {print \$2; exit}')
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/\${node_file}"
rm -rf /opt/node-v22
mkdir -p /opt/node-v22
tar -xJf "\${node_file}" -C /opt/node-v22 --strip-components=1
ln -sf /opt/node-v22/bin/node /usr/local/bin/node
ln -sf /opt/node-v22/bin/npm /usr/local/bin/npm
ln -sf /opt/node-v22/bin/npx /usr/local/bin/npx
cat >/opt/conclave/packages/sfu/.env <<ENV
NODE_ENV=production
SFU_PORT=${SFU_PORT}
SFU_INSTANCE_ID=${instance_id}
SFU_SECRET=${SFU_SECRET}
ANNOUNCED_IP=${announced_ip}
RTC_MIN_PORT=${RTC_MIN_PORT}
RTC_MAX_PORT=${RTC_MAX_PORT}
SFU_VERSION=cluster
SFU_LOG_FORMAT=json
SFU_LOG_LEVEL=info
ENV
cd /opt/conclave/packages/sfu
/usr/local/bin/npm install --workspaces=false
cat >/etc/systemd/system/conclave-sfu.service <<UNIT
[Unit]
Description=Conclave SFU
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/conclave/packages/sfu
EnvironmentFile=/opt/conclave/packages/sfu/.env
ExecStart=/usr/local/bin/npm run start
Restart=always
RestartSec=5
User=root
StandardOutput=append:/var/log/conclave-sfu.log
StandardError=append:/var/log/conclave-sfu.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now conclave-sfu
docker rm -f node-exporter || true
docker run -d --name node-exporter --restart unless-stopped --network host --pid host -v /:/host:ro,rslave quay.io/prometheus/node-exporter:latest --path.rootfs=/host
mkdir -p /opt/promtail
cat >/opt/promtail/config.yml <<PROMTAIL
server:
  http_listen_port: 9080
  grpc_listen_port: 0
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://${proxy_private_ip}:3100/loki/api/v1/push
scrape_configs:
  - job_name: sfu-file
    static_configs:
      - targets:
          - localhost
        labels:
          job: sfu
          instance: ${instance_id}
          __path__: /var/log/conclave-sfu.log
PROMTAIL
docker rm -f promtail || true
docker run -d --name promtail --restart unless-stopped -v /opt/promtail:/etc/promtail -v /var/log:/var/log:ro grafana/promtail:latest -config.file=/etc/promtail/config.yml
EOF
}

render_sfu_bootstrap_user_data() {
  local setup_url="$1"
  cat <<EOF
#!/bin/bash
set -euxo pipefail
dnf update -y
dnf install -y ca-certificates
for attempt in \$(seq 1 120); do
  if curl -fsSL "${setup_url}" -o /tmp/conclave-sfu-setup.sh; then
    bash /tmp/conclave-sfu-setup.sh
    exit 0
  fi
  sleep 10
done
echo "Timed out waiting for SFU setup script." >&2
exit 1
EOF
}

render_proxy_bootstrap_user_data() {
  local proxy_setup_url="$1"
  cat <<EOF
#!/bin/bash
set -euxo pipefail
dnf update -y
dnf install -y ca-certificates
for attempt in \$(seq 1 120); do
  if curl -fsSL "${proxy_setup_url}" -o /tmp/conclave-proxy-setup.sh; then
    bash /tmp/conclave-proxy-setup.sh
    exit 0
  fi
  sleep 10
done
echo "Timed out waiting for proxy setup script." >&2
exit 1
EOF
}

render_proxy_setup_script() {
  local code_url="$1"
  local sfu_1_private="$2"
  local sfu_2_private="$3"
  local sfu_3_private="$4"
  cat <<EOF
#!/bin/bash
set -euxo pipefail
dnf update -y
dnf install -y docker nginx tar gzip
systemctl enable --now docker
mkdir -p /opt/conclave /opt/conclave-monitoring/prometheus /opt/conclave-monitoring/grafana/provisioning/datasources /opt/conclave-monitoring/grafana/provisioning/dashboards /opt/conclave-monitoring/grafana/dashboards
curl -fsSL "${code_url}" -o /tmp/conclave.tar.gz
tar -xzf /tmp/conclave.tar.gz -C /opt/conclave
cat >/etc/nginx/conf.d/conclave-sfu.conf <<NGINX
map \\\$http_upgrade \\\$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  server_name sfu-1.${DOMAIN};
  location / {
    proxy_pass http://${sfu_1_private}:${SFU_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\\$http_upgrade;
    proxy_set_header Connection \\\$connection_upgrade;
    proxy_set_header Host \\\$host;
    proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\\$scheme;
  }
  location = /metrics {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_1_private}:${SFU_PORT}/metrics;
  }
}

server {
  listen 80;
  server_name sfu-2.${DOMAIN};
  location / {
    proxy_pass http://${sfu_2_private}:${SFU_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\\$http_upgrade;
    proxy_set_header Connection \\\$connection_upgrade;
    proxy_set_header Host \\\$host;
    proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\\$scheme;
  }
  location = /metrics {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_2_private}:${SFU_PORT}/metrics;
  }
}

server {
  listen 80;
  server_name sfu-3.${DOMAIN};
  location / {
    proxy_pass http://${sfu_3_private}:${SFU_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\\$http_upgrade;
    proxy_set_header Connection \\\$connection_upgrade;
    proxy_set_header Host \\\$host;
    proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\\$scheme;
  }
  location = /metrics {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_3_private}:${SFU_PORT}/metrics;
  }
}

server {
  listen 80 default_server;
  server_name _;

  location /health {
    return 200 'ok\\n';
  }

  location = /metrics/sfu-1 {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_1_private}:${SFU_PORT}/metrics;
  }

  location = /metrics/sfu-2 {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_2_private}:${SFU_PORT}/metrics;
  }

  location = /metrics/sfu-3 {
    proxy_set_header x-sfu-secret "${SFU_SECRET}";
    proxy_pass http://${sfu_3_private}:${SFU_PORT}/metrics;
  }

  location /grafana/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host \\\$host;
  }
}
NGINX
nginx -t
systemctl enable --now nginx
cat >/opt/conclave-monitoring/prometheus/prometheus.yml <<PROM
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: sfu-1
    metrics_path: /metrics/sfu-1
    static_configs:
      - targets:
          - 127.0.0.1:80
        labels:
          instance: sfu-1
  - job_name: sfu-2
    metrics_path: /metrics/sfu-2
    static_configs:
      - targets:
          - 127.0.0.1:80
        labels:
          instance: sfu-2
  - job_name: sfu-3
    metrics_path: /metrics/sfu-3
    static_configs:
      - targets:
          - 127.0.0.1:80
        labels:
          instance: sfu-3
  - job_name: node
    static_configs:
      - targets:
          - ${sfu_1_private}:9100
        labels:
          instance: sfu-1
      - targets:
          - ${sfu_2_private}:9100
        labels:
          instance: sfu-2
      - targets:
          - ${sfu_3_private}:9100
        labels:
          instance: sfu-3
PROM
cat >/opt/conclave-monitoring/grafana/provisioning/datasources/datasources.yml <<DATASOURCES
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
DATASOURCES
cat >/opt/conclave-monitoring/grafana/provisioning/dashboards/dashboards.yml <<DASHBOARDS
apiVersion: 1
providers:
  - name: Conclave SFU
    orgId: 1
    folder: Conclave
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
DASHBOARDS
cat >/opt/conclave-monitoring/grafana/dashboards/sfu.json <<'DASHBOARD'
{
  "title": "Conclave SFU Cluster",
  "schemaVersion": 39,
  "refresh": "10s",
  "panels": [
    {"type":"stat","title":"Rooms","gridPos":{"x":0,"y":0,"w":6,"h":4},"targets":[{"expr":"sum(conclave_sfu_rooms)"}]},
    {"type":"stat","title":"Participants","gridPos":{"x":6,"y":0,"w":6,"h":4},"targets":[{"expr":"sum(conclave_sfu_participants)"}]},
    {"type":"stat","title":"Producers","gridPos":{"x":12,"y":0,"w":6,"h":4},"targets":[{"expr":"sum(conclave_sfu_producers)"}]},
    {"type":"stat","title":"Consumers","gridPos":{"x":18,"y":0,"w":6,"h":4},"targets":[{"expr":"sum(conclave_sfu_consumers)"}]},
    {"type":"timeseries","title":"Rooms by SFU","gridPos":{"x":0,"y":4,"w":12,"h":8},"targets":[{"expr":"conclave_sfu_rooms"}]},
    {"type":"timeseries","title":"Participants by SFU","gridPos":{"x":12,"y":4,"w":12,"h":8},"targets":[{"expr":"conclave_sfu_participants"}]},
    {"type":"timeseries","title":"Memory RSS","gridPos":{"x":0,"y":12,"w":12,"h":8},"targets":[{"expr":"conclave_sfu_process_memory_bytes{area=\"rss\"}"}]},
    {"type":"timeseries","title":"CPU Seconds","gridPos":{"x":12,"y":12,"w":12,"h":8},"targets":[{"expr":"rate(conclave_sfu_process_cpu_seconds_total[1m])"}]},
    {"type":"logs","title":"SFU Logs","gridPos":{"x":0,"y":20,"w":24,"h":10},"targets":[{"expr":"{job=\"sfu\"}"}]}
  ]
}
DASHBOARD
docker rm -f prometheus || true
docker run -d --name prometheus --restart unless-stopped --network host -v /opt/conclave-monitoring/prometheus:/etc/prometheus:ro prom/prometheus:latest --config.file=/etc/prometheus/prometheus.yml
docker rm -f loki || true
docker run -d --name loki --restart unless-stopped --network host grafana/loki:latest -config.file=/etc/loki/local-config.yaml
docker rm -f grafana || true
docker run -d --name grafana --restart unless-stopped -p 3000:3000 -e GF_SERVER_ROOT_URL=http://sfu-dashboard.${DOMAIN}/grafana/ -e GF_SERVER_SERVE_FROM_SUB_PATH=true -v /opt/conclave-monitoring/grafana/provisioning:/etc/grafana/provisioning:ro -v /opt/conclave-monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro grafana/grafana:latest
docker rm -f node-exporter || true
docker run -d --name node-exporter --restart unless-stopped --network host --pid host -v /:/host:ro,rslave quay.io/prometheus/node-exporter:latest --path.rootfs=/host
EOF
}

echo "Packaging current worktree and uploading to s3://${CODE_BUCKET}/${CODE_KEY}..."
CODE_URL="$(package_code)"
PROXY_SETUP_URL="$(aws s3 presign "s3://${CODE_BUCKET}/${PROXY_SETUP_KEY}" --expires-in 604800)"
SFU_1_SETUP_URL="$(aws s3 presign "s3://${CODE_BUCKET}/${SFU_1_SETUP_KEY}" --expires-in 604800)"
SFU_2_SETUP_URL="$(aws s3 presign "s3://${CODE_BUCKET}/${SFU_2_SETUP_KEY}" --expires-in 604800)"
SFU_3_SETUP_URL="$(aws s3 presign "s3://${CODE_BUCKET}/${SFU_3_SETUP_KEY}" --expires-in 604800)"

PROXY_SG_ID="$(ensure_security_group "${CLUSTER_NAME}-proxy-sg" "Conclave SFU proxy and monitoring")"
SFU_SG_ID="$(ensure_security_group "${CLUSTER_NAME}-node-sg" "Conclave SFU nodes")"

authorize_ingress "$PROXY_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${ADMIN_CIDR},Description=ssh}]"
authorize_ingress "$PROXY_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=${PUBLIC_CIDR},Description=http}]"
authorize_ingress "$PROXY_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=${PUBLIC_CIDR},Description=https}]"
authorize_ingress "$PROXY_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges=[{CidrIp=${ADMIN_CIDR},Description=grafana}]"
authorize_ingress "$PROXY_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=3100,ToPort=3100,UserIdGroupPairs=[{GroupId=${SFU_SG_ID},Description=loki-from-sfu}]"
authorize_ingress "$SFU_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${ADMIN_CIDR},Description=ssh}]"
authorize_ingress "$SFU_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=${SFU_PORT},ToPort=${SFU_PORT},UserIdGroupPairs=[{GroupId=${PROXY_SG_ID},Description=sfu-from-proxy}]"
authorize_ingress "$SFU_SG_ID" --ip-permissions "IpProtocol=tcp,FromPort=9100,ToPort=9100,UserIdGroupPairs=[{GroupId=${PROXY_SG_ID},Description=node-exporter-from-proxy}]"
authorize_ingress "$SFU_SG_ID" --ip-permissions "IpProtocol=udp,FromPort=${RTC_MIN_PORT},ToPort=${RTC_MAX_PORT},IpRanges=[{CidrIp=${PUBLIC_CIDR},Description=webrtc-udp}]"

read -r PROXY_EIP_ALLOC PROXY_EIP <<<"$(allocate_eip "${CLUSTER_NAME}-proxy-eip")"

PROXY_USER_DATA="$(mktemp)"
SFU_1_USER_DATA="$(mktemp)"
SFU_2_USER_DATA="$(mktemp)"
SFU_3_USER_DATA="$(mktemp)"

render_proxy_bootstrap_user_data "$PROXY_SETUP_URL" >"$PROXY_USER_DATA"

PROXY_INSTANCE_ID="$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$PROXY_INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$PROXY_SG_ID" \
  --user-data "file://${PROXY_USER_DATA}" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${CLUSTER_NAME}-proxy},{Key=Project,Value=conclave},{Key=Cluster,Value=${CLUSTER_NAME}}]" \
  --query "Instances[0].InstanceId" \
  --output text)"
aws ec2 wait instance-running --instance-ids "$PROXY_INSTANCE_ID"
aws ec2 associate-address --instance-id "$PROXY_INSTANCE_ID" --allocation-id "$PROXY_EIP_ALLOC" >/dev/null
PROXY_PRIVATE_IP="$(aws ec2 describe-instances --instance-ids "$PROXY_INSTANCE_ID" --query "Reservations[0].Instances[0].PrivateIpAddress" --output text)"

render_sfu_bootstrap_user_data "$SFU_1_SETUP_URL" >"$SFU_1_USER_DATA"
render_sfu_bootstrap_user_data "$SFU_2_SETUP_URL" >"$SFU_2_USER_DATA"
render_sfu_bootstrap_user_data "$SFU_3_SETUP_URL" >"$SFU_3_USER_DATA"

SFU_1_INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type "$SFU_INSTANCE_TYPE" --key-name "$KEY_NAME" --subnet-id "$SUBNET_ID" --security-group-ids "$SFU_SG_ID" --user-data "file://${SFU_1_USER_DATA}" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${CLUSTER_NAME}-1},{Key=Project,Value=conclave},{Key=Cluster,Value=${CLUSTER_NAME}}]" --query "Instances[0].InstanceId" --output text)"
SFU_2_INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type "$SFU_INSTANCE_TYPE" --key-name "$KEY_NAME" --subnet-id "$SUBNET_ID" --security-group-ids "$SFU_SG_ID" --user-data "file://${SFU_2_USER_DATA}" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${CLUSTER_NAME}-2},{Key=Project,Value=conclave},{Key=Cluster,Value=${CLUSTER_NAME}}]" --query "Instances[0].InstanceId" --output text)"
SFU_3_INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI_ID" --instance-type "$SFU_INSTANCE_TYPE" --key-name "$KEY_NAME" --subnet-id "$SUBNET_ID" --security-group-ids "$SFU_SG_ID" --user-data "file://${SFU_3_USER_DATA}" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${CLUSTER_NAME}-3},{Key=Project,Value=conclave},{Key=Cluster,Value=${CLUSTER_NAME}}]" --query "Instances[0].InstanceId" --output text)"
aws ec2 wait instance-running --instance-ids "$SFU_1_INSTANCE_ID" "$SFU_2_INSTANCE_ID" "$SFU_3_INSTANCE_ID"

SFU_1_PRIVATE_IP="$(aws ec2 describe-instances --instance-ids "$SFU_1_INSTANCE_ID" --query "Reservations[0].Instances[0].PrivateIpAddress" --output text)"
SFU_2_PRIVATE_IP="$(aws ec2 describe-instances --instance-ids "$SFU_2_INSTANCE_ID" --query "Reservations[0].Instances[0].PrivateIpAddress" --output text)"
SFU_3_PRIVATE_IP="$(aws ec2 describe-instances --instance-ids "$SFU_3_INSTANCE_ID" --query "Reservations[0].Instances[0].PrivateIpAddress" --output text)"
SFU_1_PUBLIC_IP="$(aws ec2 describe-instances --instance-ids "$SFU_1_INSTANCE_ID" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)"
SFU_2_PUBLIC_IP="$(aws ec2 describe-instances --instance-ids "$SFU_2_INSTANCE_ID" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)"
SFU_3_PUBLIC_IP="$(aws ec2 describe-instances --instance-ids "$SFU_3_INSTANCE_ID" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)"

render_sfu_user_data "sfu-1" "$SFU_1_PUBLIC_IP" "$CODE_URL" "$PROXY_PRIVATE_IP" >"$SFU_1_USER_DATA"
render_sfu_user_data "sfu-2" "$SFU_2_PUBLIC_IP" "$CODE_URL" "$PROXY_PRIVATE_IP" >"$SFU_2_USER_DATA"
render_sfu_user_data "sfu-3" "$SFU_3_PUBLIC_IP" "$CODE_URL" "$PROXY_PRIVATE_IP" >"$SFU_3_USER_DATA"
aws s3 cp "$SFU_1_USER_DATA" "s3://${CODE_BUCKET}/${SFU_1_SETUP_KEY}" >/dev/null
aws s3 cp "$SFU_2_USER_DATA" "s3://${CODE_BUCKET}/${SFU_2_SETUP_KEY}" >/dev/null
aws s3 cp "$SFU_3_USER_DATA" "s3://${CODE_BUCKET}/${SFU_3_SETUP_KEY}" >/dev/null
render_proxy_setup_script "$CODE_URL" "$SFU_1_PRIVATE_IP" "$SFU_2_PRIVATE_IP" "$SFU_3_PRIVATE_IP" >"$PROXY_USER_DATA"
aws s3 cp "$PROXY_USER_DATA" "s3://${CODE_BUCKET}/${PROXY_SETUP_KEY}" >/dev/null

rm -f "$PROXY_USER_DATA" "$SFU_1_USER_DATA" "$SFU_2_USER_DATA" "$SFU_3_USER_DATA"

cat <<SUMMARY

Provisioned ${CLUSTER_NAME}.

Proxy:
  instance: ${PROXY_INSTANCE_ID}
  public_ip: ${PROXY_EIP}
  private_ip: ${PROXY_PRIVATE_IP}

SFUs:
  sfu-1: ${SFU_1_INSTANCE_ID} public=${SFU_1_PUBLIC_IP} private=${SFU_1_PRIVATE_IP}
  sfu-2: ${SFU_2_INSTANCE_ID} public=${SFU_2_PUBLIC_IP} private=${SFU_2_PRIVATE_IP}
  sfu-3: ${SFU_3_INSTANCE_ID} public=${SFU_3_PUBLIC_IP} private=${SFU_3_PRIVATE_IP}

Create DNS records:
  sfu-1.${DOMAIN} -> ${PROXY_EIP}
  sfu-2.${DOMAIN} -> ${PROXY_EIP}
  sfu-3.${DOMAIN} -> ${PROXY_EIP}
  sfu-dashboard.${DOMAIN} -> ${PROXY_EIP}

Set web env:
  SFU_POOL=sfu-1=http://sfu-1.${DOMAIN},sfu-2=http://sfu-2.${DOMAIN},sfu-3=http://sfu-3.${DOMAIN}
  SFU_INTERNAL_POOL=sfu-1=http://sfu-1.${DOMAIN},sfu-2=http://sfu-2.${DOMAIN},sfu-3=http://sfu-3.${DOMAIN}

Grafana:
  http://sfu-dashboard.${DOMAIN}/grafana/
  default login is admin/admin until changed.
SUMMARY
