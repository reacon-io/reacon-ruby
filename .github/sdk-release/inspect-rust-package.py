"""Read a retained crate; never extract, execute, rebuild or upload it."""
import hashlib
import json
import sys
import tarfile
import tomllib
from pathlib import PurePosixPath


def inspect_crate(path, expected_version):
    root = f"reacon-sdk-{expected_version}"
    entries = {}
    folded = set()
    total = 0
    with tarfile.open(path, "r:gz") as archive:
        for entry in archive:
            parts = PurePosixPath(entry.name).parts
            if (not parts or parts[0] != root or entry.name.startswith("/") or
                    "\\" in entry.name or any(part in ("", ".", "..") for part in entry.name.rstrip("/").split("/"))):
                raise ValueError("Unsafe crate archive path")
            if not (entry.isfile() or entry.isdir()):
                raise ValueError("Crate links and special files are forbidden")
            if entry.name.casefold() in folded:
                raise ValueError("Duplicate crate path")
            folded.add(entry.name.casefold())
            total += entry.size
            if len(folded) > 10000 or entry.size > 8 * 1024 * 1024 or total > 64 * 1024 * 1024:
                raise ValueError("Oversized crate archive")
            if entry.isfile():
                entries[entry.name] = archive.extractfile(entry).read()
    manifest = tomllib.loads(entries[f"{root}/Cargo.toml"].decode())
    package = manifest["package"]
    if package.get("name") != "reacon-sdk" or package.get("version") != expected_version or package.get("license") != "Apache-2.0":
        raise ValueError("Unexpected crate identity or license")
    if any(key in manifest for key in ("workspace", "patch", "replace")):
        raise ValueError("Retained crate must be a standalone package")
    if package.get("publish") not in (None, ["crates-io"]):
        raise ValueError("Crate cannot be published to crates.io")
    if package.get("repository") != "https://github.com/reacon-io/reacon-rust":
        raise ValueError("Unexpected crate repository")
    dependencies = []

    def add_dependencies(section, target=None):
        for table, kind in (("dependencies", "normal"), ("dev-dependencies", "dev"), ("build-dependencies", "build")):
            for name, value in section.get(table, {}).items():
                value = {"version": value} if isinstance(value, str) else value
                if (not isinstance(value, dict) or not isinstance(value.get("version"), str) or
                        any(key in value for key in ("git", "path", "registry", "registry-index", "workspace"))):
                    raise ValueError("Crate dependencies must resolve on crates.io")
                features = value.get("features", [])
                optional = value.get("optional", False)
                defaults = value.get("default-features", True)
                if not isinstance(features, list) or not all(isinstance(feature, str) for feature in features) or not isinstance(optional, bool) or not isinstance(defaults, bool):
                    raise ValueError("Invalid crate dependency options")
                dependencies.append({"name": value.get("package", name), "version_req": value["version"],
                                     "features": features, "optional": optional, "default_features": defaults,
                                     "target": target, "kind": kind, "registry": None,
                                     "explicit_name_in_toml": name if "package" in value else None})

    add_dependencies(manifest)
    for target, section in manifest.get("target", {}).items():
        add_dependencies(section, target)
    readme_file = package.get("readme")
    if not isinstance(readme_file, str) or f"{root}/{readme_file}" not in entries:
        raise ValueError("Retained crate must contain its declared README")
    metadata = {"name": package["name"], "vers": package["version"], "deps": dependencies,
                "features": manifest.get("features", {}), "authors": package.get("authors", []),
                "description": package.get("description"), "documentation": package.get("documentation"),
                "homepage": package.get("homepage"), "readme": entries[f"{root}/{readme_file}"].decode(),
                "readme_file": readme_file, "keywords": package.get("keywords", []), "categories": package.get("categories", []),
                "license": package["license"], "license_file": package.get("license-file"), "repository": package["repository"],
                "badges": manifest.get("badges", {}), "links": package.get("links"), "rust_version": package.get("rust-version")}
    return {"formatVersion": 1, "kind": "sdk-crate-upload-metadata", "metadata": metadata,
            "archiveFiles": len(entries), "manifestSha256": hashlib.sha256(entries[f"{root}/Cargo.toml"]).hexdigest(),
            "rebuilt": False, "executedPackageCode": False, "publishable": False}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Expected crate file and reserved native version")
    print(json.dumps(inspect_crate(sys.argv[1], sys.argv[2])))
