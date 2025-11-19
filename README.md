# Knotz Raven Mayhem 🎮

## Game Description
Knotz Raven Mayhem is an action-packed canvas-based shooter game built with vanilla JavaScript. Test your reflexes as you battle waves of increasingly challenging ravens! Click to destroy them with explosive effects, build massive combos, collect power-ups, and climb the leaderboard to become the ultimate Raven Hunter!

## 🎯 How to Play
- **Click on ravens** to destroy them and earn points
- **Build combos** by hitting ravens in quick succession (2-second window)
- **Collect power-ups** dropped by destroyed ravens
- **Survive** - You have 3 lives. Lose a life when a raven escapes!
- **Beat your high score** - Your best score is saved automatically
- **Press SPACEBAR** to pause/resume the game
- **Press ESC** while paused to quit to game over screen

## 🆕 New Features (v2.0)

### 1. ❤️ Lives System
- Start with **3 lives** instead of instant game over
- Visual heart display in the top-right corner
- Lose a life when a raven escapes off the left side
- Game over when all lives are depleted

### 2. 🔥 Combo Multiplier System
- Hit ravens consecutively to build combos!
- Combo timer: **2 seconds** to keep your streak alive
- Multipliers: **1x → 2x → 3x → 4x → 5x** (max)
- Visual combo counter with animated timer bar
- Miss a click or run out of time? Combo resets!

### 3. ⚡ Power-Up System
- **15% chance** for ravens to drop power-ups when destroyed
- **4 Power-Up Types:**
  - **⏱ Slow-Mo** - Slows down all ravens for 5 seconds
  - **✸ Multi-Shot** - Each click destroys nearby ravens (200px radius)
  - **★ Score Boost** - Double all points earned for 5 seconds
  - **♥ Extra Life** - Instantly gain +1 life (max 5)
- Power-ups float downward - click to collect them!
- Active power-ups shown at bottom-left with timer bars

### 4. 📈 Progressive Difficulty
- Difficulty increases every **10 points**
- Ravens get **15% faster** each level
- Spawn rate increases (500ms → 200ms minimum)
- **"DIFFICULTY UP!"** notification when leveling up
- Current level displayed on screen

### 5. 🦅 Special Enemy Types

| Type | Speed | Points | Health | Special Ability |
|------|-------|--------|--------|-----------------|
| **Normal** | 1x | 1 | 1 | Standard raven |
| **🔷 Fast** | 2x | 2 | 1 | Cyan tint, moves quickly |
| **⭐ Golden** | 0.8x | 5 | 1 | Gold tint, high value! |
| **⬛ Armored** | 0.9x | 3 | 2 | Silver tint, requires 2 hits |
| **🔸 Mini** | 1.5x | 3 | 1 | Purple tint, tiny & hard to hit |

- Armored ravens show **health bars** after first hit
- Special ravens have **colored overlays** and visual indicators
- Particle trails now match raven type colors

### 6. 💾 High Score System
- Best score **automatically saved** using LocalStorage
- Persistent across browser sessions
- **"NEW HIGH SCORE!"** celebration on game over
- High score displayed in top-right corner

### 7. ✨ Enhanced Visual Feedback
- **Floating score text** shows points earned (+combo multiplier)
- **"MISSED!"** warning when ravens escape
- **Difficulty level-up** notifications
- **Power-up activation** announcements
- Animated combo display with gradient text
- Glowing power-up effects with rotation
- Smooth fade-out animations

### 8. ⏸️ Pause System
- **Press SPACEBAR** to pause/resume gameplay
- Beautiful pause overlay with semi-transparent background
- View current stats while paused (score, level, accuracy, combo)
- **Press ESC** while paused to quit to game over
- Game freezes completely - no updates while paused
- Resume exactly where you left off

