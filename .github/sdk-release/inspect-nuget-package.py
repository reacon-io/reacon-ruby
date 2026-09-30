"""Validate an unsigned retained Reacon package without loading assemblies."""
import base64
import hashlib
import json
from pathlib import Path
import stat
import sys
import xml.etree.ElementTree as ET
import zipfile


def inspect_package(path, version):
    entries = {}
    folded = set()
    total = 0
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            name = info.filename
            if (name.startswith('/') or '\\' in name or any(p in ('', '.', '..') for p in name.rstrip('/').split('/')) or
                    name.casefold() in folded or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1):
                raise ValueError('Unsafe or duplicate NuGet archive entry')
            folded.add(name.casefold())
            total += info.file_size
            if len(folded) > 10000 or info.file_size > 64 * 1024 * 1024 or total > 256 * 1024 * 1024:
                raise ValueError('Oversized NuGet package')
            if not info.is_dir():
                entries[name] = archive.read(info)
    if '.signature.p7s' in folded:
        raise ValueError('Expected unsigned retained package; author signing requires separate qualification')
    if [name for name in entries if name.lower().endswith('.nuspec')] != ['Reacon.Sdk.nuspec']:
        raise ValueError('Expected exactly the Reacon package manifest')
    xml = entries['Reacon.Sdk.nuspec']
    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise ValueError('NuGet manifest entities are forbidden')
    root = ET.fromstring(xml)
    ns = {'n': 'http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd'}
    metadata = root.find('n:metadata', ns)
    if root.tag != '{' + ns['n'] + '}package' or metadata is None:
        raise ValueError('Invalid NuGet manifest')

    def one(name):
        found = metadata.findall('n:' + name, ns)
        if len(found) != 1:
            raise ValueError('Missing or ambiguous NuGet metadata')
        return found[0]

    if one('id').text != 'Reacon.Sdk' or one('version').text != version:
        raise ValueError('Unexpected NuGet package identity')
    if one('license').text != 'Apache-2.0' or one('license').get('type') != 'expression':
        raise ValueError('Unexpected NuGet license')
    if one('repository').attrib != {'type': 'git', 'url': 'https://github.com/reacon-io/reacon-csharp.git'}:
        raise ValueError('Unexpected NuGet repository')
    if one('readme').text != 'README.md' or not entries.get('README.md') or not entries.get('LICENSE'):
        raise ValueError('Missing NuGet README or license file')
    for framework in ['net8.0', 'net10.0']:
        if not entries.get(f'lib/{framework}/Reacon.Sdk.dll') or not entries.get(f'lib/{framework}/Reacon.Sdk.xml'):
            raise ValueError('Missing qualified .NET target assembly or documentation')
    return {'formatVersion': 1, 'kind': 'sdk-nuget-upload-metadata', 'name': 'Reacon.Sdk', 'version': version,
            'contentSha512': base64.b64encode(hashlib.sha512(Path(path).read_bytes()).digest()).decode(),
            'archiveFiles': len(entries), 'frameworks': ['net8.0', 'net10.0'], 'unsigned': True,
            'rebuilt': False, 'executedPackageCode': False, 'publishable': False}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Expected retained nupkg and native version')
    print(json.dumps(inspect_package(sys.argv[1], sys.argv[2])))
