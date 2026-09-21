# @ghostwire/mcp

Runs a [Ghostwire Analytics](https://github.com/garethcheyne/ghostwire-analytics)
MCP endpoint over stdio, for MCP clients that cannot talk to a remote server.

**If your client supports remote MCP, you do not need this package.** Point it
straight at the instance:

```bash
claude mcp add ghostwire --transport http \
  https://analytics.example.com/api/mcp \
  --header "Authorization: Bearer gwa_..."
```

## Using the bridge

```json
{
  "mcpServers": {
    "ghostwire": {
      "command": "npx",
      "args": ["-y", "@ghostwire/mcp"],
      "env": {
        "GHOSTWIRE_HOST": "https://analytics.example.com",
        "GHOSTWIRE_API_KEY": "gwa_..."
      }
    }
  }
}
```

Create the API key under **Settings → API keys** in Ghostwire. It carries your
own permissions: the tools can only reach websites you can already see.

## What it does

It forwards whole JSON-RPC messages between stdin/stdout and the instance's
`/api/mcp` endpoint, and interprets none of them. Whatever tools your instance
exposes are available here the moment they ship — there is no tool list to keep
in step, because the protocol lives in the app.

## Tools

Provisioning: `ghostwire_list_websites`, `ghostwire_create_website`,
`ghostwire_get_website`, `ghostwire_update_website`,
`ghostwire_create_error_key`.

Reading: `ghostwire_get_stats`, `ghostwire_get_metrics`,
`ghostwire_get_timeseries`, `ghostwire_get_active_visitors`.

Teams, users, alerts and deletion are deliberately absent, so a bad prompt
cannot do lasting damage through this door.

Pair it with the `ghostwire-analytics` skill (in `skills/`) so the agent knows
how to write the integration once it has created the site.

## Develop

```bash
npm install && npm test && npm run build
```
