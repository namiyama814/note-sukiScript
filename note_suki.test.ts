import assert from 'node:assert/strict';
import { test } from 'node:test';
import { main } from './note_suki.ts';

test('CLI behavior with mocked network only', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const requests: RequestInit[] = [];
  const network = t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push(init!);
    return new Response('{}', { status: 201, headers: { 'Set-Cookie': 'test=value' } });
  });
  const article = 'n851fc060c31a';
  assert.equal(await main([article, '--count', '3', '--dry-run']), 0);
  assert.equal(network.mock.callCount(), 0);
  assert.equal(await main(['https://note.com/trail_story/n/' + article, '--count', '2', '--interval', '1']), 0);
  assert.equal(requests.length, 2);
  for (const init of requests) {
    assert.equal(init.method, 'POST');
    assert.equal(init.body, '');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).has('cookie'), false);
  }
  for (const args of [
    [article, '--count', '0'],
    [article, '--count', '1.5'],
    [article, '--count', '1', '--interval', 'NaN'],
    [article, '--count', '1', '--timeout', '2147484'],
    ['https://example.com/n/' + article, '--count', '1'],
  ]) assert.equal(await main(args), 2);
  assert.equal(network.mock.callCount(), 2);
  network.mock.mockImplementation(async () => new Response('', { status: 429 }));
  assert.equal(await main([article, '--count', '3']), 1);
  assert.equal(network.mock.callCount(), 3);
  network.mock.mockImplementation(async () => { throw new Error('mock failure'); });
  assert.equal(await main([article, '--count', '3']), 1);
  assert.equal(network.mock.callCount(), 4);
});
