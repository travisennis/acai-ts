import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCodeInterpreterTool, CodeInterpreterTool } from '../../source/tools/code-interpreter.ts';

// Helper to run the tool easily
async function runTool(input: { code: string; timeoutSeconds?: number }): Promise<{ ok: boolean; value: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const { [CodeInterpreterTool.name]: tool } = createCodeInterpreterTool({
    sendData: async (msg) => {
      events.push({ event: msg.event, data: msg.data });
    },
  });

  const output = await tool.execute(input as never, { toolCallId: 't1' } as never);
  if (typeof output === 'string' && output.startsWith('{')) {
    return { ok: true, value: JSON.parse(output) };
  }
  return { ok: false, value: output };
}

describe('code-interpreter tool', () => {
  it('executes simple console.log', async () => {
    const res = await runTool({ code: "console.log('ok');" });
    assert.equal(res.ok, true);
    const v = res.value as { stdout: string; stderr: string; exitCode: number };
    assert.equal(v.exitCode, 0);
    assert.equal(v.stdout.trim(), 'ok');
    // Ignore stderr in this test due to environment-specific Node warnings.
    assert.equal(typeof v.stderr, 'string');
  });

  it('enforces timeout', async () => {
    const res = await runTool({ code: 'for(;;){}', timeoutSeconds: 1 });
    assert.equal(res.ok, false);
    assert.equal(res.value, 'Script timed out');
  });

  it('allows fs within cwd', async () => {
    const code = `
      import { writeFileSync, readFileSync, rmSync } from 'node:fs';
      writeFileSync('tmp_test_file.txt', 'hello', { encoding: 'utf8' });
      const s = readFileSync('tmp_test_file.txt', { encoding: 'utf8' });
      console.log(s);
      rmSync('tmp_test_file.txt', { force: true });
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, true);
    const v = res.value as { stdout: string };
    assert.equal(v.stdout.trim(), 'hello');
  });

  it('denies fs outside cwd', async () => {
    const code = `
      import { writeFileSync } from 'node:fs';
      import { resolve } from 'node:path';
      writeFileSync(resolve('..', 'should_not_write.txt'), 'x', { encoding: 'utf8' });
      console.log('done');
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, false);
    assert.match(String(res.value), /Process exited with code|permission/i);
  });

  it('denies child_process', async () => {
    const code = `
      import { spawnSync } from 'node:child_process';
      const r = spawnSync('node', ['-v']);
      console.log(String(r.stdout || ''));
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, false);
  });

  it('denies network', async () => {
    const code = `
      import https from 'node:https';
      https.get('https://example.com', (res) => { console.log('status', res.statusCode); }).on('error', (e) => { console.error(String(e)); });
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, false);
  });
});
