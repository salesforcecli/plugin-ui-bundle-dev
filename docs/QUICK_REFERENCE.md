# sf webapp dev - Quick Reference

## One-Liners

```bash
# Basic usage
sf webapp dev --name myapp --target-org myorg --open

# With explicit URL
sf webapp dev --name myapp --target-org myorg --url http://localhost:5173 --open

# Custom port
sf webapp dev --name myapp --target-org myorg --port 8080 --open

# Debug mode
sf webapp dev --name myapp --target-org myorg --debug --open
```

## webapp.json Template

```json
{
  "name": "myapp",
  "label": "My Web App",
  "version": "1.0.0",
  "apiVersion": "60.0",
  "outputDir": "dist",
  "dev": {
    "command": "npm run dev",
    "url": "http://localhost:5173"
  }
}
```

## Common Issues & Quick Fixes

| Issue                   | Quick Fix                                       |
| ----------------------- | ----------------------------------------------- |
| Port in use             | `sf webapp dev ... --port 8080`                 |
| Dev server not detected | `sf webapp dev ... --url http://localhost:5173` |
| Auth failed             | `sf org login web --alias myorg`                |
| No webapp.json          | Create file in project root                     |

## Routing Rules

| Path Pattern              | Routes To  |
| ------------------------- | ---------- |
| `/services/*`             | Salesforce |
| `/aura`                   | Salesforce |
| `/lightning/*`            | Salesforce |
| `*.js`, `*.css`, `*.html` | Dev Server |
| `/__vite_ping`            | Dev Server |
| `/_next/*`                | Dev Server |

## Supported Dev Servers

- ✅ Vite
- ✅ Create React App (Webpack)
- ✅ Next.js
- ✅ Any server outputting `http://localhost:PORT`

## Key Features

- 🔐 Auto authentication injection
- 🌐 Intelligent request routing
- 🔄 WebSocket support (HMR)
- 🎨 Beautiful error pages
- 💚 Health monitoring (5s intervals)
- 🔧 Hot config reload

## Keyboard Shortcuts

| Key      | Action            |
| -------- | ----------------- |
| `Ctrl+C` | Graceful shutdown |

## Error Codes

| Code                      | Description             | Fix                 |
| ------------------------- | ----------------------- | ------------------- |
| `PortInUseError`          | Port already in use     | Use `--port` flag   |
| `DevServerStartupTimeout` | Dev server didn't start | Check `dev.command` |
| `ManifestNotFoundError`   | No webapp.json          | Create file         |
| `AuthenticationError`     | Auth failed             | Re-login            |
| `TargetUnreachableError`  | Dev server down         | Start dev server    |

## URLs

- **Proxy:** `http://localhost:4545` (default)
- **Dev Server:** Configured in `webapp.json`
- **Salesforce:** Your org's instance URL

## Logs Location

- **Terminal:** Real-time output
- **Debug:** Use `--debug` flag

## Health Check

The proxy checks dev server health every 5 seconds:

- ✅ **Up:** Green message in terminal
- ⚠️ **Down:** Warning message + error page

## Getting Help

1. Read full documentation: `docs/SF_WEBAPP_DEV_DOCUMENTATION.md`
2. Enable debug mode: `--debug`
3. Check logs in terminal

---

**Pro Tip:** Use shell aliases for faster commands!

```bash
# Add to ~/.bashrc or ~/.zshrc
alias webapp-dev='sf webapp dev --name myapp --target-org myorg --open'

# Then just run:
webapp-dev
```
