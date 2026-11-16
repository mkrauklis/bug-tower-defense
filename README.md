# Bug Tower Defense

A 2D tower defense game: plants defend against waves of bugs.

## Tech stack

Plain HTML5 Canvas + vanilla JavaScript, no build step or dependencies. This
keeps the project simple to run (just open `index.html` or serve the folder
with any static file server) and easy to extend incrementally as the game
design comes together.

## Status

Baseline scaffold only: a canvas and a running game loop (`requestAnimationFrame`
with delta-time update/render). No plants, bugs, levels, or game design yet —
that comes next.

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```
npx serve .
```
