# GitHub MCP Server (FastMCP)

This repo includes a small MCP server that exposes a few GitHub tools (repo info, issues, file fetch, code search).

## Setup

- Create a token and export it as an env var:
  - `GITHUB_PAT` (preferred in this repo), or `GITHUB_TOKEN`
- Copy the example env file:
  - `cp mcp/.env.example mcp/.env.local` (do not commit)

## Install (Python)

FastMCP quickstart docs: `https://fastmcp.wiki/en/getting-started/quickstart`

Using `uv`:

```bash
uv venv
source .venv/bin/activate
uv pip install -r mcp/requirements.txt
```

Or using `pip`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r mcp/requirements.txt
```

## Run

```bash
source .venv/bin/activate
python mcp/github_mcp_server.py
```

## Notes

- This server uses the GitHub REST API with a PAT (no OAuth flow).
- Keep tokens in env only. Never commit `.env.local` files.


