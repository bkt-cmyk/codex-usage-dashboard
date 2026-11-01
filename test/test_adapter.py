import importlib.util
import pathlib
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import contextlib
import io
import json
import logging
import base64


def fake_token(account='workspace', subject='member'):
    claims = {'https://api.openai.com/auth': {'chatgpt_account_id': account}, 'sub': subject}
    body = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    return 'test.' + body + '.test'


def load_adapter(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'src' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

ROOT = pathlib.Path(__file__).resolve().parents[1]

class AdapterTests(unittest.TestCase):
    def test_display_resolves_safely_once_without_upstream_refresh_path(self):
        import agent.account_usage as usage
        adapter = load_adapter('usage_adapter')
        token = fake_token()
        client = MagicMock()
        client.get.return_value.json.return_value = {
            'rate_limit': {'primary_window': {'used_percent': 100}},
            'rate_limit_reset_credits': {'available_count': 2}, 'secret': 'omit-me',
        }
        stdout, stderr = io.StringIO(), io.StringIO()
        disabled = logging.root.manager.disable
        try:
            with patch.object(usage, 'resolve_codex_runtime_credentials', return_value={'api_key': token}) as resolver, patch.object(usage, '_read_codex_tokens', return_value={'tokens': {'access_token': token, 'account_id': 'target'}}) as read, patch.object(usage, 'fetch_account_usage', side_effect=AssertionError('Unsafe upstream resolver')), patch.object(usage.httpx, 'Client') as factory, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                factory.return_value.__enter__.return_value = client
                self.assertEqual(adapter.main(), 0)
            document = json.loads(stdout.getvalue())
            self.assertEqual(document['windows'][0]['used_percent'], 100)
            self.assertEqual(document['reset_credits']['available_count'], 2)
            self.assertNotIn('omit-me', stdout.getvalue())
            self.assertNotIn(token, stdout.getvalue())
            resolver.assert_called_once_with(refresh_if_expiring=False, read_only=True)
            read.assert_called_once_with(_lock=False)
            client.get.assert_called_once()
            client.post.assert_not_called()
            self.assertEqual(client.get.call_args.kwargs['headers']['ChatGPT-Account-ID'], 'target')
        finally:
            logging.disable(disabled)

    def resolved_documents(self, token, singleton, *, headers=None, get_error=None):
        import agent.account_usage as usage
        client = MagicMock()
        client.get.return_value.json.return_value = {
            'rate_limit': {'primary_window': {'used_percent': 100}},
            'rate_limit_reset_credits': {'available_count': 2},
        }
        client.get.side_effect = get_error
        documents, sent_headers = [], []
        disabled = logging.root.manager.disable
        try:
            name = 'usage_adapter'
            with patch.object(usage, 'resolve_codex_runtime_credentials', return_value={'api_key': token}) as resolver, patch.object(usage, '_read_codex_tokens', return_value={'tokens': singleton}), patch.object(usage.httpx, 'Client') as factory, contextlib.ExitStack() as stack:
                if headers is not None:
                    stack.enter_context(patch.object(usage, '_codex_headers', return_value=headers))
                factory.return_value.__enter__.return_value = client
                adapter = load_adapter(name)
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
                    code = adapter.main()
                documents.append(json.loads(stdout.getvalue()) if code == 0 else {'ok': False, 'status': 'unavailable'})
                resolver.assert_called_once_with(refresh_if_expiring=False, read_only=True)
                sent_headers.append(client.get.call_args.kwargs['headers'] if client.get.called else None)
                self.assertLessEqual(client.get.call_count, 1)
                client.post.assert_not_called()
        finally:
            logging.disable(disabled)
        return documents, sent_headers

    def test_effective_header_override_changes_fingerprint_for_unchanged_jwt(self):
        import hashlib
        token = fake_token()
        fingerprints = []
        for target in ('target-a', 'target-b'):
            docs, headers = self.resolved_documents(token, {'access_token': token, 'account_id': target})
            expected = hashlib.sha256(json.dumps({'account_id': target, 'sub': 'member'}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            self.assertEqual([doc['account_fingerprint'] for doc in docs], [expected])
            self.assertEqual([h['ChatGPT-Account-ID'] for h in headers], [target])
            fingerprints.append(expected)
        self.assertNotEqual(*fingerprints)

    def test_display_and_inspect_401_never_retry_or_refresh(self):
        import httpx
        token = fake_token()
        error = httpx.HTTPStatusError('suppressed', request=httpx.Request('GET', 'https://example.test'), response=httpx.Response(401))
        docs, sent = self.resolved_documents(token, {}, get_error=error)
        self.assertEqual(docs, [{'ok': False, 'status': 'unavailable'}])
        self.assertTrue(all(header is not None for header in sent))

    def test_invalid_singleton_account_override_rejects_without_network(self):
        token = fake_token()
        for account in (True, 17, [], {}):
            docs, sent = self.resolved_documents(token, {'access_token': token, 'account_id': account})
            self.assertEqual(docs, [{'ok': False, 'status': 'unavailable'}])
            self.assertEqual(sent, [None])

    def test_conflicting_or_missing_effective_account_rejects_without_network(self):
        token = fake_token()
        for headers in ({'ChatGPT-Account-ID': 'unrelated'}, {}, {'ChatGPT-Account-ID': 'workspace', 'chatgpt-account-id': 'unrelated'}):
            docs, sent = self.resolved_documents(token, {}, headers=headers)
            self.assertEqual(docs, [{'ok': False, 'status': 'unavailable'}])
            self.assertEqual(sent, [None])

    def test_pool_token_omits_unrelated_singleton_override_consistently(self):
        import hashlib
        token = fake_token()
        docs, headers = self.resolved_documents(token, {'access_token': fake_token('other'), 'account_id': 'unrelated'})
        expected = hashlib.sha256(json.dumps({'account_id': 'workspace', 'sub': 'member'}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual([doc['account_fingerprint'] for doc in docs], [expected])
        self.assertEqual([h['ChatGPT-Account-ID'] for h in headers], ['workspace'])

    def test_unresolvable_pool_principal_rejects_unrelated_override(self):
        docs, sent = self.resolved_documents('unresolvable-test-token', {'access_token': fake_token('other'), 'account_id': 'unrelated'})
        self.assertEqual(docs, [{'ok': False, 'status': 'unavailable'}])
        self.assertEqual(sent, [None])

    def test_preserves_confirmed_zero_positive_and_unknown_without_secrets(self):
        spec = importlib.util.spec_from_file_location('usage_adapter', ROOT / 'src' / 'usage_adapter.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        snap = SimpleNamespace(provider='openai-codex', source='usage_api', title='Account limits', plan='Plus', fetched_at=datetime.now(timezone.utc), windows=(), details=(), unavailable_reason=None, identity='DO-NOT-PUBLISH', raw={})
        for raw, expected in [({},None),({'rate_limit_reset_credits':{}},None),({'rate_limit_reset_credits':{'available_count':0}},0),({'rate_limit_reset_credits':{'available_count':2}},2),({'rate_limit_reset_credits':{'available_count':True}},None),({'rate_limit_reset_credits':{'available_count':-1}},None),({'rate_limit_reset_credits':{'available_count':1.5}},None),({'rate_limit_reset_credits':{'available_count':'2'}},None)]:
            snap.raw = raw
            doc = module.snapshot_document(snap)
            self.assertEqual(doc['reset_credits']['available_count'], expected)
            self.assertEqual(doc['reset_credits']['same_usage_response'], True)
            self.assertNotIn('DO-NOT-PUBLISH', str(doc))
            self.assertNotIn('raw', doc)
            self.assertNotIn('identity', doc)
            import hashlib
            self.assertEqual(doc['account_fingerprint'], hashlib.sha256(b'DO-NOT-PUBLISH').hexdigest())
        snap.raw = None
        self.assertIsNone(module.snapshot_document(snap)['reset_credits']['available_count'])
        snap.identity = None
        self.assertIsNone(module.snapshot_document(snap)['account_fingerprint'])

if __name__ == '__main__':
    unittest.main()
