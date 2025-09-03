// app.js
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const S = window.LimeStorage;
  let state, currentCollectionId, activeTag = null;

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      state = await S.read();
      state.settings = state.settings || {};
      if(!state.settings.style) state.settings.style = 'citrus';
      if(!state.settings.motion) state.settings.motion = 'calm';
      if(!state.settings.sort) state.settings.sort = 'order';

      // 预览模式：注入示例数据
      if (window.LimeDemo && (!state.bookmarks || state.bookmarks.length === 0)) {
        seedDemoData();
      }
      currentCollectionId = state.collections[0]?.id || 'col-inbox';
      applyTheme(state.settings.theme || 'auto');
      applyStylePack(state.settings.style || 'citrus');
      applyMotion(state.settings.motion || 'calm');
      applyAccentFromCollection();
      setViewMode(state.settings.viewMode || 'grid');
      bindGlobalEvents();

      // 接收 deep-link 数据（/?add=1&url=&title=&tags=&collection=）
      parseDeepLink();

      renderAll();
    } catch (err) {
      showDebug('初始化失败：' + (err && err.message ? err.message : err));
      console.error(err);
    }
  });

  S.subscribe((st) => { state = st; renderAll(); });

  function renderAll() {
    renderCollections();
    renderBoardHead();
    renderGrid();
    updateFeatureAvailability();
    renderQuickTags();
    $('#sort-select').value = state.settings.sort || 'order';
  }

  function renderCollections() {
    const nav = $('#collections');
    nav.innerHTML = '';
    const roots = state.collections.filter(c => !c.parentId);
    const childrenOf = (pid) => state.collections.filter(c => c.parentId === pid);

    roots
      .sort((a,b) => a.createdAt - b.createdAt)
      .forEach(col => {
        const group = document.createElement('div');
        group.className = 'col-group';
        const pill = document.createElement('button');
        pill.className = 'pill' + (col.id === currentCollectionId ? ' current' : '');
        pill.innerHTML = `<span class="dot" style="background:${col.color}"></span><span class="name">${escapeHtml(col.name)}</span>`;
        pill.title = col.name;
        pill.onclick = () => { currentCollectionId = col.id; activeTag = null; applyAccentFromCollection(); renderAll(); };
        pill.addEventListener('contextmenu', (e) => { e.preventDefault(); openCollectionDialog(col); });
        group.appendChild(pill);

        const childWrap = document.createElement('div');
        childWrap.className = 'col-children';
        childrenOf(col.id)
          .sort((a,b) => a.createdAt - b.createdAt)
          .forEach(ch => {
            const cbtn = document.createElement('button');
            cbtn.className = 'pill pill--child' + (ch.id === currentCollectionId ? ' current' : '');
            cbtn.innerHTML = `<span class="dot" style="background:${ch.color}"></span><span class="name">${escapeHtml(ch.name)}</span>`;
            cbtn.title = ch.name;
            cbtn.onclick = () => { currentCollectionId = ch.id; activeTag = null; applyAccentFromCollection(); renderAll(); };
            cbtn.addEventListener('contextmenu', (e) => { e.preventDefault(); openCollectionDialog(ch); });
            childWrap.appendChild(cbtn);
          });
        group.appendChild(childWrap);
        nav.appendChild(group);
      });
  }

  function renderBoardHead() {
    const col = state.collections.find(c => c.id === currentCollectionId);
    $('#board-title').textContent = col?.name || '集合';
    $('#board-sub').textContent = col ? `主题色 · ${col.color} · ${countInCollection(col.id)} 条书签` : '';
  }

  function renderGrid() {
    const wrap = $('#grid');
    const q = ($('#search').value || '').trim().toLowerCase();
    const mode = state.settings.viewMode || 'grid';
    wrap.classList.toggle('list', mode === 'list');

    const sort = state.settings.sort || 'order';

    const list = state.bookmarks
      .filter(b => b.collectionId === currentCollectionId)
      .filter(b => {
        const hitQ = !q ? true : `${b.title} ${b.url} ${b.tags?.join(' ')}`.toLowerCase().includes(q);
        const hitTag = !activeTag ? true : (b.tags || []).map(x => x.toLowerCase()).includes(activeTag.toLowerCase());
        return hitQ && hitTag;
      });

    if (sort === 'title') list.sort((a,b) => (a.title || '').localeCompare(b.title || ''));
    else if (sort === 'created') list.sort((a,b) => (a.createdAt) - (b.createdAt));
    else list.sort((a,b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

    wrap.innerHTML = '';
    list.forEach(bm => wrap.appendChild(renderCard(bm, mode)));
  }

  function renderCard(bm, mode) {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = bm.id;

    const tagsHtml = bm.tags?.length ? `<div class="tags">${bm.tags.map(t => `<button class="tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('')}</div>` : '';
    const noteHtml = bm.note ? `<div class="note">${escapeHtml(bm.note)}</div>` : '';

    if (mode === 'list') {
      card.innerHTML = `
        <div class="row">
          <img class="favicon" src="${faviconOf(bm.url)}" onerror="this.src='icons/lime.svg'"/>
          <div class="title" title="${escapeHtml(bm.title)}">${escapeHtml(bm.title)}</div>
          <div class="url" title="${bm.url}">${bm.url}</div>
        </div>
        ${tagsHtml}
        ${noteHtml}
        <div class="ops">
          <div class="left">
            <button class="icon-btn" title="打开" data-op="open">🔗</button>
            <button class="icon-btn" title="复制链接" data-op="copy">📋</button>
            <button class="icon-btn" title="编辑" data-op="edit">✏️</button>
            <button class="icon-btn" title="删除" data-op="del">✖️</button>
            <button class="icon-btn" title="分享" data-op="share">📤</button>
          </div>
          <small>${fmtDate(bm.createdAt)}</small>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="row">
          <img class="favicon" src="${faviconOf(bm.url)}" onerror="this.src='icons/lime.svg'"/>
          <div class="title" title="${escapeHtml(bm.title)}">${escapeHtml(bm.title)}</div>
        </div>
        <div class="url" title="${bm.url}">${bm.url}</div>
        ${tagsHtml}
        ${noteHtml}
        <div class="ops">
          <div class="left">
            <button class="icon-btn" title="打开" data-op="open">🔗</button>
            <button class="icon-btn" title="复制链接" data-op="copy">📋</button>
            <button class="icon-btn" title="编辑" data-op="edit">✏️</button>
            <button class="icon-btn" title="删除" data-op="del">✖️</button>
            <button class="icon-btn" title="分享" data-op="share">📤</button>
          </div>
          <small>${fmtDate(bm.createdAt)}</small>
        </div>
      `;
    }

    // 操作
    card.addEventListener('click', async (e) => {
      const tagBtn = e.target.closest('button.tag');
      if (tagBtn) {
        const t = tagBtn.dataset.tag;
        activeTag = (activeTag === t) ? null : t;
        renderQuickTags(); renderGrid();
        return;
      }
      const btn = e.target.closest('button[data-op]');
      if (!btn) return;
      const op = btn.dataset.op;
      if (op === 'open') window.open(bm.url, '_blank');
      if (op === 'copy') {
        await navigator.clipboard?.writeText(bm.url).catch(()=>{});
      }
      if (op === 'share') {
        if (navigator.share) {
          try { await navigator.share({ title: bm.title, url: bm.url, text: bm.note || '' }); } catch {}
        } else {
          await navigator.clipboard?.writeText(`${bm.title} — ${bm.url}`);
          alert('已复制到剪贴板（你的浏览器不支持系统分享）');
        }
      }
      if (op === 'edit') openBookmarkDialog(bm);
      if (op === 'del') removeBookmark(bm.id);
    });

    // 拖拽排序（仅手动排序模式有效）
    const allowDrag = (state.settings.sort || 'order') === 'order';
    card.draggable = allowDrag;
    if (allowDrag) {
      card.addEventListener('dragstart', () => { card.classList.add('dragging'); });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); });
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragging = $('.card.dragging');
        if (!dragging || dragging === card) return;
        const grid = $('#grid');
        const children = $$('.card', grid);
        const srcIdx = children.indexOf(dragging);
        const dstIdx = children.indexOf(card);
        const list = state.bookmarks
          .filter(b => b.collectionId === currentCollectionId)
          .sort((a,b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
        const src = list[srcIdx], dst = list[dstIdx];
        const tmp = src.order ?? src.createdAt;
        src.order = dst.order ?? dst.createdAt;
        dst.order = tmp;
        persist();
      });
    }

    return card;
  }

  function renderQuickTags() {
    const box = $('#quick-tags');
    const tags = new Map();
    state.bookmarks.filter(b => b.collectionId === currentCollectionId).forEach(b => {
      (b.tags || []).forEach(t => tags.set(t, (tags.get(t) || 0) + 1));
    });
    const top = Array.from(tags.entries()).sort((a,b) => b[1]-a[1]).slice(0, 8);
    box.innerHTML = top.map(([t,_]) => `<button class="chip" data-tag="${escapeHtml(t)}" aria-pressed="${activeTag===t?'true':'false'}">#${escapeHtml(t)}</button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button.chip'); if(!b) return;
      const t = b.dataset.tag;
      activeTag = (activeTag === t) ? null : t;
      renderQuickTags(); renderGrid();
    };
  }

  function updateFeatureAvailability() {
    const isExt = S.environment === 'extension';
    $('#btn-save-open-tabs').disabled = !isExt;
    $('#btn-import-chrome').disabled = !isExt;
  }

  // ===== 交互 =====
  function bindGlobalEvents(){
    $('#search').addEventListener('input', renderGrid);
    $('#sort-select').addEventListener('change', (e) => {
      state.settings.sort = e.target.value;
      persist();
    });

    $('#btn-theme').addEventListener('click', () => {
      const next = cycleTheme(state.settings.theme || 'auto');
      state.settings.theme = next;
      applyTheme(next);
      persist();
    });

    const STYLE_PACKS = ['citrus','noir','pastel','mono'];
    $('#btn-style').addEventListener('click', () => {
      const curr = state.settings.style || 'citrus';
      const idx = (STYLE_PACKS.indexOf(curr) + 1) % STYLE_PACKS.length;
      state.settings.style = STYLE_PACKS[idx];
      applyStylePack(state.settings.style);
      persist();
    });

    const MOTION_PACKS = ['calm','snappy','floaty','minimal'];
    $('#btn-motion').addEventListener('click', () => {
      const curr = state.settings.motion || 'calm';
      const idx = (MOTION_PACKS.indexOf(curr) + 1) % MOTION_PACKS.length;
      state.settings.motion = MOTION_PACKS[idx];
      applyMotion(state.settings.motion);
      persist();
    });

    $('#btn-view-grid').addEventListener('click', () => { setViewMode('grid'); });
    $('#btn-view-list').addEventListener('click', () => { setViewMode('list'); });
    $('#btn-new-bookmark').addEventListener('click', () => openBookmarkDialog());
    $('#btn-new-collection').addEventListener('click', () => openCollectionDialog());
    $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
    $('#btn-bookmarklet').addEventListener('click', () => window.open('tools.html', '_blank'));
  }

  // NEW: 快捷保存菜单（预选集合打开“新建书签”弹窗）
  (function(){
    const btn = document.getElementById('btn-quick-save');
    const menu = document.getElementById('quick-save-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
      // build menu
      const roots = state.collections.filter(c => !c.parentId);
      const childOf = (pid) => state.collections.filter(c => c.parentId === pid);
      menu.innerHTML = '';
      roots.sort((a,b)=>a.createdAt - b.createdAt).forEach(r => {
        const rb = document.createElement('button');
        rb.textContent = `📁 ${r.name}`;
        rb.onclick = () => { menu.hidden = true; openBookmarkDialog({ title: document.title, url: location.href, tags: [], note: '', collectionId: r.id }); };
        menu.appendChild(rb);
        childOf(r.id).sort((a,b)=>a.createdAt - b.createdAt).forEach(ch => {
          const cb = document.createElement('button');
          cb.textContent = `↳ ${ch.name}`;
          cb.onclick = () => { menu.hidden = true; openBookmarkDialog({ title: document.title, url: location.href, tags: [], note: '', collectionId: ch.id }); };
          menu.appendChild(cb);
        });
      });
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#quick-save')) menu.hidden = true;
    });
  })();


  // NEW: 点击对话框遮罩关闭（ESC 默认可用）
  document.addEventListener('click', (e) => {
    const anyOpenDlg = Array.from(document.querySelectorAll('dialog[open]'));
    anyOpenDlg.forEach(dlg => { if (e.target === dlg) { try { dlg.close('cancel'); } catch(e){} } });
  });


  function setViewMode(mode){
    state.settings.viewMode = mode;
    $('#btn-view-grid').setAttribute('aria-pressed', mode==='grid'?'true':'false');
    $('#btn-view-list').setAttribute('aria-pressed', mode==='list'?'true':'false');
    persist();
  }

  // 新建书签
  function openBookmarkDialog(bm) {
    const dlg = $('#dlg-bookmark');
    const form = $('#form-bookmark');
    $('#dlg-bm-title').textContent = bm ? '编辑书签' : '新建书签';
    const sel = $('#bm-collection');
    {
      const roots = state.collections.filter(c => !c.parentId);
      const childOf = (pid) => state.collections.filter(c => c.parentId === pid);
      const opts = [];
      roots.sort((a,b)=>a.createdAt - b.createdAt).forEach(r => {
        opts.push(`<option value="${r.id}">📁 ${escapeHtml(r.name)}</option>`);
        childOf(r.id).sort((a,b)=>a.createdAt - b.createdAt).forEach(ch => {
          opts.push(`<option value="${ch.id}">↳ ${escapeHtml(ch.name)}</option>`);
        });
      });
      sel.innerHTML = opts.join('');
    }
    form.title.value = bm?.title || '';
    form.url.value = bm?.url || '';
    form.tags.value = (bm?.tags || []).join(', ');
    form.note.value = bm?.note || '';
    form.collectionId.value = bm?.collectionId || currentCollectionId;
    form.id.value = bm?.id || '';
    dlg.showModal();

    // 兼容性：在部分浏览器中，form[method="dialog"] 不会自动关闭对话框
    const _okBtn = form.querySelector('button[value="ok"]');
    const _cancelBtn = form.querySelector('button[value="cancel"]');
    if (_okBtn) _okBtn.addEventListener('click', () => { try { dlg.close('ok'); } catch(e){} }, { once: true });
    if (_cancelBtn) _cancelBtn.addEventListener('click', () => { try { dlg.close('cancel'); } catch(e){} }, { once: true });
    // 如果浏览器不支持 <form method="dialog"> 的原生提交与关闭，这里做降级处理
    const _dialogSupported = !!window.HTMLDialogElement && !!HTMLDialogElement.prototype.showModal;
    if (!_dialogSupported) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        const val = submitter ? (submitter.getAttribute('value') || 'ok') : 'ok';
        try { dlg.close(val); } catch(e) {}
      }, { once: true });
    }



dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return;
      const data = Object.fromEntries(new FormData(form).entries());
      const tags = (data.tags || '').split(',').map(s => s.trim()).filter(Boolean);
      if (bm) {
        Object.assign(bm, { title: data.title, url: data.url, tags, note: data.note, collectionId: data.collectionId });
      } else {
        const id = S.uid('bm');
        state.bookmarks.push({
          id, title: data.title, url: data.url, tags, note: data.note,
          collectionId: data.collectionId, createdAt: Date.now(), order: Date.now()
        });
      }
      if (!bm) currentCollectionId = data.collectionId;
      applyAccentFromCollection();
      persist();
    }, { once: true });
  }

  function removeBookmark(id) {
    if (!confirm('确认删除该书签？')) return;
    state.bookmarks = state.bookmarks.filter(b => b.id !== id);
    persist();
  }

  // 新建/编辑集合（带删除）
  function openCollectionDialog(col) {
    const dlg = $('#dlg-collection');
    const form = $('#form-collection');
    const danger = $('#col-danger');
    const btnDel = $('#btn-col-delete');
    const moveToInbox = $('#col-move-to-inbox');

    $('#dlg-col-title').textContent = col ? '编辑集合' : '新建集合';
    form.name.value = col?.name || '';
    form.color.value = col?.color || '#10b981';
    form.id.value = col?.id || '';
    // NEW: parent selector populate
    (function(){
      let sel = document.getElementById('col-parent');
      if (sel) {
        const roots = state.collections.filter(c => !c.parentId || (col && c.id === col.id ? false : true));
        sel.innerHTML = '<option value="">（无上级 / 根）</option>' + roots
          .filter(c => !col || c.id !== col.id) // exclude self
          .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        sel.value = col?.parentId || '';
      }
    })();
    danger.hidden = !col;
    dlg.showModal();

    // 兼容性：在部分浏览器中，form[method="dialog"] 不会自动关闭对话框
    const _okBtn = form.querySelector('button[value="ok"]');
    const _cancelBtn = form.querySelector('button[value="cancel"]');
    if (_okBtn) _okBtn.addEventListener('click', () => { try { dlg.close('ok'); } catch(e){} }, { once: true });
    if (_cancelBtn) _cancelBtn.addEventListener('click', () => { try { dlg.close('cancel'); } catch(e){} }, { once: true });
    // 如果浏览器不支持 <form method="dialog"> 的原生提交与关闭，这里做降级处理
    const _dialogSupported = !!window.HTMLDialogElement && !!HTMLDialogElement.prototype.showModal;
    if (!_dialogSupported) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        const val = submitter ? (submitter.getAttribute('value') || 'ok') : 'ok';
        try { dlg.close(val); } catch(e) {}
      }, { once: true });
    }




    btnDel.onclick = () => {
      if (!col) return;
      if (!confirm(`确认删除集合「${col.name}」？`)) return;
      if (moveToInbox.checked) {
        const inbox = state.collections.find(c => c.id === 'col-inbox') || state.collections[0];
        state.bookmarks.forEach(b => { if (b.collectionId === col.id) b.collectionId = inbox.id; });
      } else {
        state.bookmarks = state.bookmarks.filter(b => b.collectionId !== col.id);
      }
      // NEW: reparent children collections to root if deleting a parent
      state.collections.forEach(c => { if (c.parentId === col.id) c.parentId = null; });
      state.collections = state.collections.filter(c => c.id !== col.id);
      if (currentCollectionId === col.id) currentCollectionId = state.collections[0]?.id || 'col-inbox';
      dlg.close();
      applyAccentFromCollection();
      persist();
    };
dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return;
      const data = Object.fromEntries(new FormData(form).entries());
      if (col) {
        Object.assign(col, { name: data.name, color: data.color, parentId: data.parentId || null });
      } else {
        const id = S.uid('col');
        state.collections.push({ id, name: data.name, color: data.color, parentId: data.parentId || null, createdAt: Date.now() });
        currentCollectionId = id;
      }
      applyAccentFromCollection();
      persist();
    }, { once: true });
  }

  // 导出
  $('#btn-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `limebox-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // 导入
  $('#btn-import-json').addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.html,.htm,application/json,text/html';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      const txt = await file.text();
      try {
        // NEW: 支持 JSON 与 HTML (Netscape) 书签导入
        let imported = null;
        try {
          imported = JSON.parse(txt);
        } catch(e) { imported = null; }
        if (imported && imported.collections && imported.bookmarks) {
          state = imported;
          await S.write(state);
          applyAccentFromCollection();
          renderAll();
          alert('导入成功');
        } else {
          // 解析 Netscape 书签 HTML
          const isNetscape = /NETSCAPE-Bookmark-file/i.test(txt) || /<DL>/i.test(txt);
          if (!isNetscape) throw new Error('仅支持 LimeBox JSON 或 Netscape HTML');
          const doc = new DOMParser().parseFromString(txt, 'text/html');
          const dl = doc.querySelector('dl');
          if (!dl) throw new Error('未识别到书签结构');
          const ensureCol = (name, parentId=null) => {
            const hit = state.collections.find(c => c.name===name && (c.parentId||null)===parentId);
            if (hit) return hit.id;
            const id = S.uid('col');
            state.collections.push({ id, name, color: '#10b981', parentId, createdAt: Date.now() });
            return id;
          };
          const walk = (node, path=[]) => {
            Array.from(node.children).forEach(ch => {
              if (ch.tagName && ch.tagName.toLowerCase() === 'dt') {
                const h3 = ch.querySelector('h3');
                const a = ch.querySelector('a');
                if (h3) {
                  const name = h3.textContent.trim();
                  const nextPath = [...path, name].slice(0,2);
                  const next = ch.nextElementSibling;
                  if (next && next.tagName && next.tagName.toLowerCase()==='dl') walk(next, nextPath);
                } else if (a) {
                  const title = a.textContent.trim();
                  const url = a.getAttribute('href');
                  const rootName = path[0] || '导入';
                  const childName = path[1] || null;
                  const rootId = ensureCol(rootName, null);
                  const colId = childName ? ensureCol(childName, rootId) : rootId;
                  state.bookmarks.push({ id: S.uid('bm'), title: title || url, url, tags: [], note: '', collectionId: colId, createdAt: Date.now(), order: Date.now() });
                }
              }
            });
          };
          walk(dl, []);
          await S.write(state);
          applyAccentFromCollection();
          renderAll();
          alert('导入成功');
        }
      } catch (e) {
        alert('导入失败：' + e.message);
      }
    };
    input.click();
  });

  // 扩展：收集当前窗口标签页（仅扩展可用）
  $('#btn-save-open-tabs').addEventListener('click', async () => {
    if (S.environment !== 'extension') return;
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const id = S.uid('col');
      const colName = `会话 ${new Date().toLocaleString()}`;
      state.collections.push({ id, name: colName, color: '#f59e0b', createdAt: Date.now() });
      tabs.forEach(t => {
        if (!t.url || t.url.startsWith('chrome://')) return;
        state.bookmarks.push({
          id: S.uid('bm'), title: t.title || t.url, url: t.url, tags: ['session'],
          note: '', collectionId: id, createdAt: Date.now(), order: Date.now()
        });
      });
      currentCollectionId = id;
      applyAccentFromCollection();
      persist();
      alert('已收集当前窗口标签页');
    });
  });

  // ===== Deep Link 解析 =====
  function parseDeepLink(){
    const p = new URL(location.href).searchParams;
    if (p.get('add') === '1' && p.get('url')) {
      const preset = {
        title: p.get('title') || '',
        url: p.get('url') || '',
        tags: (p.get('tags') || '').split(',').map(s=>s.trim()).filter(Boolean),
        collectionId: p.get('collection') || currentCollectionId,
        note: p.get('note') || ''
      };
      openBookmarkDialog(presetToBookmark(preset));
    }
  }
  function presetToBookmark(p){
    return { id: '', title: p.title, url: p.url, tags: p.tags, note: p.note, collectionId: p.collectionId, createdAt: Date.now(), order: Date.now() };
  }

  // ===== 工具 =====
  function faviconOf(url) {
    try { const u = new URL(url); return `${u.origin}/favicon.ico`; }
    catch { return 'icons/lime.svg'; }
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s = '') {
    const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'};
    return s.replace(/[&<>"']/g, ch => map[ch]);
  }
  function persist() { S.write(state).then(() => { renderAll(); }); }
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'dark' || mode === 'light') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme'); // 跟随系统
  }
  function cycleTheme(mode) { return mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto'; }
  function applyStylePack(style){ document.documentElement.setAttribute('data-style', style); }
  function applyMotion(motion){ document.documentElement.setAttribute('data-motion', motion); }
  function applyAccentFromCollection() {
    const col = state.collections.find(c => c.id === currentCollectionId);
    const color = col?.color || '#0ea5e9';
    const rgb = hexToRgb(color) || { r: 14, g: 165, b: 233 };
    document.documentElement.style.setProperty('--accent', `${rgb.r} ${rgb.g} ${rgb.b}`);
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function countInCollection(colId){ return state.bookmarks.filter(b => b.collectionId === colId).length; }
  function seedDemoData(){
    state.collections = [
      { id: 'col-work', name: '工作台', color: '#0ea5e9', createdAt: Date.now()-10000 },
      { id: 'col-read', name: '阅读清单', color: '#22c55e', createdAt: Date.now()-9000 },
      { id: 'col-design', name: '设计灵感', color: '#a855f7', createdAt: Date.now()-8000 },
      { id: 'col-dev', name: '开发工具', color: '#f59e0b', createdAt: Date.now()-7000 }
    ];
    currentCollectionId = 'col-work';
    const mk = (id, t, u, tags, note, col, order) => ({ id, title: t, url: u, tags, note, collectionId: col, createdAt: Date.now() - order*1000, order: Date.now() - order*1000 });
    state.bookmarks = [
      mk('bm1','Toby — Team tabs','https://www.gettoby.com',['work','tabs'],'参考交互与信息密度','col-work',1),
      mk('bm2','Pinboard — Social bookmarking','https://pinboard.in',['reading','classic'],'极简与文本导向','col-read',2),
      mk('bm3','Raycast','https://www.raycast.com',['productivity','launcher'],'命令面板设计灵感','col-design',3),
      mk('bm4','Vercel','https://vercel.com',['deploy','serverless'],'一键部署前端','col-dev',4),
      mk('bm5','Tailwind CSS','https://tailwindcss.com',['css','utility'],'原子化样式库','col-dev',5),
      mk('bm6','Awwwards','https://www.awwwards.com',['design','gallery'],'优秀网页灵感库','col-design',6),
      mk('bm7','MDN Web Docs','https://developer.mozilla.org',['docs','web'],'权威文档','col-dev',7),
      mk('bm8','Notion','https://www.notion.so',['docs','workspace'],'个人与团队知识库','col-work',8),
      mk('bm9','Hacker News','https://news.ycombinator.com',['tech','news'],'技术热点','col-read',9),
      mk('bm10','Readable — 阅读体验指南','https://readable.com',['typography','reading'],'排版可读性参考','col-design',10),
      mk('bm11','GitHub','https://github.com',['code','git'],'代码托管与协作','col-work',11),
      mk('bm12','Figma','https://www.figma.com',['design','tool'],'UI 协作设计','col-design',12)
    ];
    state.settings = { theme: 'auto', viewMode: 'grid', style: 'citrus', motion: 'calm', sort: 'order' };
  }
  function showDebug(msg){
    const box = document.getElementById('debug'); if (!box) return;
    box.style.display = 'block'; box.textContent = String(msg || '');
  }
})();