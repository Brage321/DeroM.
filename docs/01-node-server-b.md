# 01 continued — HTTP API and startup

## `api(req, res, url)`

- `GET /api/state` returns name, network, height, tip, latest block, current
  and next bits, spacing, share floor, accepted shares, rewards, supply,
  miner count, Stratum URL, and development status.
- `GET /api/blocks` returns the newest 20 blocks.
- `GET /api/balance/:address` validates the address, then returns atomic units.
- `POST /api/wallet/create` reads passphrase JSON, creates wallet, returns
  address, public key, balance, encrypted backup, and passphrase warning.
- `GET /api/wallet/backup/:address` returns the stored encrypted backup file.
- Unknown routes return 404; handler errors return 400 with a message.

## `webServer()`

Non-`/api/` requests serve only four allow-listed dashboard files. All other
paths return 404. Responses include content type, `nosniff`, and a restrictive
CSP allowing only self plus Google Fonts.

## Startup

- `listen(server, host, port, label)` labels port conflicts.
- `start()` claims dashboard port first, then Stratum, so a second instance
  exits cleanly without splitting services.
- `EADDRINUSE` prints which port/service conflicts and reminds the user not to
  run `start.bat` and `start-lan.bat` together.
- Success logs height, subsidy/cap, dashboard URL, and Stratum endpoint.
- `module.exports` exposes consensus/address helpers to the test suite.
