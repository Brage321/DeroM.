# 02 — dashboard UI walkthrough

## `app.js`

- `showToast(message)` shows a transient status message.
- `targetLabel(seconds)` formats 60/300/etc. as minute labels.
- `updateWallet(address)` stores the address, swaps empty/created panels,
  displays the address, enables copy, and refreshes balance.
- `copyText(value, success)` copies wallet or Stratum endpoint text.
- `api(path, options)` wraps `fetch`, parses JSON, throws node error text.
- `refreshBalance()` fetches `/api/balance/*`, converts atomic units using
  100,000,000 per DERM, and formats 2-8 decimals.
- `refreshState()` fetches `/api/state`, updates node label/detail/dot,
  height, miner count, share-difficulty display, endpoint help, miner status,
  and latest-block activity. On fetch failure it renders the offline UI.
- Wallet submit handler checks matching passphrases, disables the button
  while generating, calls `/api/wallet/create`, updates the wallet panel,
  closes the dialog, downloads the encrypted backup, and restores the button.
- `downloadBackup(data, address)` downloads `derom-wallet-<address>.json`.
- Bottom wiring connects backup download, copy buttons, manual refresh,
  setup dialog, dialog backdrop close, persisted address restore, initial
  refresh, and 2.5-second polling.

## `index.html`

Sidebar brand/network pill, node status card, top bar, welcome/create-wallet
header, balance/height/miner cards, wallet panel with empty and created
states, solo-mining panel with endpoint/worker/password/algorithm/share floor,
network activity panel, footer version, toast, wallet dialog with 12-char
passphrase fields, setup dialog with three setup steps, and `app.js` script.

## `styles.css` and `forms.css`

`styles.css` owns layout/cards/panels/responsive dashboard styling.
`forms.css` owns dialog/input/button/warning styling.
