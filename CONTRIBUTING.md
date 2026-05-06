# Contributing

Contributions are welcome! Here's how to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) (latest LTS recommended)
- npm (comes with Node.js)

## Setup

```bash
git clone https://github.com/mnaoumov/obsidian-consistent-attachments-and-links.git
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

## Pull Requests

- Base your PR on the `master` branch.
- Ensure all checks pass (`lint`, `format:check`, `spellcheck`, `test`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for your commit messages.
