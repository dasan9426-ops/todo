/*
 * 画面の描画とイベント処理。
 * タスク操作のロジックは todo-model.js（TodoModel）にあり、ここでは状態を持ち、
 * 変更のたびに localStorage へ保存して再描画する。
 */
(function () {
  'use strict';

  const M = window.TodoModel;
  const STORAGE_KEY = 'todo-app.todos.v1';

  const EMPTY_MESSAGES = {
    none: 'タスクはまだありません。上の入力欄から追加しましょう。',
    active: '未完了のタスクはありません。',
    completed: '完了済みのタスクはありません。',
  };

  const DUE_LABELS = { overdue: '期限切れ', today: '今日まで', upcoming: '期限' };

  // 固定の SVG パス（ユーザー入力は含まない）
  const ICONS = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    delete:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  };

  const headerDateFormat = new Intl.DateTimeFormat('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const dueFormat = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const dueFormatWithYear = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });

  const byId = (id) => document.getElementById(id);
  const els = {
    today: byId('today'),
    addForm: byId('add-form'),
    newTitle: byId('new-title'),
    newDue: byId('new-due'),
    notice: byId('notice'),
    toolbar: byId('toolbar'),
    filterLinks: document.querySelectorAll('.filters a'),
    toggleAll: byId('toggle-all'),
    list: byId('todo-list'),
    empty: byId('empty-message'),
    footer: byId('footer'),
    count: byId('count'),
    clearCompleted: byId('clear-completed'),
  };

  const state = {
    todos: [],
    filter: M.filterFromHash(location.hash),
    editingId: null,
    draft: null, // 編集中の入力内容 { title, due }
    justAddedId: null,
  };

  // 描画済みの <li> を id ごとに覚えておき、内容が変わっていなければ使い回す。
  // すべて作り直すと、編集中に別のタスクのチェックや削除を押したときにクリックが失われる。
  let renderedItems = new Map(); // id -> { node, key }

  // 再描画で要素を差し替えている間に起きる focusout を無視するためのフラグ
  let rendering = false;

  const storage = openStorage();

  /* ---------- 保存 ---------- */

  function openStorage() {
    try {
      const probe = `${STORAGE_KEY}.probe`;
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function loadTodos() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? M.sanitizeTodos(JSON.parse(raw)) : [];
    } catch (error) {
      console.warn('保存データを読み込めませんでした', error);
      return [];
    }
  }

  function saveTodos(todos) {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (error) {
      console.warn('保存に失敗しました', error);
      showNotice('タスクを保存できませんでした。ブラウザの保存容量を確認してください。');
    }
  }

  function showNotice(message) {
    els.notice.textContent = message;
    els.notice.hidden = false;
  }

  /* ---------- 状態の更新 ---------- */

  /** タスク一覧を更新して保存・再描画する。変更がなければ false */
  function commit(next) {
    if (next === state.todos) return false;
    state.todos = next;
    saveTodos(next);
    render();
    return true;
  }

  function addTodo() {
    const next = M.addTodo(state.todos, { title: els.newTitle.value, due: els.newDue.value });
    if (next === state.todos) {
      els.newTitle.focus();
      return;
    }
    state.justAddedId = next[next.length - 1].id;
    els.addForm.reset();
    // 「完了済み」表示のままだと追加したタスクが見えないので「すべて」に切り替える
    if (state.filter === 'completed') location.hash = '#/';
    commit(next);
    els.newTitle.focus();
  }

  function removeTodo(id) {
    const before = M.filterTodos(state.todos, state.filter);
    const index = before.findIndex((todo) => todo.id === id);
    if (!commit(M.removeTodo(state.todos, id))) return;
    // キーボードで続けて操作できるよう、次のタスクの削除ボタンへフォーカスを移す
    const after = M.filterTodos(state.todos, state.filter);
    const neighbor = after[Math.min(index, after.length - 1)];
    if (neighbor) focusItem(neighbor.id, 'delete');
    else els.newTitle.focus();
  }

  function startEditing(id) {
    if (state.editingId) finishEditing();
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) return;
    state.editingId = id;
    state.draft = { title: todo.title, due: todo.due || '' };
    render();
    const input = els.list.querySelector('.edit-title');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function finishEditing({ restoreFocus = false } = {}) {
    const id = state.editingId;
    if (!id) return;
    readDraft();
    const { title, due } = state.draft;
    state.editingId = null;
    state.draft = null;
    if (!commit(M.updateTodo(state.todos, id, { title, due }))) render();
    if (restoreFocus) focusItem(id, 'edit');
  }

  function cancelEditing() {
    const id = state.editingId;
    if (!id) return;
    state.editingId = null;
    state.draft = null;
    render();
    focusItem(id, 'edit');
  }

  /** 編集フォームに入力中の内容を state.draft に写す（再描画で消えないように） */
  function readDraft() {
    if (!state.editingId) return;
    const form = els.list.querySelector('.edit-form');
    if (form && itemIdOf(form) === state.editingId) {
      state.draft = { title: form.elements.title.value, due: form.elements.due.value };
    }
  }

  /* ---------- 描画 ---------- */

  function render() {
    rendering = true;
    try {
      readDraft();
      if (state.editingId && !state.todos.some((todo) => todo.id === state.editingId)) {
        state.editingId = null; // 編集中のタスクが別のタブで削除された
        state.draft = null;
      }
      const focus = captureFocus();
      const visible = M.filterTodos(state.todos, state.filter);
      renderList(visible, M.toDateString());
      renderControls(visible.length);
      restoreFocus(focus);
      state.justAddedId = null;
    } finally {
      rendering = false;
    }
  }

  function renderList(visible, today) {
    const next = new Map();
    for (const todo of visible) {
      const key = itemKey(todo, today);
      const current = renderedItems.get(todo.id);
      if (current && current.key === key) {
        next.set(todo.id, current);
      } else {
        const node = createItem(todo, today);
        if (current) current.node.replaceWith(node);
        next.set(todo.id, { node, key });
      }
    }
    for (const [id, { node }] of renderedItems) {
      if (!next.has(id)) node.remove();
    }
    // 並び順をそろえる（追加や表示切り替えのとき以外は何も動かない）
    let index = 0;
    for (const { node } of next.values()) {
      const child = els.list.children[index];
      if (child !== node) els.list.insertBefore(node, child || null);
      index += 1;
    }
    renderedItems = next;
  }

  /** 表示内容が変わったかを判定するためのキー */
  function itemKey(todo, today) {
    const editing = todo.id === state.editingId;
    return JSON.stringify([todo.title, todo.completed, todo.due, editing, M.dueStatus(todo.due, today)]);
  }

  function renderControls(visibleCount) {
    const total = state.todos.length;
    const active = M.countActive(state.todos);
    const completed = total - active;
    const allDone = total > 0 && active === 0;

    els.toolbar.hidden = total === 0;
    els.footer.hidden = total === 0;
    els.toggleAll.textContent = allDone ? 'すべて未完了に戻す' : 'すべて完了にする';
    els.count.textContent = allDone ? 'すべて完了しました' : `残り ${active} 件`;
    els.clearCompleted.hidden = completed === 0;
    els.clearCompleted.textContent = `完了済みを削除（${completed}）`;
    for (const link of els.filterLinks) {
      if (link.dataset.filter === state.filter) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    els.empty.hidden = visibleCount > 0;
    els.empty.textContent = total === 0 ? EMPTY_MESSAGES.none : EMPTY_MESSAGES[state.filter] || '';
  }

  function createItem(todo, today) {
    const item = h('li', { className: 'todo-item' });
    item.dataset.id = todo.id;
    item.classList.toggle('is-completed', todo.completed);
    if (todo.id === state.justAddedId) {
      item.classList.add('is-new');
      item.addEventListener('animationend', () => item.classList.remove('is-new'), { once: true });
    }

    if (todo.id === state.editingId) {
      item.classList.add('is-editing');
      item.append(createEditForm(todo));
      return item;
    }

    const toggle = h('input', { type: 'checkbox', className: 'toggle', checked: todo.completed });
    toggle.dataset.focusKey = 'toggle';
    toggle.setAttribute('aria-label', `「${todo.title}」を完了にする`);

    const body = h(
      'div',
      { className: 'todo-body' },
      h('span', { className: 'todo-title', title: 'ダブルクリックで編集' }, todo.title),
    );
    if (todo.due) body.append(createDueBadge(todo, today));

    const actions = h(
      'div',
      { className: 'todo-actions' },
      createIconButton('edit', '編集', `「${todo.title}」を編集`),
      createIconButton('delete', '削除', `「${todo.title}」を削除`),
    );

    item.append(toggle, body, actions);
    return item;
  }

  function createDueBadge(todo, today) {
    // 完了済みのタスクは期限切れでも強調しない
    const status = todo.completed ? 'upcoming' : M.dueStatus(todo.due, today);
    const format = todo.due.slice(0, 4) === today.slice(0, 4) ? dueFormat : dueFormatWithYear;
    const text =
      status === 'today'
        ? DUE_LABELS.today
        : `${DUE_LABELS[status]} ${format.format(M.parseDate(todo.due))}`;
    return h('time', { className: `due due--${status}`, dateTime: todo.due }, text);
  }

  function createEditForm(todo) {
    const draft = state.draft || { title: todo.title, due: todo.due || '' };

    const title = h('input', {
      type: 'text',
      name: 'title',
      className: 'input edit-title',
      value: draft.title,
      maxLength: 200,
      autocomplete: 'off',
    });
    title.dataset.focusKey = 'edit-title';
    title.setAttribute('aria-label', 'タスク名');

    const due = h('input', { type: 'date', name: 'due', className: 'input edit-due', value: draft.due });
    due.dataset.focusKey = 'edit-due';
    due.setAttribute('aria-label', '期限');

    const save = h('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, '保存');
    const cancel = h('button', { type: 'button', className: 'btn btn-sm' }, 'キャンセル');
    cancel.dataset.action = 'cancel';

    return h('form', { className: 'edit-form', noValidate: true }, title, due, save, cancel);
  }

  function createIconButton(action, tooltip, label) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[action];

    const button = h('button', { type: 'button', className: `icon-btn icon-btn--${action}`, title: tooltip }, svg);
    button.dataset.action = action;
    button.dataset.focusKey = action;
    button.setAttribute('aria-label', label);
    return button;
  }

  /** 要素を作る小さなヘルパー。子の文字列はテキストとして追加される（HTML として解釈しない） */
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  /* ---------- フォーカス ---------- */

  function captureFocus() {
    const active = document.activeElement;
    if (!active || !els.list.contains(active) || !active.dataset.focusKey) return null;
    return { id: itemIdOf(active), key: active.dataset.focusKey };
  }

  function restoreFocus(focus) {
    if (focus && !els.list.contains(document.activeElement)) focusItem(focus.id, focus.key);
  }

  function focusItem(id, key) {
    const entry = renderedItems.get(id);
    const target = entry && entry.node.querySelector(`[data-focus-key="${key}"]`);
    if (target) target.focus();
  }

  function itemIdOf(element) {
    const item = element.closest('.todo-item');
    return item ? item.dataset.id : null;
  }

  /* ---------- イベント ---------- */

  els.addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addTodo();
  });

  els.toggleAll.addEventListener('click', () => {
    const allDone = state.todos.length > 0 && M.countActive(state.todos) === 0;
    commit(M.setAllCompleted(state.todos, !allDone));
  });

  els.clearCompleted.addEventListener('click', () => {
    commit(M.clearCompleted(state.todos));
    els.newTitle.focus();
  });

  els.list.addEventListener('change', (event) => {
    if (event.target.matches('.toggle')) commit(M.toggleTodo(state.todos, itemIdOf(event.target)));
  });

  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = itemIdOf(button);
    if (button.dataset.action === 'edit') startEditing(id);
    else if (button.dataset.action === 'delete') removeTodo(id);
    else if (button.dataset.action === 'cancel') cancelEditing();
  });

  els.list.addEventListener('dblclick', (event) => {
    if (event.target.closest('.todo-title')) startEditing(itemIdOf(event.target));
  });

  els.list.addEventListener('submit', (event) => {
    event.preventDefault();
    finishEditing({ restoreFocus: true });
  });

  els.list.addEventListener('keydown', (event) => {
    // 日本語入力の変換中に Esc を押した場合は変換の取り消しなので無視する
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
    if (!state.editingId) return;
    event.preventDefault();
    cancelEditing();
  });

  // 編集フォームのボタンを押してもフォーカスが入力欄から外れないようにする。
  // 外れると focusout で先に保存され、「キャンセル」が効かなくなる。
  els.list.addEventListener('mousedown', (event) => {
    if (event.target.closest('.edit-form button')) event.preventDefault();
  });

  // 編集フォームの外へフォーカスが移ったら、入力内容を保存して編集を終える
  els.list.addEventListener('focusout', (event) => {
    if (rendering || !state.editingId) return;
    const form = event.target.closest('.edit-form');
    if (!form || form.contains(event.relatedTarget)) return;
    finishEditing();
  });

  window.addEventListener('hashchange', () => {
    finishEditing();
    state.filter = M.filterFromHash(location.hash);
    render();
  });

  // 別のタブで変更されたら読み込み直す
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    state.todos = loadTodos();
    render();
  });

  /* ---------- 起動 ---------- */

  const now = new Date();
  els.today.textContent = headerDateFormat.format(now);
  els.today.dateTime = M.toDateString(now);
  if (!storage) {
    showNotice('このブラウザではデータを保存できません。ページを閉じるとタスクは消えます。');
  }
  state.todos = loadTodos();
  render();
})();
