# AEM Migration Tools

Tools for AEM Author administration and migration tasks.

## aem-set-impersonator.js

Bulk-update AEM users to add a system user as an allowed impersonator.

**Dry-run by default.** Run with `--execute` to apply changes.

### Usage
```
node aem-set-impersonator.js [options]
```

### Required Arguments
- `--host <url>` — AEM author URL (e.g. `https://author-pXXXXX-eXXXXXX.adobeaemcloud.com`)
- `--credentials <user:pass>` — Admin credentials (or `AEM_CREDENTIALS` env var)
- `--impersonator <id>` — System user authorizable ID to add (e.g. `koassets-contenthub`)

### Optional Arguments
- `--execute` — Actually make changes (default: dry-run)
- `--no-replicate` — Skip replication to publish
- `--path <path>` — JCR path (default: `/home/users`, or a single user node path)
- `--email <glob>` — Filter users by email/principalName glob (e.g. `*@coca-cola.com`)
- `--include-system` — Include system users (default: excluded)
- `--include-ims-ta` — Include IMS technical accounts (`*@techacct.adobe.com`, default: excluded)
- `--delay <ms>` — Delay between user write operations in ms (default: 200)
- `--timeout <ms>` — Request timeout in ms (default: 30000)
- `--fail-fast` — Stop on first error
- `--verbose` — Detailed logging

### Examples
```bash
export AEM_CREDENTIALS=admin:pass

# Dry-run report (read-only)
node aem-set-impersonator.js --host https://author-p64403-e544653.adobeaemcloud.com --impersonator koassets-contenthub

# Test on a single user
node aem-set-impersonator.js --host ... --impersonator ... --path /home/users/a/testuser --execute

# Only process coca-cola.com users
node aem-set-impersonator.js --host ... --impersonator ... --email "*@coca-cola.com"

# Only Adobe IMS users
node aem-set-impersonator.js --host ... --impersonator ... --path /home/users/ims

# Only KO Assets Microsoft IDP users
node aem-set-impersonator.js --host ... --impersonator ... --path /home/users/tccc/idp

# Full execution
node aem-set-impersonator.js --host ... --impersonator ... --execute

```
