#!/bin/sh
set -eu
python -m venv /cache/recording-venv
if [ -n "${REACON_REUSE_ARTIFACTS:-}" ]; then
  cp "$REACON_REUSE_ARTIFACTS/"* /results/artifacts/
else
  /cache/recording-venv/bin/pip install --disable-pip-version-check 'build==1.6.1'
  # Default build creates the wheel from the sdist, validating both distributions.
  /cache/recording-venv/bin/python -m build --outdir /results/artifacts .
fi
set -- /results/artifacts/*.whl
test "$#" -eq 1
/cache/recording-venv/bin/pip install --disable-pip-version-check --force-reinstall "$1"
if [ "${REACON_PYTHON_SYNC:-}" = 1 ]; then
  /cache/recording-venv/bin/python /suite/python.py --sync
else
  /cache/recording-venv/bin/python /suite/python.py
fi
