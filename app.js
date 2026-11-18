(() => {
  'use strict';

  const KEY = 'quicknotes.v1';
  const TAB_KEY = 'quicknotes.tab';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let state = load();
  let currentId = null;
  let todoFilter = 'all';
  let saveTimer = null;
  let toastTimer = null;

  /* ------------------------------------------------------------------ *
   * Storage
   * ------------------------------------------------------------------ */
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const notes = Array.isArray(data.notes) ? data.notes : [];
        const todos = Array.isArray(data.todos) ? data.todos : [];
        return {
          // drop blank notes that were never filled in
          notes: notes.filter((n) => n && (n.title || n.body)),
          todos: todos.filter((t) => t && t.text),
        };
      }
    } catch (err) {
      console.warn('Could not read saved data', err);
    }
    return { notes: [], todos: [] };
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      toast('Could not save. Storage may be full or blocked.');
      return false;
    }
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString([], opts);
  }

  function formatFull(ts) {
    return new Date(ts).toLocaleString([], {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    children.forEach((c) => node.append(c));
    return node;
  }

  const getNote = (id) => state.notes.find((n) => n.id === id);

  /* ------------------------------------------------------------------ *
   * Tabs
   * ------------------------------------------------------------------ */
  function showTab(name) {
    $$('.tabs [role="tab"]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === name));
    });
    $('#notesView').hidden = name !== 'notes';
    $('#todosView').hidden = name !== 'todos';
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * Notes
   * ------------------------------------------------------------------ */
  function visibleNotes() {
    const q = $('#search').value.trim().toLowerCase();
    return state.notes
      .filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q))
      .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.updated - a.updated));
  }

  function renderNoteList() {
    const list = $('#noteList');
    list.replaceChildren();
    const notes = visibleNotes();

    notes.forEach((n) => {
      const snippet = n.body.replace(/\s+/g, ' ').trim().slice(0, 90);
      const title = (n.pinned ? '📌 ' : '') + (n.title.trim() || 'Untitled');
      const btn = el('button', { class: 'note-item' + (n.id === currentId ? ' active' : ''), type: 'button' },
        el('div', { class: 'row' },
          el('span', { class: 'title', text: title }),
          el('span', { class: 'date', text: formatDate(n.updated) })),
        el('div', { class: 'snippet', text: snippet || 'No additional text' }));
      btn.addEventListener('click', () => openNote(n.id));
      list.appendChild(el('li', null, btn));
    });

    const empty = $('#noteEmpty');
    if (notes.length === 0) {
      empty.textContent = $('#search').value.trim()
        ? 'No notes match your search.'
        : 'No notes yet. Tap “+ New” to write your first one.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
  }

  function updateMeta(note) {
    $('#noteMeta').textContent =
      'Created ' + formatFull(note.created) + '  ·  Edited ' + formatFull(note.updated) +
      '  ·  ' + (note.body.trim() ? note.body.trim().split(/\s+/).length : 0) + ' words';
  }

  function openNote(id) {
    flushSave();
    discardIfEmpty();
    const note = getNote(id);
    if (!note) return;
    currentId = id;
    $('#noteTitle').value = note.title;
    $('#noteBody').value = note.body;
    $('#saveStatus').textContent = 'Saved';
    setPinButton(note);
    updateMeta(note);
    $('#editor').hidden = false;
    $('#editorEmpty').hidden = true;
    $('#notesView').classList.add('editing');
    renderNoteList();
  }

  function closeEditor() {
    flushSave();
    discardIfEmpty();
    currentId = null;
    $('#editor').hidden = true;
    $('#editorEmpty').hidden = false;
    $('#notesView').classList.remove('editing');
    renderNoteList();
  }

  function discardIfEmpty() {
    const note = getNote(currentId);
    if (note && !note.title.trim() && !note.body.trim()) {
      state.notes = state.notes.filter((n) => n.id !== note.id);
      persist();
    }
  }

  function newNote() {
    flushSave();
    discardIfEmpty();
    $('#search').value = '';
    const now = Date.now();
    const note = { id: uid(), title: '', body: '', pinned: false, created: now, updated: now };
    state.notes.push(note);
    openNote(note.id);
    $('#noteTitle').focus();
  }

  function setPinButton(note) {
    const btn = $('#pinBtn');
    btn.textContent = note.pinned ? 'Unpin' : 'Pin';
    btn.setAttribute('aria-pressed', String(!!note.pinned));
  }

  function onEdit() {
    const note = getNote(currentId);
    if (!note) return;
    note.title = $('#noteTitle').value;
    note.body = $('#noteBody').value;
    note.updated = Date.now();
    $('#saveStatus').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  function flushSave() {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const note = getNote(currentId);
    if (!note) return;
    if (persist()) {
      $('#saveStatus').textContent = 'Saved';
      updateMeta(note);
      renderNoteList();
    }
  }

  function deleteCurrentNote() {
    const note = getNote(currentId);
    if (!note) return;
    const label = note.title.trim() || 'this note';
    if (!confirm('Delete "' + label + '"? This cannot be undone.')) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    state.notes = state.notes.filter((n) => n.id !== note.id);
    persist();
    currentId = null;
    $('#editor').hidden = true;
    $('#editorEmpty').hidden = false;
    $('#notesView').classList.remove('editing');
    renderNoteList();
  }

  function togglePin() {
    const note = getNote(currentId);
    if (!note) return;
    note.pinned = !note.pinned;
    persist();
    setPinButton(note);
    renderNoteList();
  }

  /* ------------------------------------------------------------------ *
   * To-do
   * ------------------------------------------------------------------ */
  function renderTodos() {
    const list = $('#todoList');
    list.replaceChildren();

    const items = state.todos.filter((t) =>
      todoFilter === 'all' ? true : todoFilter === 'active' ? !t.done : t.done);
    items.forEach((t) => list.appendChild(todoRow(t)));

    const active = state.todos.filter((t) => !t.done).length;
    const done = state.todos.length - active;

    const empty = $('#todoEmpty');
    if (items.length === 0) {
      empty.textContent =
        state.todos.length === 0 ? 'Nothing to do yet. Add your first task above.' :
        todoFilter === 'active' ? 'No active tasks. Nice work!' : 'No completed tasks yet.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    $('#todoCount').textContent = active + (active === 1 ? ' task left' : ' tasks left');
    $('#clearDone').hidden = done === 0;

    const badge = $('#todoBadge');
    badge.textContent = String(active);
    badge.hidden = active === 0;
  }

  function todoRow(t) {
    const check = el('input', { type: 'checkbox', 'aria-label': 'Mark task done' });
    check.checked = !!t.done;
    check.addEventListener('change', () => {
      t.done = check.checked;
      persist();
      renderTodos();
    });

    const text = el('span', { class: 'text', text: t.text, title: 'Double-click to edit' });
    const edit = el('button', { class: 'ghost icon-btn', type: 'button', 'aria-label': 'Edit task', text: '✎' });
    const del = el('button', { class: 'ghost icon-btn del', type: 'button', 'aria-label': 'Delete task', text: '✕' });

    const li = el('li', { class: 'todo-item' + (t.done ? ' done' : '') }, check, text, edit, del);

    const startEdit = () => {
      const input = el('input', { class: 'edit-input', maxlength: '300', 'aria-label': 'Edit task text' });
      input.value = t.text;
      li.replaceChild(input, text);
      input.focus();
      input.select();
      let finished = false;
      const finish = (save) => {
        if (finished) return;
        finished = true;
        const value = input.value.trim();
        if (save && value && value !== t.text) {
          t.text = value;
          persist();
        }
        renderTodos();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    };

    text.addEventListener('dblclick', startEdit);
    edit.addEventListener('click', startEdit);
    del.addEventListener('click', () => {
      state.todos = state.todos.filter((x) => x.id !== t.id);
      persist();
      renderTodos();
    });

    return li;
  }

  function addTodo(e) {
    e.preventDefault();
    const input = $('#todoInput');
    const value = input.value.trim();
    if (!value) return;
    state.todos.unshift({ id: uid(), text: value, done: false, created: Date.now() });
    input.value = '';
    persist();
    renderTodos();
    input.focus();
  }

  function setFilter(name) {
    todoFilter = name;
    $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === name)));
    renderTodos();
  }

  /* ------------------------------------------------------------------ *
   * Backup / restore
   * ------------------------------------------------------------------ */
  function exportData() {
    flushSave();
    const blob = new Blob([JSON.stringify({ app: 'quicknotes', version: 1, ...state }, null, 2)],
      { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'quicknotes-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const notes = Array.isArray(data.notes) ? data.notes : [];
        const todos = Array.isArray(data.todos) ? data.todos : [];
        let addedNotes = 0;
        let addedTodos = 0;

        notes.forEach((n) => {
          if (!n || typeof n.id !== 'string' || typeof n.body !== 'string') return;
          const clean = {
            id: n.id,
            title: String(n.title || ''),
            body: n.body,
            pinned: !!n.pinned,
            created: Number(n.created) || Date.now(),
            updated: Number(n.updated) || Date.now(),
          };
          const existing = getNote(n.id);
          if (!existing) { state.notes.push(clean); addedNotes++; }
          else if (clean.updated > existing.updated) Object.assign(existing, clean);
        });

        todos.forEach((t) => {
          if (!t || typeof t.id !== 'string' || typeof t.text !== 'string') return;
          if (!state.todos.some((x) => x.id === t.id)) {
            state.todos.push({ id: t.id, text: t.text, done: !!t.done, created: Number(t.created) || Date.now() });
            addedTodos++;
          }
        });

        persist();
        renderNoteList();
        renderTodos();
        toast('Restored ' + addedNotes + ' notes and ' + addedTodos + ' tasks.');
      } catch (err) {
        toast('That file is not a valid QuickNotes backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Wire up
   * ------------------------------------------------------------------ */
  $$('.tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  $('#newNote').addEventListener('click', newNote);
  $('#backBtn').addEventListener('click', closeEditor);
  $('#deleteNote').addEventListener('click', deleteCurrentNote);
  $('#pinBtn').addEventListener('click', togglePin);
  $('#noteTitle').addEventListener('input', onEdit);
  $('#noteBody').addEventListener('input', onEdit);
  $('#search').addEventListener('input', renderNoteList);
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; renderNoteList(); }
  });

  $('#todoForm').addEventListener('submit', addTodo);
  $$('.chip').forEach((c) => c.addEventListener('click', () => setFilter(c.dataset.filter)));
  $('#clearDone').addEventListener('click', () => {
    state.todos = state.todos.filter((t) => !t.done);
    persist();
    renderTodos();
  });

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  // Save pending edits if the tab is hidden or closed
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
  window.addEventListener('pagehide', flushSave);

  // Keep several open tabs in sync
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    if (currentId && !getNote(currentId)) closeEditor();
    renderNoteList();
    renderTodos();
  });

  /* ------------------------------------------------------------------ *
   * PWA: install prompt + service worker
   * ------------------------------------------------------------------ */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err));
    });
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  renderNoteList();
  renderTodos();
  try {
    const last = localStorage.getItem(TAB_KEY);
    if (last === 'todos' || last === 'notes') showTab(last);
  } catch (e) { /* ignore */ }
})();