### 9. 📊 Live Stats Tracking
- **Real-time statistics** displayed on screen during gameplay
- **Accuracy percentage** - tracks hits vs total shots fired
- **Ravens killed** - total enemy count
- **Best combo** - highest combo multiplier achieved
- **Shots tracking** - hits/total shots ratio
- Stats panel with dark background overlay
- Final stats shown on game over screen

### 10. 💥 Screen Shake & Juice Effects
- **Dynamic camera shake** adds impact to gameplay
- Different shake intensities for different events:
  - **Golden ravens**: Intense shake (15px)
  - **Armored ravens**: Heavy shake (12px)
  - **Normal kills**: Standard shake (8px)
  - **Life lost**: Major shake (20px)
  - **Difficulty up**: Strong shake (15px)
  - **High combos**: Escalating shake (3x+ combo)
- 200ms shake duration for snappy feel
- Configurable intensity and duration in CONFIG

## 🎮 Gameplay Elements

### Ravens
Ravens spawn from the right side and fly left across the screen. They vary in:
- **Size:** Random scaling (0.4x - 1.0x base size)
- **Speed:** Affected by type and difficulty level
- **Type:** 5 different types with unique properties
- **Trails:** 50% chance for particle trails
- **Bouncing:** Bounce off top/bottom screen edges

### Scoring System
- **Base Points:** Determined by raven type (1-5 points)
- **Combo Multiplier:** Up to 5x bonus
- **Power-Up Boost:** 2x with Score Boost active
- **Example:** Golden raven (5 pts) × 5x combo × 2x boost = **50 points!**

### Power-Ups
Collectible boxes drop from destroyed ravens. Each type has:
- **Unique color and icon**
- **Floating animation** with sine wave motion
- **Rotation effect** for visual appeal
- **5-second duration** (except Extra Life)
- **Warning flash** when about to expire

### Lives & Game Over
- **3 starting lives** (represented by hearts)
- Empty hearts show lost lives
- Game ends at 0 lives
- **Click to restart** after game over
- All stats reset except high score

## 🛠️ Technical Features

### Architecture
- **Dual Canvas System:** Separate canvases for rendering and collision detection
- **Pixel-Perfect Collision:** RGB color matching for accurate hit detection
- **Delta Time Animation:** Frame-rate independent for smooth gameplay
- **Object-Oriented Design:** Modular classes for all game entities
- **Configuration Object:** Easy difficulty tuning via CONFIG

### Performance
- Efficient entity cleanup with "marked for deletion" pattern
- Optimized rendering order (smaller ravens drawn last)
- Smooth animations using requestAnimationFrame
- No external dependencies - pure vanilla JavaScript!

## 📁 Assets
This game requires the following assets (all included):
1. **raven.png** - Raven sprite sheet (271×194, 5 frames)
2. **boom.png** - Explosion sprite sheet (200×179, 6 frames)
3. **boom.wav** - Explosion sound effect

## 🚀 How to Run

### Local Development
```bash
# Option 1: Python HTTP Server
python3 -m http.server 8000

# Option 2: Node.js HTTP Server
npx http-server

# Option 3: VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

Then open: `http://localhost:8000`

### No Build Required
Pure vanilla JavaScript - just open `index.html` in a modern browser!

## 🎓 Game Tips

1. **Master the Combo** - Keep your combo alive for maximum points!
2. **Prioritize Golden Ravens** - 5x points are worth the risk
3. **Use Slow-Mo Wisely** - Great for building combos on fast ravens
4. **Collect Power-Ups Quickly** - They fall off-screen fast!
5. **Watch Your Lives** - Don't get greedy chasing high-value targets
6. **Multi-Shot Synergy** - Combine with high combos for massive points
7. **Focus on Mini Ravens Early** - Harder to hit at higher speeds
8. **Pause for Strategy** - Use SPACEBAR to pause and plan your next move
9. **Track Your Accuracy** - Check the stats panel to improve your precision
10. **Feel the Shake** - Screen shake intensity tells you the value of your hits!

## 📊 Difficulty Progression

