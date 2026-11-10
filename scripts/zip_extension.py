import os
import sys
import zipfile


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: zip_extension.py <folder> <output.zip>')

    folder, output = sys.argv[1:]
    if not os.path.isdir(folder):
        raise SystemExit(f'Folder does not exist: {folder}')
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    files = []
    for root, _, names in os.walk(folder):
        for name in names:
            path = os.path.join(root, name)
            archive_name = os.path.relpath(path, folder).replace(os.sep, '/')
            files.append((archive_name, path))

    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for archive_name, path in sorted(files):
            archive.write(path, archive_name)


if __name__ == '__main__':
    main()
