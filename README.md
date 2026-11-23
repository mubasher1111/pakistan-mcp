# 🇵🇰 pakistan-mcp

**Give Claude, Cursor and other AI assistants accurate Pakistan tools.**
An MCP server for FBR salary tax, CNIC/phone/IBAN/NTN checks, PKR lakh/crore formatting, Roman Urdu → Urdu, and Urdu & Hijri dates.

> AI models often get Pakistani tax slabs wrong, mix up lakh and million, and guess at Urdu numbers. With this server they call real, tested code instead of guessing.

[![Tests](https://github.com/mubasher1111/pakistan-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/mubasher1111/pakistan-mcp/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/pakistan-mcp)](https://www.npmjs.com/package/pakistan-mcp)
![License](https://img.shields.io/badge/license-MIT-blue)
![MCP](https://img.shields.io/badge/MCP-server-8A2BE2)

📖 **[Full guide](https://zexcart.site/pakistan-mcp/)** · Built on [pakistan-toolkit](https://github.com/mubasher1111/pakistan-toolkit) and [urdu-toolkit](https://github.com/mubasher1111/urdu-toolkit)

---

## What you can ask

Once it's connected, just ask your AI assistant in plain words (English, Urdu or Roman Urdu):

- *"Meri tankhwah 2 lakh mahana hai, 2026-27 mein kitna tax katega?"*
- *"How much less tax will I pay this year than last year on Rs 3 lakh a month?"*
- *"Is this IBAN correct? PK36 SCBL 0000 0011 2345 6702"*
- *"Write Rs 25,50,000 in Urdu words for a cheque."*
- *"Convert this to Urdu script: aap ka order kal tak pohanch jayega"*
- *"Aaj Hijri tareekh kya hai?"*
- *"List the cities in Khyber Pakhtunkhwa with Urdu names."*

## Tools

| Tool | What it does |
|---|---|
| `calculate_salary_tax` | FBR salaried income tax for FY2024-25, FY2025-26, FY2026-27: monthly/annual tax, take-home, rates, surcharge |
| `compare_salary_tax` | Same salary across two tax years: how much more or less you pay |
| `validate_cnic` | CNIC format, region, gender digit, masked form |
| `validate_phone` | Mobile number in any format → E.164, local, WhatsApp link, original network |
| `validate_iban` | Full mod-97 IBAN check and bank name |
| `validate_ntn` | NTN format (classic or CNIC-based) |
| `format_pkr` | Rs 12,34,567 · "12.35 lakh" · amount in English and Urdu words |
| `amount_in_words` | Any number or amount in English or Urdu words |
| `roman_to_urdu` | Roman Urdu → Urdu script |
| `urdu_date` | A date in Urdu and its Hijri date |
| `list_cities` | Provinces and major cities, with Urdu names |
| `find_bank` | Pakistani banks by IBAN code or name |

All tools are **read-only**, run **locally** on your computer, and need **no API key or internet**. Nothing you ask is sent anywhere by this server.

## Setup

You need [Node.js](https://nodejs.org) 20 or newer.

### Claude Desktop

1. Open Claude Desktop → **Settings** → **Developer** → **Edit Config**.
2. Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pakistan": {
      "command": "npx",
      "args": ["-y", "pakistan-mcp"]
    }
  }
}
```

3. Restart Claude Desktop. You'll see the Pakistan tools in the tools menu.

### Claude Code

```bash
claude mcp add pakistan -- npx -y pakistan-mcp
```

### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "pakistan": {
      "command": "npx",
      "args": ["-y", "pakistan-mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "pakistan": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "pakistan-mcp"]
    }
  }
}
```

### Any other MCP client

Run `npx -y pakistan-mcp` as a **stdio** server. It supports MCP protocol versions from 2024-11-05 to the latest.

## Use it in your own code

You can also create the server in your own Node.js app, for example to serve it over HTTP:

```js
import { createServer } from 'pakistan-mcp';

const server = createServer(); // an McpServer with all 12 tools registered
```

If you only need the functions, not MCP, use [pakistan-toolkit](https://github.com/mubasher1111/pakistan-toolkit) and [urdu-toolkit](https://github.com/mubasher1111/urdu-toolkit) directly.

## Accuracy

- **Tax** uses the official FBR salaried slabs, including the FY2026-27 slabs from the Finance Act 2026. It is an estimate for salaried income only and is **not tax advice**: exemptions, credits and other income are not included.
- **CNIC, NTN, phone and IBAN** checks verify format and checksum only. They don't contact NADRA, FBR, PTA or any bank.
- **Hijri dates** use the Umm al-Qura calendar. Pakistan follows local moon sighting, so the official date can differ by one day.
- **Roman Urdu** conversion is reliable for common words. Rare words are converted phonetically and may need correction.

## Development

```bash
git clone https://github.com/mubasher1111/pakistan-mcp.git
cd pakistan-mcp
npm install
npm test       # starts the server over stdio and calls every tool
npm start      # run the server
```

The tests talk to the real server over stdio, exactly as Claude Desktop does.

## License

[MIT](LICENSE). Made by [ZexCart](https://zexcart.site). More free tools: [zexcart.site/dev-tools](https://zexcart.site/dev-tools/).

If this is useful, please ⭐ **star the repo**.
