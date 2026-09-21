# Agent skills

Drop-in instructions that teach a coding agent how to work with Ghostwire
Analytics. They are plain Markdown — no install step, no runtime.

## ghostwire-analytics

Teaches an agent to add Ghostwire to a project: Next.js App Router, React
(Vite/CRA/Remix), plain HTML and templated sites, and server-side error
reporting for Node, Express and Python.

It covers the parts that are easy to get wrong rather than just the snippet:
Content-Security-Policy (`connect-src` is the one people miss), build-time
versus runtime configuration in Docker, keeping development traffic out of
production figures, and how to check the integration actually reports rather
than assuming it does.

### Install it in a project

Copy the folder into the project, wherever that agent looks for skills:

```bash
# Claude Code — project-local
cp -r skills/ghostwire-analytics /path/to/your-project/.claude/skills/

# Claude Code — available everywhere
cp -r skills/ghostwire-analytics ~/.claude/skills/
```

Then ask for what you want: *"add analytics to this app"*, *"wire up Ghostwire"*,
*"analytics is installed but nothing shows up"*. The agent reads the skill and
picks the reference that matches the project.

## Better together: the MCP server

The skill tells an agent **how to integrate**. The MCP server lets it **do the
provisioning** — create the site, fetch the snippet, issue the server error key,
and read how the site is doing afterwards.

With both connected, "set up analytics for this app" is one instruction: the
agent creates the website, takes the real ID, and writes the integration
correctly for the framework in front of it.

```bash
claude mcp add ghostwire --transport http \
  https://analytics.example.com/api/mcp \
  --header "Authorization: Bearer gwa_..."
```

Create the API key under Settings → API keys. For clients that cannot reach a
remote MCP endpoint, `packages/mcp` bridges the same endpoint over stdio.
