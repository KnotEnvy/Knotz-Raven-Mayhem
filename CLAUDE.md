# CLAUDE.md - AI Assistant Guide for Knotz Raven Mayhem

## Project Overview

**Knotz Raven Mayhem** is a canvas-based interactive browser game built with vanilla JavaScript. Players click on flying ravens to destroy them with explosions, scoring points. The game ends when a raven escapes off the left side of the screen.

**Tech Stack:**
- Vanilla JavaScript (ES6+)
- HTML5 Canvas API
- CSS3
- No build tools or frameworks required

## Repository Structure

```
Knotz-Raven-Mayhem/
├── index.html          # Entry point - HTML structure
├── script.js           # Main game logic and classes
├── style.css           # Visual styling
├── README.md           # User-facing documentation
├── raven.png           # Raven sprite sheet (271x194, 5 frames)
├── boom.png            # Explosion sprite sheet (200x179, 6 frames)
├── boom.wav            # Explosion sound effect (primary)
├── boom.mp3            # Explosion sound effect (alternative)
└── CLAUDE.md           # This file - AI assistant guide
```

## Core Architecture

### Canvas System (Dual Canvas Approach)

The game uses **two layered canvases** for efficient collision detection:

1. **`canvas1`** (Display Canvas) - Visible to user, renders game graphics
2. **`collisionCanvas`** (Collision Canvas) - Hidden (opacity: 0), used for pixel-perfect collision detection

**Location:** `index.html:11-12`, `script.js:1-8`

**Key Concept:** Each raven has a unique RGB color drawn on the collision canvas. When the user clicks, the pixel color at the click position is read and matched against raven colors to determine hits.

### Game Classes

#### 1. Raven Class (`script.js:18-67`)

**Purpose:** Represents individual raven enemies

**Properties:**
- `spriteWidth`, `spriteHeight`: Base sprite dimensions (271x194)
- `sizeModifier`: Random scale factor (0.4-1.0)
- `x`, `y`: Position coordinates
- `directionX`, `directionY`: Movement vectors
- `frame`, `maxFrame`: Sprite animation (5 frames)
- `randomColors`: Unique RGB color for collision detection
- `hasTrail`: Boolean for particle trail effect (50% chance)
- `markedForDeletion`: Flag for cleanup

**Methods:**
- `update(deltatime)`: Updates position, animation frame, handles bouncing and trail particles
- `draw()`: Renders raven sprite on display canvas and collision rectangle on collision canvas

**Important Notes:**
- Ravens spawn from right edge (`x = canvas.width`)
- Game over triggers when raven reaches `x < 0 - this.width` (`script.js:60`)
- Vertical bouncing at screen edges (`script.js:43-45`)

#### 2. Explosion Class (`script.js:69-99`)

**Purpose:** Visual and audio feedback when raven is destroyed

**Properties:**
- `spriteWidth`, `spriteHeight`: Sprite dimensions (200x179)
- `frame`: Current animation frame (0-5)
- `frameInterval`: 200ms between frames
- `sound`: Audio object (boom.wav)

**Methods:**
- `update(deltatime)`: Advances animation, plays sound on first frame
- `draw()`: Renders explosion sprite

**Important Notes:**
- Sound plays automatically on frame 0 (`script.js:86`)
- Auto-deletes after 6 frames (`script.js:91`)

#### 3. Particle Class (`script.js:101-127`)

**Purpose:** Trail effect for some ravens

**Properties:**
- `radius`: Grows from initial to `maxRadius` (35-55)
- `speedX`: Horizontal drift (0.5-1.5)
- `color`: Inherits from parent raven

**Methods:**
- `update()`: Expands radius, moves horizontally
- `draw()`: Renders with fading alpha based on radius growth

**Important Notes:**
- Uses `ctx.globalAlpha` for fade effect (`script.js:119`)
- Only generated if `raven.hasTrail === true` (`script.js:54-58`)

### Game Loop & State Management

#### Main Game Loop: `animate(timestamp)` (`script.js:161-184`)

**Flow:**
1. Clear both canvases
2. Calculate `deltatime` for frame-rate independence
3. Spawn new ravens based on interval (500ms)
4. Sort ravens by width (smaller ravens drawn last, appear in front)
5. Update and draw all game objects (particles, ravens, explosions)
6. Filter out objects marked for deletion
7. Continue loop or show game over screen

**Key Variables:**
- `score`: Player's current score (global, `script.js:9`)
- `gameOver`: Boolean flag (global, `script.js:10`)
- `ravenInterval`: 500ms spawn rate (`script.js:14`)
- `ravens[]`, `explosions[]`, `particles[]`: Entity arrays

#### Collision Detection System (`script.js:145-158`)

**Mechanism:**
1. Click event captures mouse coordinates
2. `collisionCtx.getImageData(e.x, e.y, 1, 1)` reads pixel color at click position
3. Compare pixel RGB with each raven's unique `randomColors`
4. On match: mark raven for deletion, increment score, create explosion

