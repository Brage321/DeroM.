# DeroM Wallet for Windows

`DeroMWallet.exe` is a Windows desktop wallet for the DeroM development chain. It creates secp256k1 keys locally, derives the same Base58Check address format as the node, encrypts private keys, and stores the encrypted wallet at `%APPDATA%\DeroM\wallet.json`.

## Use

1. Start the DeroM node on this computer with its HTTP API at `127.0.0.1:8080`.
2. Open `DeroMWallet.exe` and choose **Create wallet**. Choose a passphrase with at least 10 characters.
3. Export an encrypted backup and keep both the backup and passphrase somewhere safe. The wallet does not save the passphrase.
4. Copy the displayed address into your ASIC's Stratum worker name. The wallet checks balance and chain height from the local node every few seconds.

Use **Restore backup** to restore a backup created by this Windows wallet. The standalone executable includes the .NET runtime and does not require a separate .NET installation.

## Building the release executable

The published `DeroMWallet.exe` is a self-contained single-file build, so it runs
on a clean Windows machine without a separate .NET installation. Rebuild it from
a tagged commit like this:

```powershell
dotnet publish wallet-app/DeroMWallet.csproj -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:EnableCompressionInSingleFile=true -p:DebugType=none -p:DebugSymbols=false `
  -o work/wallet-release
```

The output directory must contain only `DeroMWallet.exe` (about 47 MB). Build from
the exact commit the release is tagged; the commit hash is embedded in the file's
`ProductVersion` property, so you can confirm which source an executable came from.
The SHA-256 of the published file is listed on the GitHub release page. The build
is not code-signed, so Windows SmartScreen may show an "unknown publisher" warning
for a downloaded copy the first time it runs.


## Verification without a node

Run the executable with `--crypto-check` to print the RIPEMD-160 test vector and a
reference address and exit, proving the build works without a running node.


This app targets the existing `derom-devnet` format. It cannot send transactions because the current node does not implement transaction construction, signing, or broadcast. The chain has no peer-to-peer networking, so balances and mined rewards exist only in the node's local chain data. Do not use it for real funds or expose the development node to the public internet. Wallet backup encryption uses PBKDF2-SHA256 and AES-256-GCM; the web dashboard's older scrypt-encrypted wallet backup is a separate format and is not importable here.
