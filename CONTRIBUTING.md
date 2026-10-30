# Contributing

Contributions are welcome! Here's how to get started.

## Filing an issue (for AI agents and humans)

Open issues through the [issue forms](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/issues/new/choose), not as blank issues.

Filing from the CLI or the API (`gh issue create --body`, or an AI agent filing for you) skips the form, and `gh issue create --template` cannot load an issue form. In that case, open the matching form in [`.github/ISSUE_TEMPLATE/`](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/tree/HEAD/.github/ISSUE_TEMPLATE), copy every field as a `### <label>` heading in the form's order, and fill in each one. Always state the plugin version, the Obsidian version and your operating system.

## Prerequisites

- [Node.js](https://nodejs.org/) (latest LTS recommended)
- npm (comes with Node.js)

## Setup

```bash
git clone https://github.com/dy-sh/obsidian-consistent-attachments-and-links.git
cd obsidian-consistent-attachments-and-links
npm install
```

## Development Workflow

### Build

```bash
npm run build
```

### Dev Mode

```bash
npm run dev
```

### Commit

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Use the interactive commit prompt:

```bash
npm run commit
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Format

```bash
npm run format:check
npm run format
```

### Spellcheck

```bash
npm run spellcheck
```

### Test

```bash
npm run test
npm run test:coverage
```

### Branch Gate

Before you open a pull request, run the branch gate. It is the release preflight itself, so it catches the checks that `lint` and `test` do not reach - and catches them in seconds rather than at release time:

```bash
npm run gate
```

## Pull Requests

- Base your PR on the `master` branch.
- Ensure the branch gate passes (`npm run gate`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages.
