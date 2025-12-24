# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

We take the security of Ctrl Alt Elite seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please do NOT:

- Open a public GitHub issue
- Share the vulnerability publicly
- Share the vulnerability with others until we've had a chance to address it

### Please DO:

1. **Email us** at [security@ctrlaltelite.dev] (replace with actual email if available) or create a private security advisory on GitHub

2. **Include the following information:**
   - Type of vulnerability
   - Full paths of source file(s) related to the vulnerability
   - The location of the affected code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the vulnerability, including how an attacker might exploit it

3. **Wait for our response:**
   - We'll acknowledge your report within 48 hours
   - We'll provide a detailed response within 7 days
   - We'll keep you informed of the progress toward a fix and full announcement

### What to expect:

- **Acknowledgement**: We'll confirm receipt of your report within 48 hours
- **Initial Assessment**: We'll provide an initial assessment within 7 days
- **Updates**: We'll keep you informed of our progress
- **Resolution**: We aim to resolve critical issues as quickly as possible

## Disclosure Policy

When we receive a security bug report, we will assign it a priority level:

- **Critical**: Remote code execution, data exfiltration, or significant data loss
- **High**: Significant privilege escalation, authentication bypass, or data access issues
- **Medium**: Limited privilege escalation or information disclosure
- **Low**: Minor information disclosure or denial of service

We follow a coordinated disclosure process:

1. Security issues are fixed in a private repository
2. We notify the reporter when the fix is ready
3. We prepare a security advisory describing the vulnerability
4. The fix is released along with the security advisory
5. Credit is given to the reporter (if desired)

## Security Considerations

### Data Privacy

Ctrl Alt Elite processes racing telemetry data locally:

- All `.ibt` file processing happens on your local machine
- No telemetry data is transmitted to external servers
- File system access is limited to necessary directories
- Auto-detection scans only the iRacing telemetry directory

### Local File Access

The application requires file system access to:

- Read `.ibt` telemetry files from the iRacing directory
- Load telemetry files from user-selected locations
- Store application preferences (if any)

These permissions are requested explicitly and can be restricted by the operating system's security policies.

### Third-Party Dependencies

We regularly update dependencies to include security patches. You can check for known vulnerabilities using:

```bash
npm audit
```

## Security Best Practices for Users

1. **Keep the application updated** to the latest version
2. **Only load telemetry files from trusted sources**
3. **Be cautious when sharing telemetry files** - they may contain session metadata
4. **Review file permissions** if using in a shared environment

## Known Security Considerations

### Tauri Security Model

This application uses Tauri, which provides security through:

- Capability-based permissions system
- Content Security Policy (CSP)
- Sandboxed webview environment
- Explicit API permissions

For more information, see the [Tauri Security Guide](https://tauri.app/v1/guides/security/).

## Security Contact

For security-related questions or reports:

- **Email**: [Replace with actual security contact email]
- **GitHub Security Advisory**: [Create a private security advisory](https://github.com/yourusername/ctrlaltelite/security/advisories/new)

---

**Thank you for helping keep Ctrl Alt Elite and our users safe!**