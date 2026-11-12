/* 依存ライブラリなしの小さなテストランナー。結果は #summary と #results に表示する。 */
(function (global) {
  'use strict';

  const tests = [];
  const afterAllHooks = [];
  const MARKS = { pass: '✔', fail: '✘', skip: '－' };

  function test(name, fn) {
    tests.push({ name, fn });
  }

  function skip(name, reason) {
    tests.push({ name, skipReason: reason });
  }

  function afterAll(fn) {
    afterAllHooks.push(fn);
  }

  function show(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function isDeepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && isDeepEqual(a[key], b[key]));
  }

  function fail(message, detail) {
    throw new Error(message ? `${message}\n${detail}` : detail);
  }

  const assert = {
    ok(value, message) {
      if (!value) fail(message, `真の値を期待しましたが ${show(value)} でした`);
    },
    equal(actual, expected, message) {
      if (!Object.is(actual, expected)) fail(message, `期待: ${show(expected)}\n実際: ${show(actual)}`);
    },
    deepEqual(actual, expected, message) {
      if (!isDeepEqual(actual, expected)) fail(message, `期待: ${show(expected)}\n実際: ${show(actual)}`);
    },
  };

  async function runTests() {
    const summary = document.getElementById('summary');
    const list = document.getElementById('results');
    const counts = { pass: 0, fail: 0, skip: 0 };

    for (const { name, fn, skipReason } of tests) {
      let status = 'pass';
      let detail = '';
      if (skipReason) {
        status = 'skip';
        detail = skipReason;
      } else {
        try {
          await fn();
        } catch (error) {
          status = 'fail';
          detail = error instanceof Error ? error.message : String(error);
        }
      }
      counts[status] += 1;

      const item = document.createElement('li');
      item.className = status;
      item.textContent = `${MARKS[status]} ${name}`;
      if (detail) {
        const note = document.createElement('div');
        note.className = 'detail';
        note.textContent = detail;
        item.append(note);
      }
      list.append(item);
    }

    for (const hook of afterAllHooks) {
      try {
        await hook();
      } catch (error) {
        console.error(error);
      }
    }

    const result = counts.fail ? 'FAIL' : 'PASS';
    summary.textContent = `${result}: 成功 ${counts.pass} / 失敗 ${counts.fail} / スキップ ${counts.skip}`;
    summary.className = counts.fail ? 'fail' : 'pass';
    document.title = `${result} - TODO アプリのテスト`;
  }

  Object.assign(global, { test, skip, afterAll, assert, runTests });
})(globalThis);
