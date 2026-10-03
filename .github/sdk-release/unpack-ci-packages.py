#!/usr/bin/env python3
"""Read only the reviewed CI artifact layout; never extract arbitrary ZIP paths."""
import hashlib
import json
import re
import stat
import sys
import zipfile
from pathlib import Path


def unpack(archive_path, output):
    output = Path(output)
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        if len(entries) > 32 or len({entry.filename for entry in entries}) != len(entries):
            raise ValueError("Unexpected or duplicate CI artifact entries")
        for entry in entries:
            mode = entry.external_attr >> 16
            if entry.flag_bits & 1 or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError("Unexpected CI artifact file type")
            if entry.file_size > 256 * 1024 * 1024:
                raise ValueError("Oversized CI artifact entry")
        manifest_entry = archive.getinfo("package-manifest.json")
        if manifest_entry.file_size > 65536:
            raise ValueError("Oversized CI package manifest")
        manifest_bytes = archive.read(manifest_entry)
        manifest = json.loads(manifest_bytes)
        files = manifest["files"]
        if not isinstance(files, dict) or not 1 <= len(files) <= 8 or any(not re.fullmatch(r"[A-Za-z0-9_.-]+", name) for name in files):
            raise ValueError("Invalid CI package names")
        wanted = {"evidence.json", "responses.json", "run.log", "package-manifest.json"} | {f"artifacts/{name}" for name in files}
        if any(entry.filename == "verification-cache.json" for entry in entries):
            wanted.add("verification-cache.json")
        actual = {entry.filename for entry in entries if not entry.is_dir()}
        if actual != wanted or any(entry.is_dir() and entry.filename != "artifacts/" for entry in entries):
            raise ValueError("Unexpected CI artifact layout")
        if sum(entry.file_size for entry in entries) > 512 * 1024 * 1024:
            raise ValueError("Oversized CI artifact")
        evidence_entry = archive.getinfo("evidence.json")
        if evidence_entry.file_size > 8 * 1024 * 1024:
            raise ValueError("Oversized CI evidence")
        verified = {}
        package_bytes = {}
        for name, expected in files.items():
            entry = archive.getinfo(f"artifacts/{name}")
            if entry.file_size <= 0 or entry.file_size != expected["size"]:
                raise ValueError("CI package size mismatch")
            data = archive.read(entry)
            identity = {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
            if identity != expected:
                raise ValueError("CI package digest mismatch")
            verified[name] = identity
            package_bytes[name] = data
        cache_bytes = None
        if "verification-cache.json" in wanted:
            cache_bytes = archive.read("verification-cache.json")
            if len(cache_bytes) > 65536:
                raise ValueError("Oversized verification proof")
            json.loads(cache_bytes)
        # Validate the entire archive before writing any members.
        evidence_bytes = archive.read(evidence_entry)
        (output / "artifacts").mkdir()
        for name, data in package_bytes.items():
            with (output / "artifacts" / name).open("xb") as handle:
                handle.write(data)
        for name, data in [("package-manifest.json", manifest_bytes), ("evidence.json", evidence_bytes)]:
            with (output / name).open("xb") as handle:
                handle.write(data)
        if cache_bytes is not None:
            (output / "verification-cache.json").write_bytes(cache_bytes)
        return verified


def unpack_source(archive_path, output):
    """Go/PHP retain test reports without a native package archive."""
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        wanted = {"evidence.json", "responses.json", "run.log"}
        if any(entry.filename == "verification-cache.json" for entry in entries):
            wanted.add("verification-cache.json")
        if len(entries) != len(wanted) or {entry.filename for entry in entries} != wanted:
            raise ValueError("Unexpected source CI artifact layout")
        for entry in entries:
            mode = entry.external_attr >> 16
            if entry.flag_bits & 1 or stat.S_IFMT(mode) not in (0, stat.S_IFREG):
                raise ValueError("Unexpected source CI file type")
            if entry.file_size > 32 * 1024 * 1024:
                raise ValueError("Oversized source CI entry")
        entry = archive.getinfo("evidence.json")
        if entry.file_size > 8 * 1024 * 1024:
            raise ValueError("Oversized source CI evidence")
        data = archive.read(entry)
        if "verification-cache.json" in wanted:
            cache_bytes = archive.read("verification-cache.json")
            if len(cache_bytes) > 65536:
                raise ValueError("Oversized verification proof")
            json.loads(cache_bytes)
            (Path(output) / "verification-cache.json").write_bytes(cache_bytes)
        json.loads(data)
        with (Path(output) / "evidence.json").open("xb") as handle:
            handle.write(data)
        return {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}


if __name__ == "__main__":
    if sys.argv[1] == "--source":
        print(json.dumps(unpack_source(sys.argv[2], sys.argv[3])))
    else:
        print(json.dumps(unpack(sys.argv[1], sys.argv[2])))
