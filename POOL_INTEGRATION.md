# Future pool integration

The node currently supports self-hosted mining only. Its Stratum V1 listener advertises and counts shares at the configured minimum difficulty (1,000 by default), and separately accepts network blocks. It does not track durable per-worker shares, estimate worker hashrate, authenticate pool operators, or calculate pool payouts. A conventional pool cannot use this listener as a complete coin backend yet.

The integration settings are grouped in `derom.config.json`:

```json
{
  "consensus": { "targetSpacingSeconds": 300 },
  "http": { "host": "127.0.0.1", "port": 8080 },
  "stratum": { "listenHost": "127.0.0.1", "port": 3333, "advertiseHost": "", "minimumShareDifficulty": 1000 }
}
```

When adding a pool backend, keep these roles distinct:

1. Add authenticated node RPC for block templates, current tip/difficulty, block submission, and transaction handling.
2. Add a pool-facing Stratum adapter with per-worker share difficulty and validation; do not expose the node's solo listener as if it were a pool.
3. Configure the pool software to use the node RPC endpoint and place its external miner URL, port, TLS, and payout policy in a separate pool configuration section.
4. Verify submitted pool blocks against the same consensus rules and test stale jobs, duplicate shares, restarts, and payouts before public operation.

The JSON config is the stable home for timing and listener settings. The future pool adapter can read the same settings without changing ASIC-facing deployment instructions. Until that adapter and the chain's missing transaction/network features exist, advertise only local solo mining on the development chain.
