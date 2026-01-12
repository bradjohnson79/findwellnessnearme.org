import os
from typing import Any, Dict, List, Optional

import requests
from fastmcp import FastMCP


def _required_token() -> str:
  token = (os.getenv("GITHUB_PAT") or os.getenv("GITHUB_TOKEN") or "").strip()
  if not token:
    raise RuntimeError("Missing GitHub token. Set GITHUB_PAT (preferred) or GITHUB_TOKEN.")
  return token


def _gh_headers() -> Dict[str, str]:
  return {
    "Authorization": f"Bearer {_required_token()}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "findwellnessnearme-github-mcp/0.1",
  }


def _gh_get(url: str, params: Optional[dict] = None) -> Any:
  res = requests.get(url, headers=_gh_headers(), params=params, timeout=20)
  res.raise_for_status()
  return res.json()


def _gh_post(url: str, body: dict) -> Any:
  res = requests.post(url, headers=_gh_headers(), json=body, timeout=20)
  res.raise_for_status()
  return res.json()


mcp = FastMCP("GitHub MCP (findwellnessnearme.org)")


@mcp.tool
def github_get_repo(owner: str, repo: str) -> Dict[str, Any]:
  """Fetch basic repository metadata."""
  return _gh_get(f"https://api.github.com/repos/{owner}/{repo}")


@mcp.tool
def github_list_issues(owner: str, repo: str, state: str = "open", limit: int = 20) -> List[Dict[str, Any]]:
  """List issues (excluding PRs)."""
  limit = max(1, min(int(limit), 50))
  items = _gh_get(
    f"https://api.github.com/repos/{owner}/{repo}/issues",
    params={"state": state, "per_page": limit},
  )
  # Issues endpoint returns PRs too; filter by presence of pull_request key.
  return [it for it in items if isinstance(it, dict) and "pull_request" not in it]


@mcp.tool
def github_create_issue(owner: str, repo: str, title: str, body: str = "") -> Dict[str, Any]:
  """Create an issue. Requires token with appropriate repo permissions."""
  payload = {"title": title, "body": body}
  return _gh_post(f"https://api.github.com/repos/{owner}/{repo}/issues", payload)


@mcp.tool
def github_get_file(owner: str, repo: str, path: str, ref: str = "main") -> Dict[str, Any]:
  """Fetch file metadata + content (base64) from a repo path."""
  return _gh_get(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}", params={"ref": ref})


@mcp.tool
def github_search_code(owner: str, repo: str, query: str, limit: int = 20) -> List[Dict[str, Any]]:
  """Search code within a single repo."""
  limit = max(1, min(int(limit), 50))
  q = f"repo:{owner}/{repo} {query}".strip()
  res = _gh_get("https://api.github.com/search/code", params={"q": q, "per_page": limit})
  items = res.get("items") if isinstance(res, dict) else None
  return items if isinstance(items, list) else []


if __name__ == "__main__":
  # FastMCP quickstart: https://fastmcp.wiki/en/getting-started/quickstart
  mcp.run()


