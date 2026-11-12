/* js/todo-model.js の単体テスト */
(function () {
  'use strict';

  const M = TodoModel;

  const sample = () => [
    { id: 'a', title: '牛乳を買う', completed: false, due: null },
    { id: 'b', title: 'レポートを提出', completed: true, due: '2026-11-10' },
    { id: 'c', title: '歯医者を予約', completed: false, due: '2026-11-20' },
  ];

  test('addTodo: 前後の空白を除いて末尾に追加する', () => {
    const todos = sample();
    const next = M.addTodo(todos, { title: '  傘を返す  ' }, 'x');
    assert.equal(next.length, 4);
    assert.deepEqual(next[3], { id: 'x', title: '傘を返す', completed: false, due: null });
    assert.equal(todos.length, 3, '元の配列は変更しない');
  });

  test('addTodo: 空白だけのタイトルは追加しない', () => {
    const todos = sample();
    assert.equal(M.addTodo(todos, { title: '   ' }), todos);
    assert.equal(M.addTodo(todos, {}), todos);
  });

  test('addTodo: 正しい日付の期限だけを保存する', () => {
    assert.equal(M.addTodo([], { title: 'A', due: '2026-12-01' }, 'x')[0].due, '2026-12-01');
    assert.equal(M.addTodo([], { title: 'A', due: '' }, 'x')[0].due, null);
    assert.equal(M.addTodo([], { title: 'A', due: '2026-02-30' }, 'x')[0].due, null);
  });

  test('addTodo: id を省略すると重複しない id を振る', () => {
    const next = M.addTodo(M.addTodo([], { title: 'A' }), { title: 'B' });
    assert.equal(typeof next[0].id, 'string');
    assert.ok(next[0].id !== next[1].id, 'id が重複している');
  });

  test('toggleTodo: 指定したタスクだけ完了状態を反転する', () => {
    const todos = sample();
    const next = M.toggleTodo(todos, 'a');
    assert.equal(next[0].completed, true);
    assert.equal(next[1], todos[1], '他のタスクは同じオブジェクトのまま');
    assert.equal(todos[0].completed, false, '元のタスクは変更しない');
    assert.equal(M.toggleTodo(next, 'a')[0].completed, false);
  });

  test('存在しない id を指定すると同じ配列を返す', () => {
    const todos = sample();
    assert.equal(M.toggleTodo(todos, 'zzz'), todos);
    assert.equal(M.removeTodo(todos, 'zzz'), todos);
    assert.equal(M.updateTodo(todos, 'zzz', { title: 'X' }), todos);
  });

  test('updateTodo: タイトルと期限を更新する', () => {
    const next = M.updateTodo(sample(), 'a', { title: ' 豆乳を買う ', due: '2026-11-15' });
    assert.deepEqual(next[0], { id: 'a', title: '豆乳を買う', completed: false, due: '2026-11-15' });
  });

  test('updateTodo: 期限を空にすると期限なしになる', () => {
    assert.equal(M.updateTodo(sample(), 'b', { due: '' })[1].due, null);
  });

  test('updateTodo: タイトルが空なら何も変更しない', () => {
    const todos = sample();
    assert.equal(M.updateTodo(todos, 'a', { title: '  ', due: '2026-11-15' }), todos);
  });

  test('updateTodo: 内容が変わらなければ同じ配列を返す', () => {
    const todos = sample();
    assert.equal(M.updateTodo(todos, 'b', { title: 'レポートを提出', due: '2026-11-10' }), todos);
  });

  test('removeTodo: 指定したタスクを削除する', () => {
    assert.deepEqual(M.removeTodo(sample(), 'b').map((t) => t.id), ['a', 'c']);
  });

  test('setAllCompleted: すべて完了 / すべて未完了にする', () => {
    const done = M.setAllCompleted(sample(), true);
    assert.ok(done.every((t) => t.completed));
    assert.ok(M.setAllCompleted(done, false).every((t) => !t.completed));
    assert.equal(M.setAllCompleted(done, true), done, '変化がなければ同じ配列');
  });

  test('clearCompleted: 完了済みだけを削除する', () => {
    const active = M.clearCompleted(sample());
    assert.deepEqual(active.map((t) => t.id), ['a', 'c']);
    assert.equal(M.clearCompleted(active), active, '完了済みがなければ同じ配列');
  });

  test('filterTodos と countActive', () => {
    const todos = sample();
    assert.deepEqual(M.filterTodos(todos, 'all').map((t) => t.id), ['a', 'b', 'c']);
    assert.deepEqual(M.filterTodos(todos, 'active').map((t) => t.id), ['a', 'c']);
    assert.deepEqual(M.filterTodos(todos, 'completed').map((t) => t.id), ['b']);
    assert.equal(M.countActive(todos), 2);
  });

  test('filterFromHash: URL のハッシュから表示条件を決める', () => {
    assert.equal(M.filterFromHash(''), 'all');
    assert.equal(M.filterFromHash('#/'), 'all');
    assert.equal(M.filterFromHash('#/active'), 'active');
    assert.equal(M.filterFromHash('#/completed'), 'completed');
    assert.equal(M.filterFromHash('#/unknown'), 'all');
  });

  test('dueStatus: 期限切れ・今日・これからを判定する', () => {
    assert.equal(M.dueStatus(null, '2026-11-12'), null);
    assert.equal(M.dueStatus('2026-11-11', '2026-11-12'), 'overdue');
    assert.equal(M.dueStatus('2026-11-12', '2026-11-12'), 'today');
    assert.equal(M.dueStatus('2026-11-13', '2026-11-12'), 'upcoming');
    assert.equal(M.dueStatus('2025-12-31', '2026-01-01'), 'overdue');
  });

  test('toDateString: ローカル時刻の日付を返す（UTC にずらさない）', () => {
    assert.equal(M.toDateString(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
    assert.equal(M.toDateString(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  });

  test('parseDate: 実在しない日付や形式違いは null', () => {
    assert.ok(M.parseDate('2028-02-29') instanceof Date, 'うるう日は有効');
    assert.equal(M.parseDate('2026-02-29'), null);
    assert.equal(M.parseDate('2026-13-01'), null);
    assert.equal(M.parseDate('2026/11/12'), null);
    assert.equal(M.parseDate(20261112), null);
  });

  test('sanitizeTodos: 壊れたデータを取り除いて読み込む', () => {
    const result = M.sanitizeTodos([
      { id: 'a', title: ' A ', completed: true, due: '2026-11-12' },
      { id: 'a', title: '重複した id', completed: false },
      { id: 'b', title: '', completed: false },
      { title: 'id なし' },
      { id: 'c', title: 'C', completed: 'yes', due: 'あした' },
      null,
      'text',
    ]);
    assert.deepEqual(result, [
      { id: 'a', title: 'A', completed: true, due: '2026-11-12' },
      { id: 'c', title: 'C', completed: false, due: null },
    ]);
    assert.deepEqual(M.sanitizeTodos({ not: 'array' }), []);
  });
})();
