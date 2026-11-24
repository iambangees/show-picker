# Show Picker

**Swipe through shows and movies. Save the good ones. Never lose your episode.**

A one-page show & movie picker and watch tracker that runs entirely in your browser.

## What it does

- **Pick** — a swipeable deck with real posters, ratings and short storylines, with a **📺 Shows / 🎬 Movies** toggle. Drag (or tap ✕ / ♥) to pass or save. Filter by genre, undo the last swipe, and the deck keeps loading more titles as you go.
- **Search** — find any show or movie by name and save it straight to your list.
- **My List** — everything you saved, grouped by **Watching / Want to watch / Finished**. For shows you're watching, set exactly where you stopped — **season and episode** — with steppers capped at the show's real season and episode counts. Movies just track status (no episodes to count).

## Data

Show posters, storylines, ratings and episode counts come live from the [TVMaze](https://www.tvmaze.com) API — a free TV database that needs no account and no API key. Movies come from [TMDB](https://www.themoviedb.org) using a free read-only API key kept in `site/app.js` (a static site has no server to hide it in; the key is catalogue-read-only and can be regenerated in TMDB settings at any time). Nothing is made up: if a database has no poster or storyline for a title, the deck skips it.

*This product uses the TMDB API but is not endorsed or certified by TMDB.*

## Privacy

Your list and your progress are stored only in your browser's local storage, on your device — the same pattern as Bet Diary. No account, no upload, no tracking.

## Tech

One static page (`site/index.html` + `site/app.js`), installable as a PWA. Data: `api.tvmaze.com` (`/shows`, `/search/shows`, `/shows/{id}/episodes`) and `api.themoviedb.org/3` (`/discover/movie`, `/search/movie`). Saved entries are namespaced by source (`tv:` / `tm:` keys) so a show and a movie can never collide in the list.

Live at: https://iambangees.github.io/show-picker/
