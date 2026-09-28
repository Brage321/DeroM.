# DeroM Wallet for Windows

`DeroMWallet.exe` is a Windows desktop wallet for the DeroM development chain. It creates secp256k1 keys locally, derives the same Base58Check address format as the node, encrypts private keys, and stores the encrypted wallet at `%APPDATA%\DeroM\wallet.json`.

## Use

1. Start the DeroM node on this computer with its HTTP API at `127.0.0.1:8080`.
2. Open `DeroMWallet.exe` and choose **Create wallet**. Choose a passphrase with at least 10 characters.
3. Export an encrypted backup and keep both the backup and passphrase somewhere safe. The wallet does not save the passphrase.
4. Copy the displayed address into your ASIC's Stratum worker name. The wallet checks balance and chain height from the local node every few seconds.

Use **Restore backup** to restore a backup created by this Windows wallet. The standalone executable includes the .NET runtime and does not require a separate .NET installation.

## Limits

This app targets the existing `derom-devnet` format. It cannot send transactions because the current node does not implement transaction construction, signing, or broadcast. The chain has no peer-to-peer networking, so balances and mined rewards exist only in the node's local chain data. Do not use it for real funds or expose the development node to the public internet. Wallet backup encryption uses PBKDF2-SHA256 and AES-256-GCM; the web dashboard's older scrypt-encrypted wallet backup is a separate format and is not importable here.
