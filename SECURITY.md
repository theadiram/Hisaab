# Security and privacy reporting

Do not open a public issue containing credentials, private records, exploitable access details or personal information.

Use GitHub's **Report a vulnerability** option in the repository Security tab if available. Otherwise contact the repository owner privately through the contact options on their GitHub profile. Ask for a private reporting channel before sending sensitive evidence; do not place it in public profile comments or Discord channels.

Include affected behavior, reproduction steps using synthetic records, impact and the minimum evidence needed to reproduce. Do not download other people's private records, modify production data or publish an exploit to demonstrate a problem.

If a credential has already appeared publicly, notify the maintainer privately. Removing a file does not revoke a credential or erase its history. Credential rotation and any Git history repair require a separate incident response.

## What must remain private

- Populated environment files, passwords, tokens, private keys and administrator sessions.
- Database backups, private source originals and citizen observations or attachments.
- Account/billing screenshots, operational captures and personal agent/chat notes.
- Personal identifiers that are unnecessary to establish a public spending claim.

CI scans Git history with a pinned, checksum-verified Gitleaks release and runs an additional publication check. The narrow `.gitleaksignore` exception identifies one generated source checksum rather than excluding an entire dataset. Automated scanning cannot guarantee that every sensitive item is detected. Review new files, logs, screenshots and pull-request descriptions manually.

Only `main` is maintained as the integration branch. Experimental branches and local copies are not supported production deployments. Security fixes should preserve MFA, default-deny access and source withdrawal behavior.
