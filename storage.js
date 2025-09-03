// storage.js
(() => {
  'use strict';

  const isExtension =
    typeof chrome !== 'undefined' &&
    chrome.storage &&
    typeof chrome.storage.local !== 'undefined';

  const DEFAULT_STATE = {
    version: 4,
    settings: { theme: 'auto', viewMode: 'grid', style: 'citrus', motion: 'calm', sort: 'order' },
    collections: [
      { id: 'col-inbox', name: '收集箱', color: '#0ea5e9', createdAt: Date.now() }
    ],
    bookmarks: []
  };

  const KEY = 'lime_state';

  const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;

  const read = () => new Promise((resolve) => {
    if (isExtension) {
      chrome.storage.local.get([KEY], (res) => resolve(res[KEY] || DEFAULT_STATE));
    } else {
      try {
        const raw = localStorage.getItem(KEY);
        resolve(raw ? JSON.parse(raw) : DEFAULT_STATE);
      } catch(e) {
        console.warn('localStorage parse fail', e);
        resolve(DEFAULT_STATE);
      }
    }
  });

  const write = (state) => new Promise((resolve) => {
    if (isExtension) {
      chrome.storage.local.set({ [KEY]: state }, () => resolve());
    } else {
      localStorage.setItem(KEY, JSON.stringify(state));
      resolve();
    }
  });

  const subscribe = (cb) => {
    if (isExtension) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
      });
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key === KEY && e.newValue) cb(JSON.parse(e.newValue));
      });
    }
  };

  window.LimeStorage = {
    environment: isExtension ? 'extension' : 'web',
    uid,
    read,
    write,
    subscribe
  };
})();
