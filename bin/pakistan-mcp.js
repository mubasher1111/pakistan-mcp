#!/usr/bin/env node
// Starts the pakistan-mcp server over stdio, for Claude Desktop, Claude Code,
// Cursor, VS Code and any other MCP client.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer, VERSION } from '../src/server.js';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

serveStdio(() => createServer(), {
  onerror: (err) => console.error('[pakistan-mcp]', err?.message ?? err),
});
