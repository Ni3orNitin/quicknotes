# QuickNotes (PWA)

An offline-first notes + to-do app. No backend, no build step, no dependencies.
All data is stored in your browser (`localStorage`) on your own device.

## Features

**Notes**
- Create, edit, delete notes (auto-saves as you type)
- Pin important notes to the top
- Search by title or text
- Word count and created / edited time

**To-Do**
- Add, edit (double-click or ✎), complete, delete tasks
- Filter: All / Active / Done
- "Clear completed" and a live count on the tab

**PWA**
- Installable on phone and desktop
- Works fully offline (service worker caches the app)
- Light and dark mode follow the system setting
- Backup / Restore buttons export and import all data as a JSON file

## Run it locally

A service worker needs `http://localhost` or HTTPS (opening `index.html` by double-click will
work as a normal page, but the install and offline features will not).

```bash
cd notes-pwa
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node: `npx serve .`

## Deploy free (HTTPS, so it is installable)

- **GitHub Pages**: push this folder to a repo, then Settings > Pages > deploy from branch.
  All paths are relative, so it works under `https://<user>.github.io/<repo>/`.
- **Netlify / Vercel / Cloudflare Pages**: drag and drop the folder.

## Install on your phone

Open the deployed URL in Chrome (Android) and tap **Install** in the app or
"Add to Home screen" in the browser menu. On iPhone use Safari > Share > Add to Home Screen.

## Project structure

```
index.html            page structure
styles.css            styling (responsive, dark mode)
app.js                notes, to-do, storage, backup, install prompt
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA metadata
icons/                192, 512 and maskable icons
```

## Notes for development

- When you change any file, bump `CACHE_VERSION` in `sw.js` so installed copies update.
- Data key in localStorage: `quicknotes.v1`.
- Browsers can clear site data, so use **Backup** now and then.
- `localStorage` is plenty for text notes (about 5 MB). If you later want images or huge
  notes, switch the storage layer in `app.js` (`load` / `persist`) to IndexedDB.
