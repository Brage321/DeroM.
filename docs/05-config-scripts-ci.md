# 05 — config, scripts, CI, docs

## Config

`derom.config.json` has three sections: `consensus.targetSpacingSeconds`
(300), `http.host`/`http.port` (`127.0.0.1:8080`), and `stratum.listenHost`,
`port`, `advertiseHost`, `minimumShareDifficulty` (`127.0.0.1:3333`, 32).
Env vars override file values; spacing changes alter consensus.

## Scripts

- `start.bat` runs `node server.js` from its own directory.
- `start-lan.bat` adds `DEROM_STRATUM_HOST=0.0.0.0` for LAN ASICs. Dashboard
  remains loopback-only. Neither script is for public-internet exposure.
- `allow-stratum-firewall.bat` self-elevates and opens inbound TCP 3333, which
  Windows blocks by default; without it an ASIC on another device cannot
  connect even though the node listens on 0.0.0.0.

## CI

`.github/workflows/ci.yml`:

- `node-tests` on Ubuntu checks out source, sets up Node 22, runs `npm test`.
- `wallet-windows-build` only on version tags/manual dispatch publishes the
  self-contained Windows wallet and writes `SHA256SUMS`.

## Policy/docs files

- `README.md`: scope, startup, LAN setup, config, protocol, wallet,
  consensus values, release blockers.
- `CHANGELOG.md`: user-visible changes per version.
- `TRANSPARENCY.md`: review entry point and commit-history policy.
- `SOURCE_MAP.md`: every tracked file/function/class/endpoint/message.
- `POOL_REVIEW.md`: pool feasibility brief.
- `POOL_INTEGRATION.md`: future RPC/adapter seam; no pool support today.
- `TOKENOMICS.md`: issuance, cap handling, no-value warning.
- `SECURITY.md`: development-only scope and private reporting.
- `LICENSE`: Unlicense/public-domain terms.
- `global.json`: pinned .NET SDK for reproducible wallet builds.