**Important:** This is a **pixel-perfect** collision system, not bounding box collision.

## Development Workflows

### Running the Game

**No build step required** - This is pure vanilla JavaScript.

1. **Local Development:**
   ```bash
   # Option 1: Python HTTP server
   python3 -m http.server 8000

   # Option 2: Node.js http-server (if installed)
   npx http-server

   # Option 3: VS Code Live Server extension
   # Right-click index.html → "Open with Live Server"
   ```

2. **Open in browser:**
   ```
   http://localhost:8000
   ```

### Testing Workflow

**Manual Testing Checklist:**
- [ ] Ravens spawn at regular intervals
- [ ] Ravens fly from right to left
- [ ] Ravens bounce at top/bottom edges
- [ ] Click detection works accurately
- [ ] Explosions appear at correct positions
- [ ] Explosion sound plays
- [ ] Score increments on successful clicks
- [ ] Particle trails appear for ~50% of ravens
- [ ] Game over triggers when raven escapes left
- [ ] Game over screen displays final score

**No automated tests exist** - All testing is currently manual.

### Code Style & Conventions

#### Naming Conventions
- **Classes:** PascalCase (`Raven`, `Explosion`, `Particle`)
- **Functions:** camelCase (`drawScore`, `drawGameOver`, `animate`)
- **Variables:** camelCase (`gameOver`, `timeToNextRaven`, `deltatime`)
- **Constants:** Currently no constants use UPPER_SNAKE_CASE (consider refactoring)

#### Code Organization
- All game logic in single `script.js` file
- Classes defined before functions
- Global variables declared at top
- Event listeners before main game loop
- `animate()` function as entry point (called at end)

#### Canvas Context Usage
- **Display rendering:** Use `ctx` (canvas1 context)
- **Collision detection:** Use `collisionCtx` (collisionCanvas context)
- Always clear both canvases each frame

## Key Conventions for AI Assistants

### When Modifying Game Logic

1. **Preserve Dual Canvas System**
   - Never remove the collision canvas
   - Maintain unique colors for each raven
   - Keep collision canvas hidden (`opacity: 0` in CSS)

2. **Deltatime-Based Updates**
   - All animations/movements must use `deltatime` parameter
   - Ensures frame-rate independence
   - Example: `script.js:42,49,85`

3. **Marked for Deletion Pattern**
   - Never directly remove objects from arrays during iteration
   - Set `markedForDeletion = true`
   - Filter arrays after all updates (`script.js:177-179`)

4. **Sprite Sheet Handling**
   - Ravens: 5 frames (0-4), horizontal strip
   - Explosions: 6 frames (0-5), horizontal strip
   - Frame calculation: `frame * spriteWidth` for x-offset

### When Adding New Features

**Common Feature Requests:**

1. **Power-ups/Bonuses:**
   - Create new class similar to `Raven`
   - Add to separate array
   - Include in `animate()` update/draw loops
   - Assign unique collision color

2. **Difficulty Progression:**
   - Decrease `ravenInterval` over time
   - Increase `directionX` speed
   - Consider adding to `score` calculation

3. **Lives System:**
   - Change `gameOver` to lives counter
   - Decrement on raven escape
   - Game over when lives === 0
   - Update `drawGameOver()` to show lives

4. **Sound Toggle:**
   - Add global `soundEnabled` boolean
   - Check before `this.sound.play()` in Explosion
   - Add UI button in HTML

### Asset Requirements

**When replacing or adding assets:**

- **Raven sprite sheet:** Must be horizontal strip, update `spriteWidth`, `spriteHeight`, `maxFrame`
- **Explosion sprite sheet:** Same requirements as raven
- **Audio formats:** Prefer .wav for compatibility, .mp3 as fallback
- **File naming:** Currently hardcoded in classes - must match exact filenames

### Performance Considerations

1. **Particle Management:**
   - Particles are created frequently (5 per flap for trailing ravens)
   - Monitor `particles.length` - consider max cap if performance issues

2. **Audio Object Creation:**
   - Each explosion creates new Audio object
   - For many simultaneous explosions, consider audio pooling

3. **Canvas Clearing:**
   - Both canvases cleared every frame
   - Necessary for proper rendering, don't optimize away

### Common Pitfalls

1. **Global Variable Pollution:**
   - Many globals in current implementation
   - Consider refactoring to game state object for large changes

2. **Missing `let`/`const`:**
   - `gameOver` missing declaration keyword (`script.js:10`)
   - Always use `let` or `const`

3. **Typo in Parameter:**
   - `update(detlatime)` should be `update(deltatime)` (`script.js:42`)
   - This typo exists in Raven class

4. **Hard-coded Magic Numbers:**
   - Many magic numbers (500, 271, 194, etc.)
   - Consider extracting to configuration object

## Git Workflow

### Branch Strategy
- **Main branch:** Production-ready code
- **Feature branches:** `claude/[session-id]` for AI assistant work
- Always develop on designated feature branch

### Commit Guidelines

