#!/bin/sh
# Install missing skill dependencies inside the openclaw-gateway container.
# Run as root: docker compose exec -u root openclaw-gateway sh /home/node/.openclaw/install-skill-deps.sh

set -e

# ---------------------------------------------------------------------------
# apt packages
# jq, rg         → session-logs
# gpg            → gh CLI keyring setup
# ffmpeg         → video-frames
# tmux           → tmux skill
# python3, pip   → openai-image-gen, nano-banana-pro fallback
# ---------------------------------------------------------------------------
apt-get update -qq
for pkg in jq ripgrep gpg ffmpeg tmux python3 python3-pip; do
  dpkg -s "$pkg" >/dev/null 2>&1 || {
    echo "[skill-deps] installing $pkg..."
    apt-get install -y -qq "$pkg"
  }
done

# ---------------------------------------------------------------------------
# gh CLI (github + gh-issues skills)
# ---------------------------------------------------------------------------
which gh >/dev/null 2>&1 || {
  echo "[skill-deps] installing gh CLI..."
  mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -qq && apt-get install -y -qq gh
}

# ---------------------------------------------------------------------------
# npm global packages
# mcporter       → mcporter skill
# summarize      → summarize skill
# clawhub        → clawhub skill
# oracle         → oracle skill
# xurl           → xurl skill (X/Twitter API)
# ---------------------------------------------------------------------------
for pkg in mcporter @steipete/summarize clawhub @steipete/oracle @xdevplatform/xurl; do
  bin=$(echo "$pkg" | sed "s/@.*\///")
  which "$bin" >/dev/null 2>&1 || {
    echo "[skill-deps] installing $pkg..."
    npm install -g "$pkg"
  }
done

# ---------------------------------------------------------------------------
# nano-pdf (uv tool — nano-pdf skill)
# ---------------------------------------------------------------------------
which nano-pdf >/dev/null 2>&1 || {
  echo "[skill-deps] installing nano-pdf via uv..."
  su node -c "uv tool install nano-pdf" 2>/dev/null || uv tool install nano-pdf || true
}

# ---------------------------------------------------------------------------
# obsidian-cli binary (obsidian skill)
# ---------------------------------------------------------------------------
which obsidian-cli >/dev/null 2>&1 || {
  echo "[skill-deps] installing obsidian-cli..."
  cd /tmp
  curl -sL https://github.com/yakitrak/obsidian-cli/releases/download/v0.3.1/notesmd-cli_0.3.1_linux_arm64.tar.gz -o obsidian-cli.tar.gz
  tar xzf obsidian-cli.tar.gz
  cp notesmd-cli /usr/local/bin/obsidian-cli
  chmod +x /usr/local/bin/obsidian-cli
  rm -f obsidian-cli.tar.gz notesmd-cli
}

# ---------------------------------------------------------------------------
# gog CLI (gog skill — Google Workspace: Gmail, Calendar, Drive, etc.)
# ---------------------------------------------------------------------------
which gog >/dev/null 2>&1 || {
  echo "[skill-deps] installing gog CLI..."
  cd /tmp
  curl -sL https://github.com/steipete/gogcli/releases/download/v0.11.0/gogcli_0.11.0_linux_arm64.tar.gz | tar xz -C /tmp
  mv /tmp/gog /usr/local/bin/gog
  chmod +x /usr/local/bin/gog
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "[skill-deps] ✓ all done"
echo "  jq:           $(jq --version 2>/dev/null || echo missing)"
echo "  rg:           $(rg --version 2>/dev/null | head -1 || echo missing)"
echo "  ffmpeg:       $(ffmpeg -version 2>/dev/null | head -1 || echo missing)"
echo "  tmux:         $(tmux -V 2>/dev/null || echo missing)"
echo "  python3:      $(python3 --version 2>/dev/null || echo missing)"
echo "  gh:           $(gh --version 2>/dev/null | head -1 || echo missing)"
echo "  mcporter:     $(mcporter --version 2>/dev/null | head -1 || echo missing)"
echo "  summarize:    $(summarize --version 2>/dev/null | head -1 || echo missing)"
echo "  clawhub:      $(clawhub -V 2>/dev/null | head -1 || echo missing)"
echo "  oracle:       $(oracle --version 2>/dev/null | head -1 || echo missing)"
echo "  xurl:         $(xurl --version 2>/dev/null | head -1 || echo missing)"
echo "  nano-pdf:     $(nano-pdf --version 2>/dev/null | head -1 || echo missing)"
echo "  obsidian-cli: $(obsidian-cli --version 2>/dev/null || echo missing)"
echo "  gog:          $(gog --version 2>/dev/null | head -1 || echo missing)"
