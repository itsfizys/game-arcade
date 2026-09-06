# Game Arcade

This is a bullshit project I made to test AI.

Game Arcade is a browser-based mini arcade with three short, replayable games:

- **Rapid Roll**: react to the active lane and build a streak.
- **Snake**: collect food, grow longer, and avoid the walls and your tail.
- **Alien Attack**: move the ship, shoot aliens, and use limited blast charges.
- **Dino Run**: tap to jump over cacti as the desert run gets faster.

## Features

- Three games in one arcade interface
- Keyboard and touch-friendly controls
- Progressive rounds, waves, levels, and scoring
- Local best scores saved in the browser
- Pause, restart, replay, and game-over states
- Optional sound effects
- Touch-first tap-to-jump controls for Dino Run with no gameplay button rail
- Responsive desktop and mobile layout
- No backend, account system, database, or external API

## Tech Stack

- React
- TypeScript
- Vite
- CSS
- pnpm

## Run Locally

Requirements:

- Node.js 20 or newer
- pnpm 9 or newer

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/game-arcade run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Controls

### Rapid Roll

- `A`, `S`, `D`, and `F` select lanes
- Use the four on-screen lane buttons

### Snake

- `W`, `A`, `S`, and `D` or the arrow keys move the snake
- Use the four on-screen direction buttons

### Alien Attack

- `A` and `D` or the left and right arrow keys move the ship
- `Z` or `Space` fires
- `X` uses a blast charge
- `P` pauses or resumes
- Use the four on-screen action buttons

### Dino Run

- Tap or click the playfield to start, jump, resume, or replay
- `Space` or `↑` jumps
- `P` pauses or resumes

## Build

```bash
pnpm run typecheck
pnpm run build
```

The production files are generated in `public`.

## Data

The games run entirely in the browser. Best scores are stored in local storage and no gameplay data is sent to a server.

## License

MIT