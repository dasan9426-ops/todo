/*
 * タスク操作のロジック（DOM に依存しない純粋関数）。
 *
 * タスクは { id, title, completed, due } の形で、due は 'YYYY-MM-DD' または null。
 * 変更系の関数は元の配列を書き換えず新しい配列を返し、
 * 変更がなかった場合は受け取った配列をそのまま返す（呼び出し側が === で判定できる）。
 */
(function (global) {
  'use strict';

  const FILTERS = Object.freeze(['all', 'active', 'completed']);
  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

  function createId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** 'YYYY-MM-DD' をローカル時刻の Date に変換する。実在しない日付なら null */
  function parseDate(value) {
    const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    const exists =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return exists ? date : null;
  }

  /**
   * Date をローカル時刻の 'YYYY-MM-DD' にする。
   * toISOString() は UTC になるため、日本時間の午前 9 時前に前日の日付になってしまう。
   */
  function toDateString(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeDue(value) {
    return parseDate(value) ? value : null;
  }

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function addTodo(todos, { title, due } = {}, id = createId()) {
    const text = normalizeTitle(title);
    if (!text) return todos;
    return [...todos, { id, title: text, completed: false, due: normalizeDue(due) }];
  }

  function updateById(todos, id, update) {
    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) return todos;
    const updated = update(todos[index]);
    if (updated === todos[index]) return todos;
    const next = todos.slice();
    next[index] = updated;
    return next;
  }

  function toggleTodo(todos, id) {
    return updateById(todos, id, (todo) => ({ ...todo, completed: !todo.completed }));
  }

  /** タイトルや期限を変更する。タイトルが空になる変更は無視する（元のまま） */
  function updateTodo(todos, id, changes = {}) {
    return updateById(todos, id, (todo) => {
      const title = changes.title !== undefined ? normalizeTitle(changes.title) : todo.title;
      if (!title) return todo;
      const due = changes.due !== undefined ? normalizeDue(changes.due) : todo.due;
      if (title === todo.title && due === todo.due) return todo;
      return { ...todo, title, due };
    });
  }

  function removeTodo(todos, id) {
    const next = todos.filter((todo) => todo.id !== id);
    return next.length === todos.length ? todos : next;
  }

  function setAllCompleted(todos, completed) {
    if (todos.every((todo) => todo.completed === completed)) return todos;
    return todos.map((todo) => (todo.completed === completed ? todo : { ...todo, completed }));
  }

  function clearCompleted(todos) {
    const next = todos.filter((todo) => !todo.completed);
    return next.length === todos.length ? todos : next;
  }

  function filterTodos(todos, filter) {
    if (filter === 'active') return todos.filter((todo) => !todo.completed);
    if (filter === 'completed') return todos.filter((todo) => todo.completed);
    return todos;
  }

  function countActive(todos) {
    return todos.reduce((count, todo) => (todo.completed ? count : count + 1), 0);
  }

  /** 期限の状態: 'overdue'（期限切れ） / 'today'（今日まで） / 'upcoming'（これから） / null（期限なし） */
  function dueStatus(due, today) {
    if (!due) return null;
    if (due < today) return 'overdue';
    if (due === today) return 'today';
    return 'upcoming';
  }

  /** '#/active' などの URL ハッシュを表示条件に変換する */
  function filterFromHash(hash) {
    const name = String(hash || '').replace(/^#\/?/, '');
    return FILTERS.includes(name) ? name : 'all';
  }

  /** localStorage から読み込んだデータを検証し、正しいタスクだけを返す */
  function sanitizeTodos(data) {
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const result = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof item.id === 'string' ? item.id : '';
      const title = normalizeTitle(item.title);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, title, completed: item.completed === true, due: normalizeDue(item.due) });
    }
    return result;
  }

  global.TodoModel = Object.freeze({
    FILTERS,
    createId,
    parseDate,
    toDateString,
    normalizeDue,
    addTodo,
    toggleTodo,
    updateTodo,
    removeTodo,
    setAllCompleted,
    clearCompleted,
    filterTodos,
    countActive,
    dueStatus,
    filterFromHash,
    sanitizeTodos,
  });
})(globalThis);
