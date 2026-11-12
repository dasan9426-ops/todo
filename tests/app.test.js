/*
 * 画面の操作テスト。index.html を iframe で開き、実際に入力・クリックして確かめる。
 * iframe の中を操作するには同じオリジンである必要があるため、file:// ではスキップする。
 * テスト中は localStorage を使うが、終了後に元のデータへ戻す。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'todo-app.todos.v1';

  const uiTest =
    location.protocol === 'file:'
      ? (name) => skip(name, 'file:// では実行できません。python -m http.server で配信して開いてください。')
      : test;

  let originalData = null;
  let storageTouched = false;
  let loadCount = 0;

  function writeStorage(value) {
    if (!storageTouched) {
      originalData = localStorage.getItem(STORAGE_KEY);
      storageTouched = true;
    }
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  }

  afterAll(() => {
    if (!storageTouched) return;
    if (originalData === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, originalData);
  });

  /** 保存データを用意してアプリを開く。文字列を渡すとそのまま保存する */
  function openApp(todos = null) {
    writeStorage(todos);
    return reloadApp();
  }

  function reloadApp() {
    const frame = document.getElementById('app-frame');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('アプリの読み込みがタイムアウトしました')), 5000);
      frame.onload = () => {
        clearTimeout(timer);
        resolve(createDriver(frame.contentWindow));
      };
      loadCount += 1;
      frame.src = `../index.html?load=${loadCount}`;
    });
  }

  function createDriver(win) {
    const doc = win.document;
    const $ = (selector) => doc.querySelector(selector);
    const $$ = (selector) => Array.from(doc.querySelectorAll(selector));
    const item = (title) =>
      $$('.todo-item').find((li) => li.querySelector('.todo-title')?.textContent === title);

    return {
      win,
      $,
      $$,
      item,
      titles: () => $$('.todo-title').map((el) => el.textContent),
      stored: () => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'),
      add(title, due = '') {
        $('#new-title').value = title;
        $('#new-due').value = due;
        $('#add-form').requestSubmit();
      },
      startEdit(title) {
        item(title).querySelector('.todo-title').dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
        return $('.edit-form');
      },
      nextHashChange() {
        return new Promise((resolve) => win.addEventListener('hashchange', resolve, { once: true }));
      },
      async setHash(hash) {
        const changed = this.nextHashChange();
        win.location.hash = hash;
        await changed;
      },
    };
  }

  const todo = (id, title, completed = false, due = null) => ({ id, title, completed, due });

  uiTest('UI: 最初はタスクがないことを表示する', async () => {
    const app = await openApp();
    assert.equal(app.$('#empty-message').hidden, false);
    assert.ok(app.$('#empty-message').textContent.includes('タスクはまだありません'));
    assert.equal(app.$('#toolbar').hidden, true);
    assert.equal(app.$('#footer').hidden, true);
  });

  uiTest('UI: タスクを追加すると一覧に表示され、保存される', async () => {
    const app = await openApp();
    app.add('  牛乳を買う ', '2030-01-02');
    assert.deepEqual(app.titles(), ['牛乳を買う']);
    assert.equal(app.$('#new-title').value, '', '入力欄が空に戻る');
    assert.equal(app.$('#new-due').value, '', '期限の入力欄も空に戻る');
    assert.equal(app.$('#count').textContent, '残り 1 件');
    assert.equal(app.$('#empty-message').hidden, true);
    const [saved] = app.stored();
    assert.equal(saved.title, '牛乳を買う');
    assert.equal(saved.due, '2030-01-02');
  });

  uiTest('UI: 空白だけのタスクは追加しない', async () => {
    const app = await openApp();
    app.add('   ');
    assert.deepEqual(app.titles(), []);
    assert.equal(app.stored(), null, '保存もしない');
  });

  uiTest('UI: チェックで完了になり、残り件数が変わる', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B')]);
    app.item('A').querySelector('.toggle').click();
    assert.ok(app.item('A').classList.contains('is-completed'));
    assert.equal(app.$('#count').textContent, '残り 1 件');
    assert.equal(app.stored()[0].completed, true);
    assert.equal(app.$('#clear-completed').hidden, false);
  });

  uiTest('UI: ダブルクリックで編集し、Enter（送信）で保存する', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B')]);
    const form = app.startEdit('A');
    assert.ok(form, '編集フォームが表示される');
    assert.equal(form.elements.title.value, 'A');
    form.elements.title.value = '  A を直した ';
    form.elements.due.value = '2030-05-06';
    form.requestSubmit();
    assert.equal(app.$('.edit-form'), null, '編集フォームが閉じる');
    assert.deepEqual(app.titles(), ['A を直した', 'B']);
    assert.ok(app.item('A を直した').querySelector('time[datetime="2030-05-06"]'), '期限が表示される');
    assert.deepEqual(app.stored()[0], todo('a', 'A を直した', false, '2030-05-06'));
  });

  uiTest('UI: 編集ボタンから編集し、キャンセルできる', async () => {
    const app = await openApp([todo('a', 'A')]);
    app.item('A').querySelector('[data-action="edit"]').click();
    const form = app.$('.edit-form');
    form.elements.title.value = '変更';
    form.querySelector('[data-action="cancel"]').click();
    assert.deepEqual(app.titles(), ['A']);
    assert.equal(app.stored()[0].title, 'A');
  });

  uiTest('UI: Esc で編集をキャンセルする', async () => {
    const app = await openApp([todo('a', 'A')]);
    const form = app.startEdit('A');
    form.elements.title.value = '変更';
    form.elements.title.dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepEqual(app.titles(), ['A']);
  });

  uiTest('UI: タイトルを空にして保存すると元のタイトルに戻る', async () => {
    const app = await openApp([todo('a', 'A')]);
    const form = app.startEdit('A');
    form.elements.title.value = '   ';
    form.requestSubmit();
    assert.deepEqual(app.titles(), ['A']);
  });

  uiTest('UI: 編集中にフォームの外へフォーカスが移ると保存する', async () => {
    const app = await openApp([todo('a', 'A')]);
    const form = app.startEdit('A');
    form.elements.title.value = 'A2';
    form.elements.title.dispatchEvent(
      new app.win.FocusEvent('focusout', { bubbles: true, relatedTarget: app.$('#new-title') }),
    );
    assert.deepEqual(app.titles(), ['A2']);
    assert.equal(app.stored()[0].title, 'A2');
  });

  uiTest('UI: 編集を確定しても他のタスクの要素は作り直さない', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B')]);
    const nodeB = app.item('B');
    const form = app.startEdit('A');
    form.elements.title.value = 'A2';
    form.requestSubmit();
    assert.ok(app.item('B') === nodeB, 'B の <li> が作り直されている');
  });

  uiTest('UI: 削除ボタンで削除する', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B')]);
    app.item('A').querySelector('[data-action="delete"]').click();
    assert.deepEqual(app.titles(), ['B']);
    assert.deepEqual(app.stored().map((t) => t.id), ['b']);
  });

  uiTest('UI: すべて / 未完了 / 完了済み で表示を切り替える', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B', true)]);
    await app.setHash('#/active');
    assert.deepEqual(app.titles(), ['A']);
    assert.equal(app.$('[aria-current="page"]').dataset.filter, 'active');
    await app.setHash('#/completed');
    assert.deepEqual(app.titles(), ['B']);
    await app.setHash('#/');
    assert.deepEqual(app.titles(), ['A', 'B']);
    assert.equal(app.$('[aria-current="page"]').dataset.filter, 'all');
  });

  uiTest('UI: 表示中のタスクがないときは理由を表示する', async () => {
    const app = await openApp([todo('a', 'A', true)]);
    await app.setHash('#/active');
    assert.equal(app.$('#empty-message').hidden, false);
    assert.equal(app.$('#empty-message').textContent, '未完了のタスクはありません。');
  });

  uiTest('UI: 完了済み表示で追加すると「すべて」表示に切り替わる', async () => {
    const app = await openApp([todo('b', 'B', true)]);
    await app.setHash('#/completed');
    const changed = app.nextHashChange();
    app.add('C');
    await changed;
    assert.deepEqual(app.titles(), ['B', 'C']);
  });

  uiTest('UI: 「すべて完了にする」で全件を切り替える', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B', true)]);
    const button = app.$('#toggle-all');
    button.click();
    assert.ok(app.stored().every((t) => t.completed));
    assert.equal(app.$('#count').textContent, 'すべて完了しました');
    assert.equal(button.textContent, 'すべて未完了に戻す');
    button.click();
    assert.ok(app.stored().every((t) => !t.completed));
    assert.equal(app.$('#count').textContent, '残り 2 件');
  });

  uiTest('UI: 完了済みをまとめて削除する', async () => {
    const app = await openApp([todo('a', 'A'), todo('b', 'B', true), todo('c', 'C', true)]);
    const button = app.$('#clear-completed');
    assert.equal(button.textContent, '完了済みを削除（2）');
    button.click();
    assert.deepEqual(app.titles(), ['A']);
    assert.equal(button.hidden, true);
  });

  uiTest('UI: 再読み込みしても内容が残る', async () => {
    let app = await openApp();
    app.add('A');
    app.add('B');
    app.item('A').querySelector('.toggle').click();
    app = await reloadApp();
    assert.deepEqual(app.titles(), ['A', 'B']);
    assert.ok(app.item('A').classList.contains('is-completed'));
  });

  uiTest('UI: 期限切れと今日が期限のタスクを強調する', async () => {
    const day = new Date();
    const today = TodoModel.toDateString(day);
    day.setDate(day.getDate() - 1);
    const yesterday = TodoModel.toDateString(day);
    day.setDate(day.getDate() + 5);
    const later = TodoModel.toDateString(day);

    const app = await openApp([
      todo('a', '期限切れ', false, yesterday),
      todo('b', '今日', false, today),
      todo('c', 'これから', false, later),
      todo('d', '完了済み', true, yesterday),
    ]);
    const badge = (title) => app.item(title).querySelector('.due');
    assert.ok(badge('期限切れ').classList.contains('due--overdue'));
    assert.ok(badge('期限切れ').textContent.startsWith('期限切れ'));
    assert.ok(badge('今日').classList.contains('due--today'));
    assert.equal(badge('今日').textContent, '今日まで');
    assert.ok(badge('これから').classList.contains('due--upcoming'));
    assert.ok(badge('完了済み').classList.contains('due--upcoming'), '完了済みは強調しない');
  });

  uiTest('UI: HTML を含むタイトルも文字列として表示する', async () => {
    const app = await openApp();
    const title = '<img src=x onerror="window.__xss = true">';
    app.add(title);
    assert.deepEqual(app.titles(), [title]);
    assert.equal(app.$$('.todo-list img').length, 0, 'img 要素が作られている');
    assert.equal(app.win.__xss, undefined);
  });

  uiTest('UI: 保存データが壊れていても起動できる', async () => {
    const app = await openApp('{壊れたデータ');
    assert.deepEqual(app.titles(), []);
    assert.equal(app.$('#empty-message').hidden, false);
  });
})();