| Level | Speed Mult. | Spawn Rate | Score Needed |
|-------|-------------|------------|--------------|
| 1 | 1.0x | 500ms | 0 |
| 2 | 1.15x | 450ms | 10 |
| 3 | 1.30x | 400ms | 20 |
| 5 | 1.60x | 300ms | 40 |
| 10 | 2.35x | 200ms | 90 |

## 🏆 Achievement Ideas
- **First Blood:** Destroy your first raven
- **Combo Master:** Reach 5x combo multiplier
- **Golden Hunter:** Destroy 10 golden ravens
- **Tank Buster:** Destroy 5 armored ravens
- **Sniper:** Destroy 10 mini ravens
- **Survivor:** Reach level 10
- **Centurion:** Score 100 points
- **Immortal:** Complete a run without losing a life

## 📝 Changelog

### Version 2.1 (2025-11-19) - Polish & Enhancement Update
**New Features:**
- ⏸️ **Pause System** - SPACEBAR to pause/resume, ESC to quit while paused
- 📊 **Live Stats Tracking** - Real-time accuracy, kills, best combo on-screen
- 💥 **Screen Shake Effects** - Dynamic camera shake for impactful gameplay
- Stats panel with semi-transparent background
- Comprehensive pause overlay showing current stats
- Final stats display on game over screen

**Bug Fixes:**
- 🐛 **Fixed Slow-Mo consistency** - Now affects ALL ravens on screen, not just new spawns
- 🐛 **Fixed restart bug** - lastTime now properly resets (prevented negative deltatime)
- 🐛 **Fixed pause state** - isPaused now fully functional with keyboard controls

**Improvements:**
- Screen shake intensity varies by event type (kills, combos, damage)
- Added keyboard controls (SPACEBAR, ESC)
- Enhanced combo system triggers screen shake at 3x+
- Better game state management with resetGame() function
- Improved code organization and comments

### Version 2.0 (2025-11-19) - Major Feature Update
- ✅ Added lives system (3 hearts)
- ✅ Implemented combo multiplier with visual feedback
- ✅ Created 4-type power-up system
- ✅ Added 5 special enemy types
- ✅ Progressive difficulty scaling
- ✅ High score persistence (LocalStorage)
- ✅ Floating text notifications
- ✅ Enhanced visual effects and polish
- ✅ Click-to-restart functionality
- ✅ Fixed deltatime typo from original code

### Version 1.0 (Original)
- Basic raven spawning and destruction
- Explosion effects and sounds
- Particle trail system
- Dual canvas collision detection
- Score tracking

## ⌨️ Controls
- **Left Click** - Shoot ravens / Collect power-ups / Restart after game over
- **SPACEBAR** - Pause/Resume game
- **ESC** - Quit to game over (while paused)

## 🔧 Configuration
Want to tweak the game? Edit the `CONFIG` object in `script.js`:

```javascript
const CONFIG = {
    INITIAL_LIVES: 3,               // Starting lives
    COMBO_WINDOW: 2000,             // Combo timer (ms)
    COMBO_MULTIPLIERS: [1,2,3,4,5], // Combo levels
    POWERUP_DROP_CHANCE: 0.15,      // 15% drop rate
    POWERUP_DURATION: 5000,         // 5 seconds (powerups)
    SLOWMO_MULTIPLIER: 0.4,         // Slow-mo speed (40%)
    SCREEN_SHAKE_DURATION: 200,     // Shake duration (ms)
    SCREEN_SHAKE_INTENSITY: 10,     // Shake intensity (pixels)
    DIFFICULTY_SCORE_THRESHOLD: 10, // Points per level
    // ... and more!
};
```

## 🤝 Contributing
This is an educational project showcasing canvas game development. Feel free to fork and experiment!

## 📄 License
Open source - feel free to learn from and build upon this code!

---

**Developed with passion for game development** 🎮✨

*Challenge yourself and beat your high score!*
