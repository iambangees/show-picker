# Show Picker

**Swipe through shows. Save the good ones. Never lose your episode.**

A one-page TV show picker and watch tracker that runs entirely in your browser.

## What it does

- **Pick** — a swipeable deck of TV shows with real posters, ratings and short storylines. Drag (or tap ✕ / ♥) to pass or save. Filter by genre, undo the last swipe, and the deck keeps loading more shows as you go.
- **Search** — find any show by name and save it straight to your list.
- **My List** — everything you saved, grouped by **Watching / Want to watch / Finished**. For shows you're watching, set exactly where you stopped — **season and episode** — with steppers capped at the show's real season and episode counts.

## Data

Posters, storylines, ratings and episode counts come live from the [TVMaze](https://www.tvmaze.com) API — a free TV database that needs no account and no API key. Nothing is made up: if TVMaze has no poster or storyline for a show, the deck skips it.

**Shows only for now.** Movies live in a different database (TMDB, which needs a free API key) and can be added later.

## Privacy

Your list and your progress are stored only in your browser's local storage, on your device — the same pattern as Bet Diary. No account, no upload, no tracking.

## Tech

One static page (`site/index.html` + `site/app.js`), installable as a PWA. Data: `api.tvmaze.com` (`/shows`, `/search/shows`, `/shows/{id}/episodes`).

Live at: https://iambangees.github.io/show-picker/
