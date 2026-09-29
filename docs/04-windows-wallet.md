# 04 — Windows wallet walkthrough

File: `wallet-app/Program.cs`, namespace `DeroMWallet`.

- `Program.Main()` handles `--crypto-check` by printing the RIPEMD-160 empty
  hash, generating secp256k1, deriving its address, encrypting/decrypting with
  `DeroM-Test-Passphrase-01`, verifying round-trip bytes, and printing the
  address. Otherwise it starts `MainForm`.
- `MainForm` shows total balance, node height, address, create/restore/copy/
  export buttons, local-node help, and status. It polls every 5 seconds and
  loads `%APPDATA%/DeroM/wallet.json` on startup.
- `CreateWallet()` warns before replacing an existing wallet, prompts for a
  passphrase, creates secp256k1, builds the 65-byte public key, derives the
  address, encrypts, saves, applies to UI, and updates status.
- `Restore()` opens a JSON file dialog, prompts for its passphrase, verifies
  decryption and address derivation before saving, then applies it.
- `Export()` copies the stored wallet JSON to a user-selected backup path.
- `CopyAddress()` copies the loaded address to clipboard.
- `Save(file)` creates the wallet directory and writes indented JSON.
- `Apply(file)` sets the in-memory/UI address and refreshes node data.
- `RefreshNode()` fetches loopback `/api/state` and `/api/balance/*`,
  converts atomic units to DERM, or shows offline placeholders.
- `PasswordDialog` requires at least 10 characters before `OK` closes.
- `WalletFile` is the backup schema: format, version, network, address,
  publicKey, KDF, salt, cipher, IV, tag, ciphertext.
- `WalletCrypto.Encrypt()` uses random 16-byte salt and 12-byte IV,
  600,000-iteration PBKDF2-SHA256, AES-256-GCM with address as associated
  data, zeroes the key, and returns lowercase-hex fields.
- `WalletCrypto.Decrypt()` validates format/network/version, derives the key,
  decrypts, zeroes the key, re-derives public key/address, and rejects
  mismatch or wrong passphrase.
- `AddressCodec.FromPublicKey()` builds version `0x35` plus HASH160 payload
  and double-SHA-256 checksum, then Base58-encodes it.
- `Ripemd160.Hash()` is the local RIPEMD-160 implementation.
- `Card()`, `LabelText()`, `Button()` are layout-only WinForms helpers.
