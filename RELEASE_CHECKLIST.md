# Release checklist

## Before pushing the source repository

- [ ] Review `LICENSE` and confirm that the repository's publisher can license all original source/artwork under MIT.
- [ ] Check `git status`; remove private drafts, font files, archives, API credentials, browser exports, and personal data.
- [ ] Run `npm test` and JavaScript syntax checks (`node --check` on app modules).
- [ ] Launch via localhost and manually test Chrome/Firefox/Edge as supported: create/open/rename/export files, markdown/HTML, CSS playground, JSON/CSV/SVG/media previews, JS OFF/ON isolation, autosave/reload, restore history, search/replace, snippets, theme/accent/appearance, font loader, keyboard navigation and screen sizes.
- [ ] Test offline reload after a successful online launch and confirm service-worker cache upgrades cleanly.
- [ ] Ensure the README accurately describes supported extensions, permissions, data locality and limits.
- [ ] Tag the release only after manual testing; attach a source ZIP and checksum to the release if desired.

## GitHub Pages

- [ ] Push the default branch to GitHub.
- [ ] In repository Settings → Pages, set Build and deployment to **GitHub Actions**.
- [ ] If the default branch isn't `main`, update `.github/workflows/pages.yml`.
- [ ] Confirm the deployed app works under a repository subpath (relative asset URLs and service-worker scope).
- [ ] Remember that GitHub Pages is public; do not include private user documents in the repository.

## F-Droid

- [ ] Read `F-DROID_PREPARATION.md` and the current F-Droid Inclusion Policy.
- [ ] Develop and test a native Android wrapper/project with a unique application ID, native value, source-based build recipe and verified asset licenses.
- [ ] Verify an F-Droid-compatible reproducible build before submitting. The current PWA project alone is not an F-Droid submission.