**Commit message format:**
```
<type>: <description>

[optional body]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `style`: Formatting, CSS changes
- `docs`: Documentation updates
- `asset`: Asset additions/modifications

**Examples:**
```
feat: add lives system with heart icons
fix: correct deltatime typo in Raven.update()
refactor: extract magic numbers to config object
asset: update raven sprite with new animation frames
docs: update README with new controls
```

### Pre-commit Checks

Before committing:
1. Test game in browser
2. Check console for errors
3. Verify all assets load correctly
4. Test on different screen sizes (responsive canvas)

## Future Improvements & Technical Debt

### Known Issues

1. **Typo:** `detlatime` in `Raven.update()` (`script.js:42`)
2. **Missing declaration:** `gameOver` should use `let` (`script.js:10`)
3. **Unused asset:** `boom.mp3` exists but never used

### Suggested Refactors

1. **Configuration Object:**
   ```javascript
   const CONFIG = {
     RAVEN_INTERVAL: 500,
     RAVEN_SPRITE: { width: 271, height: 194, frames: 5 },
     EXPLOSION_SPRITE: { width: 200, height: 179, frames: 6 },
     // ... etc
   };
   ```

2. **Game State Object:**
   ```javascript
   const gameState = {
     score: 0,
     gameOver: false,
     isPaused: false,
     ravens: [],
     explosions: [],
     particles: []
   };
   ```

3. **Separate Files:**
   - `classes/Raven.js`
   - `classes/Explosion.js`
   - `classes/Particle.js`
   - `game.js` (main logic)
   - Requires adding module system or build tool

### Enhancement Ideas

- **Mobile support:** Touch events instead of mouse clicks
- **Pause functionality:** Spacebar to pause/resume
- **High score:** LocalStorage for persistence
- **Sound effects:** Multiple raven sounds, background music
- **Visual effects:** Screen shake on explosion, combo multipliers
- **Accessibility:** Keyboard controls, color-blind mode

## Debugging Tips

### Common Issues

1. **Ravens not appearing:**
   - Check `raven.png` loads correctly (network tab)
   - Verify canvas dimensions match viewport
   - Check console for image load errors

2. **Clicks not registering:**
   - Verify collision canvas is same size as display canvas
   - Check `collisionCtx.getImageData()` for errors
   - Console log pixel colors and raven colors to compare

3. **Sound not playing:**
   - Check browser autoplay policies (may need user interaction first)
   - Verify `boom.wav` file exists and loads
   - Check Audio API compatibility

4. **Performance issues:**
   - Check particle count (`console.log(particles.length)`)
   - Monitor explosion audio objects (memory leak potential)
   - Use browser performance profiler

### Useful Console Commands

```javascript
// Check current game state
console.log({ score, gameOver, ravens: ravens.length, explosions: explosions.length, particles: particles.length });

// Force game over
gameOver = true;

// Clear all entities
ravens = [];
explosions = [];
particles = [];

// Spawn 10 ravens
for (let i = 0; i < 10; i++) ravens.push(new Raven());

// Make collision canvas visible (debug)
document.getElementById('collisionCanvas').style.opacity = 1;
```

## File-Specific Guidelines

### script.js
- **Line 1-16:** Setup and global variables
- **Line 18-67:** Raven class
- **Line 69-99:** Explosion class
- **Line 101-127:** Particle class
- **Line 129-142:** UI rendering functions
- **Line 145-158:** Click event handler (collision detection)
- **Line 161-184:** Main game loop

**When editing:** Test after every class modification to ensure game loop remains functional.

### index.html
- Minimal structure - only canvas elements
- Loads style.css and script.js
- No jQuery or external libraries
- Title: "KnotzBirdShot"

**When editing:** Maintain canvas order (collision canvas first for proper layering).

### style.css
- Gradient background: `linear-gradient(125deg, red, green, blue)`
- Full viewport canvases (100vw x 100vh)
- Absolute positioning for canvas overlap
- Hidden collision canvas via `opacity: 0`

**When editing:** Changing canvas positioning/sizing requires script.js coordinate adjustments.

## Quick Reference

### Important Functions & Their Purpose

| Function | Location | Purpose |
|----------|----------|---------|
| `animate()` | script.js:161 | Main game loop |
| `drawScore()` | script.js:129 | Renders score display |
| `drawGameOver()` | script.js:135 | Renders game over screen |
| Click handler | script.js:145 | Collision detection |

### Important Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `score` | Number | Current player score |
| `gameOver` | Boolean | Game state flag |
| `ravens` | Array | Active raven instances |
| `explosions` | Array | Active explosion instances |
| `particles` | Array | Active particle instances |
| `ravenInterval` | Number | Time between raven spawns (ms) |

### Canvas Contexts

| Context | Purpose | Visibility |
|---------|---------|------------|
| `ctx` | Display rendering | Visible |
| `collisionCtx` | Collision detection | Hidden |

---

**Last Updated:** 2025-11-19
**Maintained by:** AI Assistant (Claude)
**Project Version:** 1.0 (no versioning system currently)
