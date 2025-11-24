# Documentation

Welcome to the `@salesforce/plugin-webapp` documentation!

## 📚 Available Documentation

### Quick Start

- **[Quick Reference](QUICK_REFERENCE.md)** - One-liners, common issues, and quick fixes

### Comprehensive Guides

- **[SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md)** - Complete guide for `sf webapp dev` command
  - Overview & Quick Start
  - Command Usage & Flags
  - Features & Configuration
  - Architecture & How It Works
  - Troubleshooting
  - Developer Guide
  - API Reference

## 🚀 Getting Started

1. **First time user?** Start with [Quick Reference](QUICK_REFERENCE.md)
2. **Need detailed information?** Read [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md)
3. **Troubleshooting?** Check the Troubleshooting section in the main documentation
4. **Developer?** See the Developer Guide section in the main documentation

## 📖 Command Overview

### `sf webapp dev`

Local development proxy server for Salesforce webapps with authentication and dev server management.

**Quick Example:**

```bash
sf webapp dev --name myapp --target-org myorg --open
```

**Key Features:**

- 🔐 Automatic authentication injection
- 🌐 Intelligent request routing
- 🔄 Dev server lifecycle management
- 🎨 Beautiful error pages
- 💚 Health monitoring

**Supported Dev Servers:**

- Vite
- Create React App
- Next.js
- Custom servers

## 🔍 Finding Information

### By Topic

| Topic           | Document           | Section         |
| --------------- | ------------------ | --------------- |
| Installation    | Main README        | Installation    |
| Basic Usage     | Quick Reference    | One-Liners      |
| Flags           | SF Webapp Dev Docs | Command Usage   |
| Configuration   | SF Webapp Dev Docs | Configuration   |
| Troubleshooting | SF Webapp Dev Docs | Troubleshooting |
| Error Codes     | Quick Reference    | Error Codes     |
| Architecture    | SF Webapp Dev Docs | Architecture    |
| API             | SF Webapp Dev Docs | API Reference   |
| Contributing    | SF Webapp Dev Docs | Developer Guide |

### By Role

**End User / Developer:**

1. [Quick Reference](QUICK_REFERENCE.md)
2. [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) - Quick Start

**System Administrator:**

1. [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) - Configuration
2. [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) - Troubleshooting

**Plugin Developer:**

1. [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) - Architecture
2. [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) - Developer Guide

## 🐛 Troubleshooting

Quick links to common issues:

- [Port in use](SF_WEBAPP_DEV_DOCUMENTATION.md#1-port-already-in-use)
- [Dev server not detected](SF_WEBAPP_DEV_DOCUMENTATION.md#2-dev-server-not-detected)
- [Authentication failed](SF_WEBAPP_DEV_DOCUMENTATION.md#3-authentication-failed)
- [Manifest not found](SF_WEBAPP_DEV_DOCUMENTATION.md#4-manifest-not-found)

## 📝 Contributing

To add or update documentation:

1. **Quick fixes:** Update relevant markdown file
2. **New features:** Add section to main documentation
3. **Examples:** Add to Quick Reference
4. **Code examples:** Ensure they're tested
5. **Links:** Use relative links within docs

## 🔗 Links

- **Main Repository:** salesforcecli/plugin-webapp
- **Work Item:** W-20242483
- **Issue Tracker:** GitHub Issues

---

**Need help?** Check [SF Webapp Dev Documentation](SF_WEBAPP_DEV_DOCUMENTATION.md) or open an issue!
