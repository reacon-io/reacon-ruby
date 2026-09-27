import hashlib, importlib.metadata, json, os, pathlib, zipfile
import reacon_sdk
version = os.environ['REACON_SDK_PACKAGE_VERSION']
assert importlib.metadata.version('reacon-sdk') == version
root = pathlib.Path(reacon_sdk.__file__).resolve().parent.parent
assert str(root).startswith('/cache/recording-venv/lib/')
archive = pathlib.Path('/artifacts') / ('reacon_sdk-' + version + '-py3-none-any.whl')
files = 0
with zipfile.ZipFile(archive) as wheel:
    for item in wheel.infolist():
        if not item.is_dir() and item.filename.startswith('reacon_sdk/'):
            relative = pathlib.PurePosixPath(item.filename)
            assert '..' not in relative.parts
            assert (root / item.filename).read_bytes() == wheel.read(item)
            files += 1
assert files > 0
pathlib.Path('/results/streaming-runtime.json').write_text(json.dumps(dict(
    packageVersion=version, installedFilesCompared=files, installedMatchesRetainedWheel=True,
    archiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest())))
