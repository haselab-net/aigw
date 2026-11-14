# aigw demo: the gateway, one user's backend and the PWA in one container.
# Build from the repository root:  docker build -f docker/Dockerfile -t aigw-demo .
# See docker/README.md.
FROM debian:trixie-slim

ARG WITH_CLAUDE=1
ARG DEMO_USER=demo

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 python3-venv tmux socat procps git curl ca-certificates less nano \
 && rm -rf /var/lib/apt/lists/*

# Claude Code's native build, installed once and shared at /usr/local/bin/claude
# (the installer puts it under the installing user's ~/.local; copy it out).
RUN if [ "$WITH_CLAUDE" = 1 ]; then \
      curl -fsSL https://claude.ai/install.sh | bash \
      && install -m 755 "$(readlink -f /root/.local/bin/claude)" /usr/local/bin/claude \
      && rm -rf /root/.local/share/claude /root/.local/bin/claude /root/.claude /root/.claude.json*; \
    fi

COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/aigw/venv \
 && /opt/aigw/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

# The gateway runs as the system user "aigw", the backend as the demo user.
# The demo user must be uid 1000: the gateway reaches a user's backend at
# /run/aigw-backend/<21000 + uid - 1000>.sock.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin aigw \
 && useradd --create-home --uid 1000 --shell /bin/bash "$DEMO_USER" \
 && install -d -o aigw -g aigw -m 700 /var/lib/aigw /var/lib/aigw/gateway-state \
 && install -d -m 755 /etc/aigw /usr/local/lib/aigw/ext \
 && install -d -o root -g "$DEMO_USER" -m 2770 /var/lib/aigw-board

COPY bin/ /usr/local/sbin/
COPY static/ /opt/aigw/static/
COPY docker/static/ /opt/aigw/static/
COPY docker/ext/ /usr/local/lib/aigw/ext/
COPY docker/sandbox /usr/local/bin/sandbox
COPY docker/entrypoint.sh /usr/local/sbin/aigw-demo-entrypoint
RUN rm -rf /usr/local/sbin/__pycache__ \
 && chmod 755 /usr/local/sbin/aigw-* /usr/local/bin/sandbox \
 && ln -s /usr/local/sbin/talkto /usr/local/bin/talkto

ENV AIGW_DEMO_USER=$DEMO_USER
EXPOSE 8878
ENTRYPOINT ["/usr/local/sbin/aigw-demo-entrypoint"]
