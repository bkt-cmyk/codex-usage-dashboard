"""Shared non-mutating Codex credential/header and snapshot handling."""
from __future__ import annotations


def credentials(usage):
    creds = usage.resolve_codex_runtime_credentials(refresh_if_expiring=False, read_only=True)
    token = creds['api_key']
    account_id = None
    try:
        tokens = usage._read_codex_tokens(_lock=False).get('tokens') or {}
        # A singleton account override is authoritative only for its exact token.
        if tokens.get('access_token') == token:
            account_id = tokens.get('account_id')
            if account_id is not None and not isinstance(account_id, str):
                raise ValueError('Account unavailable')
            account_id = (account_id or '').strip() or None
    except usage.AuthError:
        pass
    return token, creds.get('base_url') or '', account_id


def resolve_target(usage):
    from agent.credential_pool import _codex_principal_identity
    import hashlib
    import json

    token, base_url, override = credentials(usage)
    principal = _codex_principal_identity(token)
    if principal is None:
        raise ValueError('Account unavailable')
    headers = usage._codex_headers(token, override)
    account = override or principal[0]
    # Bind the fingerprint to exactly the account sent, and fail closed if a
    # conflicting case-insensitive account header could change HTTP semantics.
    account_headers = [(key, value) for key, value in headers.items() if key.lower() == 'chatgpt-account-id']
    if account_headers != [('ChatGPT-Account-ID', account)]:
        raise ValueError('Account unavailable')
    identity = json.dumps({'account_id': account, 'sub': principal[1]}, sort_keys=True, separators=(',', ':'))
    return {'headers': headers, 'urls': usage._codex_backend_urls(base_url),
            'identity': identity, 'fingerprint': hashlib.sha256(identity.encode('utf-8')).hexdigest()}


def build_snapshot(usage, payload, identity):
    if not isinstance(payload, dict):
        raise ValueError('Usage unavailable')
    rate_limit = payload.get('rate_limit') or {}
    windows = usage._usage_windows(rate_limit, usage._codex_window_labels(rate_limit), 'used_percent', 'reset_at')
    details = []
    count = usage._codex_banked_resets(payload)
    if count > 0:
        details.append(f'You have {count} reset{usage._plural(count)} banked - use /usage reset to activate')
    credits = payload.get('credits') or {}
    balance = credits.get('balance')
    if credits.get('has_credits') and usage._is_num(balance):
        details.append(f'Credits balance: ${float(balance):.2f}')
    elif credits.get('has_credits') and credits.get('unlimited'):
        details.append('Credits balance: unlimited')
    return usage._snapshot('openai-codex', 'usage_api', windows, details,
                           plan=usage._title_case_slug(payload.get('plan_type')), identity=identity, raw=payload)


def fetch_snapshot(usage):
    target = resolve_target(usage)
    with usage.httpx.Client(timeout=15.0) as client:
        response = client.get(target['urls'][0], headers=target['headers'])
        response.raise_for_status()
        payload = response.json()
    return build_snapshot(usage, payload, target['identity'])
