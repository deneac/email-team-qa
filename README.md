# email-team-qa

Interactive email QA for Figma stakeholders. Reviewers comment and approve; the email team manages campaigns, HTML revisions, and Design Studio imports.

## Getting Started

npm run dev

- Review UI: http://localhost:3000
- Admin panel (email team only): http://localhost:3000/admin

Sign in with **Continue with Figma** (Figma / Okta). There is no app password.

The first user to sign in becomes an admin. Everyone else defaults to reviewer. Promote teammates under Users → Role.

To import from Customer.io Design Studio, set `CUSTOMERIO_APP_API_KEY` (see `.env.example`).

## Deployment

npx @payloadcms/figma deploy

Deploys to Figma infrastructure.

## Resources

- [Payload Docs](https://payloadcms.com/docs)
