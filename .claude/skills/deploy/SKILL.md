---
name: deploy
description: Deploy the latest code to the production server. Use when the user wants to deploy, ship, push to production, or update the live site.
---

# Deploy Skill

Deploy auracaps to the Hetzner production server.

## Steps

1. Run the deploy command via SSH:

```bash
ssh hetz "cd /root/development/auracaps && git pull && pm2 restart aura"
```

2. Show the full output to the user.

3. Confirm success by checking that PM2 shows `aura` with status `online` in the output.

4. If anything looks wrong (merge conflict, npm errors, PM2 shows `errored`), flag it clearly and do not declare success.

## Notes

- The server is at `5.161.198.252` (alias `hetz` in `~/.ssh/config`)
- The app runs under PM2 as process named `aura`
- No `npm install` is needed unless `package.json` changed — check the git pull output for changes to `package.json` or `package-lock.json` and run `ssh hetz "cd /root/development/auracaps && npm install"` first if so
