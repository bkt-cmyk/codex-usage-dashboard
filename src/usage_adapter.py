"""Read-only usage snapshot adapter; never calls reset/redeem endpoints."""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import logging
import sys
import importlib.util
from pathlib import Path


def safe_helper():
    # run_path bootstrap does not guarantee this script's directory is on sys.path.
    spec = importlib.util.spec_from_file_location('_dashboard_safe_usage', Path(__file__).with_name('safe_usage.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def snapshot_document(snapshot):
    from hermes_cli.subcommands.usage import usage_snapshot_document

    document = usage_snapshot_document(snapshot)
    raw = snapshot.raw if isinstance(snapshot.raw, dict) else {}
    credits = raw.get('rate_limit_reset_credits')
    count = credits.get('available_count') if isinstance(credits, dict) else None
    # Absence is unknown. Do not use Hermes' helper, which defaults absence to 0.
    if isinstance(count, bool) or not isinstance(count, (int, float)) or count < 0 or not float(count).is_integer():
        count = None
    else:
        count = int(count)
    document['reset_credits'] = {
        'available_count': count,
        'status': 'unavailable' if count is None else ('available' if count > 0 else 'none'),
        'source': 'usage_api.rate_limit_reset_credits.available_count',
        'same_usage_response': True,
    }
    identity = getattr(snapshot, 'identity', None)
    document['account_fingerprint'] = hashlib.sha256(identity.encode()).hexdigest() if isinstance(identity, str) and identity else None
    # Only opaque account fingerprint; no raw body, identity, credentials or headers.
    return document


def main():
    logging.disable(logging.CRITICAL)
    try:
        # Never use the upstream wrapper: it refreshes during resolution even
        # with read_only=True. A single shared safe GET supplies every number.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from agent import account_usage as usage
            snapshot = safe_helper().fetch_snapshot(usage)
            if snapshot is None or snapshot.unavailable_reason:
                raise RuntimeError('Usage unavailable')
            document = snapshot_document(snapshot)
        print(json.dumps(document, allow_nan=False))
        return 0
    except Exception:
        print('Read-only usage adapter unavailable (details suppressed)', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
