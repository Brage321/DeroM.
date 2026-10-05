#!/usr/bin/env python3
"""Recompute the committed DeroM genesis transaction and header hashes."""

import hashlib
import struct

PUBKEY = bytes.fromhex(
    "04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61de"
    "b649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f"
)
PUBKEY_SCRIPT = bytes([len(PUBKEY)]) + PUBKEY + bytes([0xAC])


def sha256d(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def compact_size(value):
    if value < 253:
        return bytes([value])
    if value <= 0xFFFF:
        return b"\xfd" + struct.pack("<H", value)
    raise ValueError("unexpectedly large CompactSize value")


def genesis(timestamp, time, nonce, bits, expected_hash, expected_merkle):
    encoded_time = timestamp.encode("ascii")
    # CScript << 486604799 << CScriptNum(4) << timestamp bytes.
    script_sig = b"\x04\xff\xff\x00\x1d\x01\x04" + bytes([len(encoded_time)]) + encoded_time
    tx = (
        struct.pack("<i", 1)
        + b"\x01"
        + bytes(32)
        + b"\xff\xff\xff\xff"
        + compact_size(len(script_sig))
        + script_sig
        + b"\xff\xff\xff\xff"
        + b"\x01"
        + struct.pack("<q", 0)
        + compact_size(len(PUBKEY_SCRIPT))
        + PUBKEY_SCRIPT
        + struct.pack("<I", 0)
    )
    merkle = sha256d(tx)
    header = (
        struct.pack("<i", 1)
        + bytes(32)
        + merkle
        + struct.pack("<III", time, bits, nonce)
    )
    block_hash = sha256d(header)[::-1].hex()
    merkle_hash = merkle[::-1].hex()
    assert merkle_hash == expected_merkle, (merkle_hash, expected_merkle)
    assert block_hash == expected_hash, (block_hash, expected_hash)
    print(f"genesis={block_hash} merkle={merkle_hash}")


if __name__ == "__main__":
    genesis(
        "DeroM SHA-256 ASIC network launch 2026-09-27",
        1790467200,
        2590823,
        0x1E00FFFF,
        "0000000856d6d4820f05d39679b5837b1802f8689794655519da0213df01324a",
        "22b7ca1d80615c0fe6377760fc727ae5d81a074ab8d8aa5e0e174fbb4cce1eb1",
    )
    genesis(
        "DeroM test network genesis 2026-09-27",
        1790467200,
        4,
        0x207FFFFF,
        "079151cc9072a3ca272b5bd030a259b09fdda6dd7a2d9e43c968ed93808fd9bf",
        "3d6f886bd3eb633843f00a1f4f729cf59b93ec81b1e034ed38e1691a919e68a4",
    )
