# Paperclip Custom Build — Deployment Instructions

## Target: macOS (doable.team Mac)

Existing setup on Mac:
- 2 Paperclip instances running via launchd (`default` on port 3100, `second` on port 3200)
- Node.js v24.14.0 via nvm
- No pnpm installed — uses npx

---

## Step 1: Transfer and Extract

```bash
# Copy the archive to the Mac (scp, airdrop, USB, etc.)
# Then extract:
cd ~
tar xzf paperclip-deploy.tar.gz
# This creates ~/paperclip/
```

## Step 2: Install pnpm (one-time)

```bash
npm install -g pnpm
```

## Step 3: Install dependencies

```bash
cd ~/paperclip
pnpm install
```

## Step 4: Create a custom Paperclip instance

Use a **separate home directory** to avoid conflicts with your existing 2 instances:

```bash
# Option A: Use a custom PAPERCLIP_HOME (completely separate)
export PAPERCLIP_HOME="$HOME/.paperclip-custom"

# Option B: Use the same ~/.paperclip but a different instance name
# (This shares the same home but creates a new instance folder)
# export PAPERCLIP_INSTANCE=third
```

**Recommended: Option A** — keeps everything completely separate.

```bash
export PAPERCLIP_HOME="$HOME/.paperclip-custom"
cd ~/paperclip
pnpm paperclipai onboard --instance default
```

During onboarding, choose **Quickstart**.

## Step 5: Change the port

Your existing instances use ports 3100 and 3200. Edit the config:

```bash
nano "$PAPERCLIP_HOME/instances/default/config.json"
```

Change the port to **3300** (or any free port):

```json
{
  "server": {
    "deploymentMode": "authenticated",
    "exposure": "private",
    "host": "127.0.0.1",
    "port": 3300
  }
}
```

## Step 6: Test run

```bash
cd ~/paperclip
PAPERCLIP_HOME="$HOME/.paperclip-custom" node server/dist/index.js
```

Visit `http://localhost:3300` — you should see the admin signup page.

## Step 7: Set up as a launchd service (auto-start)

Create the plist file:

```bash
cat > ~/Library/LaunchAgents/com.paperclipai.run.custom.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.paperclipai.run.custom</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/doable.team/.nvm/versions/node/v24.14.0/bin/node</string>
        <string>/Users/doable.team/paperclip/server/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/doable.team/paperclip</string>
    <key>StandardOutPath</key>
    <string>/Users/doable.team/.paperclip-custom/instances/default/logs/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/doable.team/.paperclip-custom/instances/default/logs/launchd-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/doable.team</string>
        <key>PATH</key>
        <string>/Users/doable.team/.local/bin:/Users/doable.team/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>PAPERCLIP_HOME</key>
        <string>/Users/doable.team/.paperclip-custom</string>
    </dict>
</dict>
</plist>
EOF
```

Create the logs directory:

```bash
mkdir -p "$HOME/.paperclip-custom/instances/default/logs"
```

Load and start the service:

```bash
launchctl load ~/Library/LaunchAgents/com.paperclipai.run.custom.plist
```

Check if running:

```bash
launchctl list | grep paperclipai
# Should show: com.paperclipai.run.custom
```

## Managing the service

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.paperclipai.run.custom.plist

# Start
launchctl load ~/Library/LaunchAgents/com.paperclipai.run.custom.plist

# View logs
tail -f ~/.paperclip-custom/instances/default/logs/launchd.log

# View errors
tail -f ~/.paperclip-custom/instances/default/logs/launchd-error.log
```

---

## Port Summary

| Instance | Port | Home | Service |
|----------|------|------|---------|
| default (original) | 3100 | ~/.paperclip | com.paperclipai.run |
| second (original) | 3200 | ~/.paperclip | com.paperclipai.run.second |
| **custom (this build)** | **3300** | **~/.paperclip-custom** | **com.paperclipai.run.custom** |

---

## API Keys

If your agents need API keys (OpenAI for Codex, Anthropic for Claude), set them in the env file:

```bash
nano "$HOME/.paperclip-custom/instances/default/.env"
```

Add:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## What's Different in This Build

This is a custom fork with:
- **Roles & Permissions system** — admin/manager/employee + custom roles
- **Unified principal system** — humans and agents are peers in hierarchy
- **Project scoping** — members only see assigned projects
- **25 fine-grained permission keys**
- **Peer assignment** — `tasks:assign_peers` permission
- Default deployment mode is `authenticated` (requires login)
