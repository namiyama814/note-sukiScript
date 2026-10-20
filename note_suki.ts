#!/usr/bin/env node
/** Anonymous-like API research artifact. Read README.md before use. */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const HELP = `Usage: note-suki <article> --count <integer> [options]

Arguments
  article               note.com article URL or article key

Options
  --count <integer>     POST requests (required)
  --interval <seconds>  Delay between requests (default 2)
  --timeout <seconds>   Request timeout (default 15)
  --dry-run             Print request plan without sending
  -h, --help            Show help`;

function noteKey(value: string | undefined): string {
  if (value && /^n[0-9a-f]{12}$/.test(value)) return value;
  try {
    const url = new URL(value ?? '');
    const match = /^\/[^/]+\/n\/(n[0-9a-f]{12})\/?$/.exec(url.pathname);
    if (url.origin === 'https://note.com' && !url.username && !url.password && match) {
      return match[1]!;
    }
  } catch { /* Report invalid article below. */ }
  throw new Error('expected a note.com article URL or article key');
}

function seconds(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number * 1000 > 2_147_483_647) {
    throw new Error('seconds must be finite and between 1 and 2147483.647');
  }
  return number;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let options;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        count: { type: 'string' },
        interval: { type: 'string', default: '2' },
        timeout: { type: 'string', default: '15' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help || argv.length === 0) {
      console.log(HELP);
      return 0;
    }
    if (positionals.length !== 1) throw new Error('exactly one article is required');
    const key = noteKey(positionals[0]);
    const count = Number(values.count);
    if (!values.count || !/^\d+$/.test(values.count) || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('count must be a positive safe integer');
    }
    options = {
      url: `https://note.com/api/v3/notes/${key}/anonymous_likes`,
      count,
      interval: seconds(values.interval!),
      timeout: seconds(values.timeout!),
      dryRun: values['dry-run'],
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Run note-suki --help for usage.');
    return 2;
  }

  const { url, count, interval, timeout, dryRun } = options;
  if (dryRun) {
    console.log(JSON.stringify({ method: 'POST', url, count, interval, cookies: false }));
    return 0;
  }
  const interrupt = new AbortController();
  const onInterrupt = () => interrupt.abort();
  process.on('SIGINT', onInterrupt);
  let accepted = 0;
  try {
    for (let index = 0; index < count; index++) {
      if (index) await sleep(interval * 1000, undefined, { signal: interrupt.signal });
      const response = await fetch(url, {
        method: 'POST',
        body: '',
        credentials: 'omit',
        redirect: 'manual',
        signal: AbortSignal.any([interrupt.signal, AbortSignal.timeout(Math.ceil(timeout * 1000))]),
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Origin: 'https://note.com',
          Referer: 'https://note.com/',
          Accept: 'application/json',
        },
      });
      if (response.status === 201) accepted++;
      await response.arrayBuffer();
      console.log(JSON.stringify({ request: index + 1, status: response.status }));
      if (response.status !== 201) {
        console.error('Unexpected status; stopped without retrying.');
        return 1;
      }
    }
    return 0;
  } catch (error) {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}. No automatic retry; the last request may have reached the server.`);
    return interrupt.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    console.log(JSON.stringify({ accepted, requested: count }));
  }
}

if (import.meta.main) process.exitCode = await main();
