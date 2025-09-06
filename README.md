# AI Dungeon Master (Browser, Plain JS)

A starter repo for the **AI Dungeon Master** concept running entirely in the browser with **vanilla JavaScript**. It includes:
- Fixed-step game loop
- Canvas 2D renderer
- Minimal player/enemy demo
- Web Worker–based replay simulation stubs
- Mutation & fitness stubs
- Full design doc in **DESIGN.md**

## Run
Any static file server works. for live-reload server on port 8000:

```bash
npm run dev
```

## Controls
- **WASD/Arrow keys**: move
- **Space**: dash
- **Click**: (placeholder) attack

Between rooms, the game spawns Web Workers to simulate replays and prints adaptation logs to console.
