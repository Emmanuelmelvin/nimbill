# NimBill Agent Wallet — MCP Server

Give any AI agent (Claude Desktop, Claude Code, Cursor, Windsurf, Google Antigravity) **its own non-custodial Nimiq wallet** and full access to NimBill:

- **Own Nimiq Wallet & `@tag`:** Automatically generates a persistent Ed25519 Nimiq wallet at `~/.nimbill/agent-wallet.json` (or uses `NIMBILL_AGENT_SECRET_KEY`) and signs in to NimBill with `Nimiq Signed Message`.
- **Pay Invoices & Boards On-Chain:** Locks 5-minute quotes, signs Nimiq Albatross transactions (including `"NimBill <id>"` memos), broadcasts them on-chain, and verifies payment.
- **Send by `@tag`:** Sends NIM to any `tag@nimbill` and verifies on-chain.
- **Write & Cash Cheques:** Writes non-custodial 2-of-2 Ed25519 cheques (`CHQ-…`) or cashes cheques straight into the agent's wallet (or any `@tag`) without needing gas first.
- **Issue Invoices:** Creates invoices as the agent merchant so people or other agents can pay the agent.

---

## Quick Start

### 1. Run via MCP in Claude Desktop / Cursor / Antigravity

Add this to your MCP configuration (`claude_desktop_config.json`, `.cursor/mcp.json`, or Antigravity MCP settings). Requires Node.js 18.17+:

```json
{
  "mcpServers": {
    "nimbill": {
      "command": "npx",
      "args": ["-y", "nimbill-mcp"],
      "env": {
        "NIMBILL_URL": "https://nimbill.mblob.me",
        "NIMBILL_WALLET_PASSPHRASE": "choose-a-strong-passphrase"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add nimbill -e NIMBILL_URL=https://nimbill.mblob.me -- npx -y nimbill-mcp
```

Running from a clone of this repo instead? Use `"command": "node"` with `"args": ["/absolute/path/to/nimbill/mcp/index.mjs"]`.

### Environment Variables (Optional)

| Variable                    | Default                        | Description                                                                                               |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `NIMBILL_URL`               | `https://nimbill.mblob.me`     | Base URL of the NimBill instance                                                                          |
| `NIMBILL_AGENT_SECRET_KEY`  | _(auto-generated)_             | 64-char hex Ed25519 secret key. If omitted, a persistent key is created at `~/.nimbill/agent-wallet.json` |
| `NIMBILL_WALLET_FILE`       | `~/.nimbill/agent-wallet.json` | Custom file path for storing the auto-generated agent wallet                                              |
| `NIMBILL_WALLET_PASSPHRASE` | _(none: unencrypted)_          | Encrypts the wallet file and saved cheque secrets with scrypt + AES-256-GCM. Strongly recommended         |
| `NIMBILL_MAX_PAYMENT_NIM`   | `100`                          | Largest single payment, transfer or cheque the agent may send (NIM)                                       |
| `NIMBILL_MAX_DAILY_NIM`     | `500`                          | Most NIM the agent may send in any rolling 24 hours                                                       |
| `NIMIQ_RPC_URL`             | `https://rpc.nimiqwatch.com`   | Nimiq Mainnet Albatross JSON-RPC endpoint                                                                 |

### Safety

- **Keep only small amounts in the agent wallet.** Anything that can run the agent can spend from it.
- **Encrypt the key.** Without `NIMBILL_WALLET_PASSPHRASE` the key is stored in plain text. On Windows the file's owner-only mode has no effect, so other programs running as you can read it.
- **Spending limits** stop a single call, or a run of calls, from draining the wallet. They are enforced locally and logged in `spend-log.json` next to the wallet file.
- **`buy_from_board` doesn't pay unless `payNow: true`**, and the paying tools are marked `destructiveHint` so MCP clients can ask before running them.
- **Cheque secrets are saved** in `cheques.json` next to the wallet file before a cheque is funded, so the agent can always cancel cheques it wrote (`cancel_cheque` accepts just the cheque number).

---

## Available MCP Tools (15 Tools)

| Tool             | Description                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `wallet_status`  | Check the agent's `NQ…` address, live on-chain NIM balance, and NimBill `@tag` profile                   |
| `setup_profile`  | Set the agent's display name, bio, default currency, and claim a `@tag`                                  |
| `lookup_tag`     | Resolve any `tag@nimbill` to its owner's name, Nimiq address, and avatar                                 |
| `get_rates`      | Live NIM and USDT prices in 19 supported fiat currencies                                                 |
| `get_board`      | Read a merchant's `/pay/<tag>` board and listed products                                                 |
| `buy_from_board` | Create an order on `/pay/<tag>` and pay it on-chain from the agent's wallet                              |
| `get_invoice`    | Read any NimBill invoice by ID or `NMN-…` number                                                         |
| `pay_invoice`    | Lock a quote, sign & broadcast the NIM payment with memo, and verify on-chain                            |
| `create_invoice` | Create a new invoice so clients or other agents can pay the agent                                        |
| `list_invoices`  | List all invoices created by the agent                                                                   |
| `send_to_tag`    | Send NIM to any `@tag` and verify the transfer on-chain                                                  |
| `write_cheque`   | Create and fund a non-custodial cheque (free or locked to a `@tag`), returning the link and `CHQ-…` code |
| `cash_cheque`    | Cash a cheque link or `CHQ-…` code on-chain to the agent's wallet or any `@tag`                          |
| `cancel_cheque`  | Cancel an uncashed cheque written by the agent and reclaim the NIM                                       |
| `list_cheques`   | List all cheques written by the agent                                                                    |
