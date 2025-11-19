// ==================== CANVAS SETUP ====================
const canvas = document.getElementById('canvas1');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const collisionCanvas = document.getElementById('collisionCanvas');
const collisionCtx = collisionCanvas.getContext('2d', { willReadFrequently: true });
collisionCanvas.width = window.innerWidth;
collisionCanvas.height = window.innerHeight;

// ==================== GAME CONFIGURATION ====================
const CONFIG = {
    INITIAL_LIVES: 3,
    INITIAL_RAVEN_INTERVAL: 500,
    INITIAL_RAVEN_SPEED: { min: 3, max: 5 },
    DIFFICULTY_SCORE_THRESHOLD: 10,
    COMBO_WINDOW: 2000, // 2 seconds to maintain combo
    COMBO_MULTIPLIERS: [1, 2, 3, 4, 5], // max 5x multiplier
    POWERUP_DROP_CHANCE: 0.15, // 15% chance on raven kill
    POWERUP_DURATION: 5000, // 5 seconds
    SLOWMO_MULTIPLIER: 0.4, // Slow down to 40% speed
    SCREEN_SHAKE_DURATION: 200, // milliseconds
    SCREEN_SHAKE_INTENSITY: 10, // pixels
    TIME_FREEZE_DURATION: 150, // milliseconds for dramatic effect
    TIME_FREEZE_SLOWDOWN: 0.2, // 20% speed during freeze
    CLICK_RIPPLE_DURATION: 400, // milliseconds
    PARTICLE_BURST_COUNT: 15, // particles per burst
    RAVEN_TYPES: {
        NORMAL: { weight: 0.6, speed: 1, points: 1, health: 1, color: null },
        FAST: { weight: 0.2, speed: 2, points: 2, health: 1, color: 'cyan' },
        GOLDEN: { weight: 0.05, speed: 0.8, points: 5, health: 1, color: 'gold' },
        ARMORED: { weight: 0.1, speed: 0.9, points: 3, health: 2, color: 'silver' },
        MINI: { weight: 0.05, speed: 1.5, points: 3, health: 1, color: 'purple' }
    }
};

// ==================== GAME STATE ====================
const gameState = {
    score: 0,
    lives: CONFIG.INITIAL_LIVES,
    gameOver: false,
    difficultyLevel: 1,
    ravenInterval: CONFIG.INITIAL_RAVEN_INTERVAL,
    ravenSpeedMultiplier: 1,
    combo: 0,
    comboTimer: 0,
    comboMultiplier: 1,
    activePowerups: new Map(), // powerup type -> expiry timestamp
    highScore: 0,
    isPaused: false,
    // Stats tracking
    stats: {
        shotsFired: 0,
        hits: 0,
        misses: 0,
        ravensKilled: 0,
        bestCombo: 0,
        accuracy: 0
    },
    // Screen shake
    screenShake: {
        active: false,
        duration: 0,
        intensity: 0
    },
    // Time freeze effect
    timeFreeze: {
        active: false,
        duration: 0
    }
};

// ==================== ARRAYS ====================
let ravens = [];
let explosions = [];
let particles = [];
let powerups = [];
let floatingTexts = [];
let clickRipples = [];
let particleBursts = [];

// ==================== TIME MANAGEMENT ====================
let timeToNextRaven = 0;
let lastTime = 0;

// ==================== AUDIO SYSTEM ====================
const sounds = {
    explosion: { src: 'boom.wav', volume: 0.3 },
    // These sounds would be added if you have the audio files
    combo: { src: 'combo.wav', volume: 0.4, fallback: true },
    powerup: { src: 'powerup.wav', volume: 0.5, fallback: true },
    levelUp: { src: 'levelup.wav', volume: 0.6, fallback: true },
    click: { src: 'click.wav', volume: 0.2, fallback: true }
};

function playSound(soundName) {
    try {
        const soundConfig = sounds[soundName];
        if (!soundConfig) return;

        // Skip if it's a fallback sound and file doesn't exist
        if (soundConfig.fallback) return;

        const sound = new Audio();
        sound.src = soundConfig.src;
        sound.volume = soundConfig.volume || 0.5;
        sound.play().catch(() => {}); // Silently fail if sound doesn't exist
    } catch (e) {
        // Silently handle audio errors
    }
}

// ==================== UTILITY FUNCTIONS ====================
function getRandomRavenType() {
    const rand = Math.random();
    let cumulative = 0;
    for (const [type, props] of Object.entries(CONFIG.RAVEN_TYPES)) {
        cumulative += props.weight;
        if (rand < cumulative) return type;
    }
    return 'NORMAL';
}

function loadHighScore() {
    const saved = localStorage.getItem('ravenMayhemHighScore');
    gameState.highScore = saved ? parseInt(saved) : 0;
}

function saveHighScore() {
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('ravenMayhemHighScore', gameState.highScore);
    }
}

function updateCombo(deltatime) {
    if (gameState.combo > 0) {
        gameState.comboTimer -= deltatime;
        if (gameState.comboTimer <= 0) {
            gameState.combo = 0;
            gameState.comboMultiplier = 1;
        }
    }
}

function addCombo() {
    gameState.combo++;
    gameState.comboTimer = CONFIG.COMBO_WINDOW;
    const comboIndex = Math.min(gameState.combo - 1, CONFIG.COMBO_MULTIPLIERS.length - 1);
    gameState.comboMultiplier = CONFIG.COMBO_MULTIPLIERS[comboIndex];

    // Track best combo
    if (gameState.combo > gameState.stats.bestCombo) {
        gameState.stats.bestCombo = gameState.combo;
    }

    // Screen shake on high combos
    if (gameState.combo >= 3) {
        activateScreenShake(CONFIG.SCREEN_SHAKE_INTENSITY * (gameState.combo / 3));
    }

    // Combo sound effect
    if (gameState.combo >= 2) {
        playSound('combo');
    }
}

function resetCombo() {
    gameState.combo = 0;
    gameState.comboMultiplier = 1;
    gameState.comboTimer = 0;
}

function updateDifficulty() {
    const newLevel = Math.floor(gameState.score / CONFIG.DIFFICULTY_SCORE_THRESHOLD) + 1;
    if (newLevel > gameState.difficultyLevel) {
        gameState.difficultyLevel = newLevel;
        gameState.ravenSpeedMultiplier = 1 + (newLevel - 1) * 0.15;
        gameState.ravenInterval = Math.max(200, CONFIG.INITIAL_RAVEN_INTERVAL - (newLevel - 1) * 50);
        floatingTexts.push(new FloatingText(canvas.width / 2, canvas.height / 2, 'DIFFICULTY UP!', 'red', 2000));
        activateScreenShake(15);
        playSound('levelUp');

        // Particle burst on level up
        createParticleBurst(canvas.width / 2, canvas.height / 2, 'red', 20);
    }
}

function activatePowerup(type) {
    const expiryTime = Date.now() + CONFIG.POWERUP_DURATION;
    gameState.activePowerups.set(type, expiryTime);
    floatingTexts.push(new FloatingText(canvas.width / 2, 100, type.toUpperCase() + '!', 'yellow', 1500));
    playSound('powerup');
}

function updatePowerups() {
    const now = Date.now();
    for (const [type, expiry] of gameState.activePowerups.entries()) {
        if (now > expiry) {
            gameState.activePowerups.delete(type);
        }
    }
}

function isPowerupActive(type) {
    return gameState.activePowerups.has(type);
}

function activateScreenShake(intensity = CONFIG.SCREEN_SHAKE_INTENSITY) {
    gameState.screenShake.active = true;
    gameState.screenShake.duration = CONFIG.SCREEN_SHAKE_DURATION;
    gameState.screenShake.intensity = intensity;
}

function updateScreenShake(deltatime) {
    if (gameState.screenShake.active) {
        gameState.screenShake.duration -= deltatime;
        if (gameState.screenShake.duration <= 0) {
            gameState.screenShake.active = false;
            gameState.screenShake.intensity = 0;
        }
    }
}

function applyScreenShake() {
    if (gameState.screenShake.active) {
        const x = (Math.random() - 0.5) * gameState.screenShake.intensity;
        const y = (Math.random() - 0.5) * gameState.screenShake.intensity;
        ctx.translate(x, y);
        return { x, y };
    }
    return { x: 0, y: 0 };
}

function activateTimeFreeze() {
    gameState.timeFreeze.active = true;
    gameState.timeFreeze.duration = CONFIG.TIME_FREEZE_DURATION;
}

function updateTimeFreeze(deltatime) {
    if (gameState.timeFreeze.active) {
        gameState.timeFreeze.duration -= deltatime;
        if (gameState.timeFreeze.duration <= 0) {
            gameState.timeFreeze.active = false;
        }
    }
}

function getTimeScale() {
    if (gameState.timeFreeze.active) {
        return CONFIG.TIME_FREEZE_SLOWDOWN;
    }
    return 1.0;
}

function updateStats() {
    if (gameState.stats.shotsFired > 0) {
        gameState.stats.accuracy = Math.round((gameState.stats.hits / gameState.stats.shotsFired) * 100);
    }
}

function togglePause() {
    gameState.isPaused = !gameState.isPaused;
}

function createClickRipple(x, y, color = 'rgba(255, 255, 255, 0.8)') {
    clickRipples.push(new ClickRipple(x, y, color));
}

function createParticleBurst(x, y, color, count = CONFIG.PARTICLE_BURST_COUNT) {
    for (let i = 0; i < count; i++) {
        particleBursts.push(new BurstParticle(x, y, color));
    }
}

function resetGame() {
    gameState.score = 0;
    gameState.lives = CONFIG.INITIAL_LIVES;
    gameState.gameOver = false;
    gameState.difficultyLevel = 1;
    gameState.ravenInterval = CONFIG.INITIAL_RAVEN_INTERVAL;
    gameState.ravenSpeedMultiplier = 1;
    gameState.isPaused = false;
    resetCombo();
    gameState.activePowerups.clear();
    gameState.stats = {
        shotsFired: 0,
        hits: 0,
        misses: 0,
        ravensKilled: 0,
        bestCombo: 0,
        accuracy: 0
    };
    gameState.screenShake = {
        active: false,
        duration: 0,
        intensity: 0
    };
    gameState.timeFreeze = {
        active: false,
        duration: 0
    };
    ravens = [];
    explosions = [];
    particles = [];
    powerups = [];
    floatingTexts = [];
    clickRipples = [];
    particleBursts = [];
    lastTime = 0;
    timeToNextRaven = 0;
}

// ==================== CLICK RIPPLE CLASS ====================
class ClickRipple {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 0;
        this.maxRadius = 50;
        this.duration = CONFIG.CLICK_RIPPLE_DURATION;
        this.timer = 0;
        this.markedForDeletion = false;
    }

    update(deltatime) {
        this.timer += deltatime;
        this.radius = (this.timer / this.duration) * this.maxRadius;

        if (this.timer > this.duration) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.save();
        const alpha = 1 - (this.timer / this.duration);
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ripple
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ==================== BURST PARTICLE CLASS ====================
class BurstParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;

        // Random direction
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.velocityX = Math.cos(angle) * speed;
        this.velocityY = Math.sin(angle) * speed;

        this.radius = Math.random() * 3 + 2;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.01;
        this.gravity = 0.1;
        this.markedForDeletion = false;
    }

    update(deltatime) {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityY += this.gravity;
        this.velocityX *= 0.98; // Air resistance
        this.life -= this.decay;

        if (this.life <= 0) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        // Don't draw if life is depleted
        if (this.life <= 0) return;

        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;

        // Ensure radius is never negative
        const radius = Math.max(0, this.radius * this.life);

        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Glow effect
        ctx.globalAlpha = this.life * 0.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==================== FLOATING TEXT CLASS ====================
class FloatingText {
    constructor(x, y, text, color, duration) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.duration = duration;
        this.timer = 0;
        this.markedForDeletion = false;
        this.velocityY = -2;
        this.scale = 0.5; // Start small
        this.targetScale = 1.0;
    }

    update(deltatime) {
        this.timer += deltatime;
        this.y += this.velocityY;

        // Pop-in animation
        if (this.scale < this.targetScale) {
            this.scale += 0.05;
        }

        if (this.timer > this.duration) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = 1 - this.timer / this.duration;
        ctx.font = (40 * this.scale) + 'px Impact';
        ctx.textAlign = 'center';

        // Shadow
        ctx.fillStyle = 'black';
        ctx.fillText(this.text, this.x + 2, this.y + 2);

        // Main text
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// ==================== RAVEN CLASS (ENHANCED) ====================
class Raven {
    constructor() {
        this.spriteWidth = 271;
        this.spriteHeight = 194;

        // Determine raven type
        this.type = getRandomRavenType();
        this.typeProps = CONFIG.RAVEN_TYPES[this.type];

        // Size based on type
        let baseSizeModifier = Math.random() * 0.6 + 0.4;
        if (this.type === 'MINI') baseSizeModifier *= 0.5;
        if (this.type === 'ARMORED') baseSizeModifier *= 1.2;

        this.sizeModifier = baseSizeModifier;
        this.width = this.spriteWidth * this.sizeModifier;
        this.height = this.spriteHeight * this.sizeModifier;

        // Position
        this.x = canvas.width;
        this.y = Math.random() * (canvas.height - this.height);

        // Speed based on type and difficulty
        const baseSpeed = Math.random() * 2 + 3;
        this.baseDirectionX = baseSpeed * this.typeProps.speed * gameState.ravenSpeedMultiplier;
        this.baseDirectionY = Math.random() * 5 - 2.5;

        // Store base speeds for slow-mo calculations
        this.directionX = this.baseDirectionX;
        this.directionY = this.baseDirectionY;

        // Health system for armored ravens
        this.maxHealth = this.typeProps.health;
        this.health = this.maxHealth;

        this.markedForDeletion = false;
        this.image = new Image();
        this.image.src = 'raven.png';
        this.frame = 0;
        this.maxFrame = 4;
        this.timeSinceFlap = 0;
        this.flapInterval = Math.random() * 50 + 100;

        // Collision detection color
        this.randomColors = [
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255)
        ];
        this.color = 'rgb(' + this.randomColors[0] + ',' + this.randomColors[1] + ',' + this.randomColors[2] + ')';

        this.hasTrail = Math.random() > 0.5;
    }

    update(deltatime) {
        // Apply time scale
        const scaledDelta = deltatime * getTimeScale();

        // Apply slow-mo to existing ravens dynamically
        if (isPowerupActive('SLOWMO')) {
            this.directionX = this.baseDirectionX * CONFIG.SLOWMO_MULTIPLIER;
            this.directionY = this.baseDirectionY * CONFIG.SLOWMO_MULTIPLIER;
        } else {
            this.directionX = this.baseDirectionX;
            this.directionY = this.baseDirectionY;
        }

        // Bounce at screen edges
        if (this.y < 0 || this.y > canvas.height - this.height) {
            this.directionY = this.directionY * -1;
            this.baseDirectionY = this.baseDirectionY * -1;
        }

        this.x -= this.directionX * (scaledDelta / deltatime);
        this.y += this.directionY * (scaledDelta / deltatime);

        // Flapping animation
        this.timeSinceFlap += scaledDelta;
        if (this.timeSinceFlap > this.flapInterval) {
            if (this.frame > this.maxFrame) this.frame = 0;
            else this.frame++;
            this.timeSinceFlap = 0;

            // Particle trail
            if (this.hasTrail) {
                for (let i = 0; i < 5; i++) {
                    const trailColor = this.typeProps.color || this.color;
                    particles.push(new Particle(this.x, this.y, this.width, trailColor));
                }
            }
        }

        // Check if escaped (lose life)
        if (this.x < 0 - this.width) {
            this.markedForDeletion = true;
            gameState.lives--;
            resetCombo();
            activateScreenShake(20);
            floatingTexts.push(new FloatingText(100, canvas.height - 100, 'MISSED!', 'red', 1000));
            if (gameState.lives <= 0) {
                gameState.gameOver = true;
                saveHighScore();
            }
        }
    }

    draw() {
        // Collision canvas
        collisionCtx.fillStyle = this.color;
        collisionCtx.fillRect(this.x, this.y, this.width, this.height);

        // Main canvas - tinted based on type
        ctx.save();

        // Golden raven glow effect
        if (this.type === 'GOLDEN') {
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'gold';
        }

        if (this.typeProps.color && this.type !== 'NORMAL') {
            ctx.globalAlpha = 0.8;
            // Draw colored overlay for special ravens
            ctx.fillStyle = this.typeProps.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.globalAlpha = 1;
        }

        // Draw raven sprite
        ctx.drawImage(this.image, this.frame * this.spriteWidth, 0, this.spriteWidth,
            this.spriteHeight, this.x, this.y, this.width, this.height);

        // Draw health bar for armored ravens
        if (this.type === 'ARMORED' && this.health < this.maxHealth) {
            const barWidth = this.width;
            const barHeight = 5;
            const barX = this.x;
            const barY = this.y - 10;

            ctx.fillStyle = 'red';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = 'lime';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }

        // Type indicator
        if (this.type !== 'NORMAL') {
            ctx.font = '12px Impact';
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            const label = this.type === 'GOLDEN' ? '★' :
                          this.type === 'FAST' ? '»' :
                          this.type === 'ARMORED' ? '⬛' :
                          this.type === 'MINI' ? '•' : '';
            ctx.strokeText(label, this.x + this.width / 2, this.y + this.height / 2);
            ctx.fillText(label, this.x + this.width / 2, this.y + this.height / 2);
        }

        ctx.restore();
    }

    hit() {
        this.health--;
        if (this.health <= 0) {
            this.markedForDeletion = true;
            const points = this.typeProps.points * gameState.comboMultiplier;

            // Score boost powerup
            const finalPoints = isPowerupActive('SCOREBOOST') ? points * 2 : points;
            gameState.score += finalPoints;
            gameState.stats.ravensKilled++;

            addCombo();
            updateDifficulty();

            // Floating score text
            floatingTexts.push(new FloatingText(
                this.x + this.width / 2,
                this.y,
                '+' + finalPoints + (gameState.comboMultiplier > 1 ? ' x' + gameState.comboMultiplier : ''),
                this.typeProps.color || 'yellow',
                800
            ));

            explosions.push(new Explosion(this.x, this.y, this.width));

            // Particle burst on kill
            const burstColor = this.typeProps.color || 'orange';
            createParticleBurst(this.x + this.width / 2, this.y + this.height / 2, burstColor, 10);

            // Screen shake on kill (more intense for special ravens)
            const shakeIntensity = this.type === 'GOLDEN' ? 15 :
                                  this.type === 'ARMORED' ? 12 : 8;
            activateScreenShake(shakeIntensity);

            // Time freeze on golden raven kill
            if (this.type === 'GOLDEN') {
                activateTimeFreeze();
                createParticleBurst(this.x + this.width / 2, this.y + this.height / 2, 'gold', 25);
            }

            // Chance to drop powerup
            if (Math.random() < CONFIG.POWERUP_DROP_CHANCE) {
                powerups.push(new PowerUp(this.x + this.width / 2, this.y + this.height / 2));
            }
        } else {
            // Armored raven hit but not destroyed - visual feedback
            floatingTexts.push(new FloatingText(this.x + this.width / 2, this.y, 'HIT!', 'orange', 500));
            activateScreenShake(5);
            createParticleBurst(this.x + this.width / 2, this.y + this.height / 2, 'silver', 5);
        }
    }
}

// ==================== POWERUP CLASS ====================
class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 40;
        this.markedForDeletion = false;

        // Random powerup type
        const types = ['SLOWMO', 'MULTISHOT', 'SCOREBOOST', 'EXTRALIFE'];
        this.type = types[Math.floor(Math.random() * types.length)];

        // Collision color
        this.randomColors = [
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255)
        ];
        this.color = 'rgb(' + this.randomColors[0] + ',' + this.randomColors[1] + ',' + this.randomColors[2] + ')';

        // Movement
        this.directionY = 2;
        this.floatOffset = 0;
        this.floatSpeed = 0.05;

        // Visual
        this.rotation = 0;
        this.pulseScale = 1.0;
        this.pulseDirection = 1;
    }

    update(deltatime) {
        this.y += this.directionY;
        this.floatOffset += this.floatSpeed;
        this.rotation += 0.02;

        // Pulse animation
        this.pulseScale += 0.02 * this.pulseDirection;
        if (this.pulseScale > 1.2) this.pulseDirection = -1;
        if (this.pulseScale < 0.9) this.pulseDirection = 1;

        // Remove if off screen
        if (this.y > canvas.height) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        // Collision canvas
        collisionCtx.fillStyle = this.color;
        collisionCtx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);

        // Main canvas
        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(this.floatOffset) * 5);
        ctx.rotate(this.rotation);
        ctx.scale(this.pulseScale, this.pulseScale);

        // Glow effect
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.getTypeColor();

        // Draw powerup box
        ctx.fillStyle = this.getTypeColor();
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Draw icon
        ctx.font = '20px Impact';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.getTypeIcon(), 0, 0);

        ctx.restore();
    }

    getTypeColor() {
        switch (this.type) {
            case 'SLOWMO': return 'cyan';
            case 'MULTISHOT': return 'orange';
            case 'SCOREBOOST': return 'gold';
            case 'EXTRALIFE': return 'lime';
            default: return 'white';
        }
    }

    getTypeIcon() {
        switch (this.type) {
            case 'SLOWMO': return '⏱';
            case 'MULTISHOT': return '✸';
            case 'SCOREBOOST': return '★';
            case 'EXTRALIFE': return '♥';
            default: return '?';
        }
    }

    collect() {
        this.markedForDeletion = true;

        // Particle burst on collection
        createParticleBurst(this.x, this.y, this.getTypeColor(), 12);

        switch (this.type) {
            case 'SLOWMO':
            case 'MULTISHOT':
            case 'SCOREBOOST':
                activatePowerup(this.type);
                break;
            case 'EXTRALIFE':
                gameState.lives = Math.min(gameState.lives + 1, 5);
                floatingTexts.push(new FloatingText(canvas.width / 2, 100, '+1 LIFE!', 'lime', 1500));
                break;
        }
    }
}

// ==================== EXPLOSION CLASS ====================
class Explosion {
    constructor(x, y, size) {
        this.image = new Image();
        this.image.src = 'boom.png';
        this.spriteWidth = 200;
        this.spriteHeight = 179;
        this.size = size;
        this.x = x;
        this.y = y;
        this.frame = 0;
        this.sound = new Audio();
        this.sound.src = 'boom.wav';
        this.timeSinceLastFrame = 0;
        this.frameInterval = 200;
        this.markedForDeletion = false;
    }

    update(deltatime) {
        if (this.frame === 0) this.sound.play();
        this.timeSinceLastFrame += deltatime;
        if (this.timeSinceLastFrame > this.frameInterval) {
            this.frame++;
            this.timeSinceLastFrame = 0;
            if (this.frame > 5) this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.drawImage(this.image, this.frame * this.spriteWidth, 0, this.spriteWidth,
            this.spriteHeight, this.x, this.y - this.size / 4, this.size, this.size);
    }
}

// ==================== PARTICLE CLASS ====================
class Particle {
    constructor(x, y, size, color) {
        this.size = size;
        this.x = x + this.size / 2;
        this.y = y + this.size / 3;
        this.radius = Math.random() + this.size / 10;
        this.maxRadius = Math.random() * 20 + 35;
        this.markedForDeletion = false;
        this.speedX = Math.random() * 1 + 0.5;
        this.color = color;
    }

    update() {
        this.x += this.speedX;
        this.radius += 0.5;
        if (this.radius > this.maxRadius - 5) this.markedForDeletion = true;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = 1 - this.radius / this.maxRadius;
        ctx.beginPath();
        ctx.fillStyle = this.color;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==================== UI RENDERING ====================
function drawScore() {
    ctx.font = '50px Impact';
    ctx.fillStyle = 'black';
    ctx.fillText('Score: ' + gameState.score, 50, 83);
    ctx.fillStyle = 'white';
    ctx.fillText('Score: ' + gameState.score, 53, 78);
}

function drawLives() {
    const heartSize = 30;
    const startX = canvas.width - 200;
    const startY = 50;

    ctx.font = '40px Arial';

    // Pulse effect on low health
    const pulse = gameState.lives === 1 ? 1 + Math.sin(Date.now() / 200) * 0.1 : 1;

    for (let i = 0; i < gameState.lives; i++) {
        ctx.save();
        if (gameState.lives === 1) {
            ctx.translate(startX + i * heartSize, startY);
            ctx.scale(pulse, pulse);
            ctx.translate(-(startX + i * heartSize), -startY);
        }
        ctx.fillStyle = 'red';
        ctx.fillText('♥', startX + i * heartSize, startY);
        ctx.restore();
    }

    // Empty hearts for lost lives
    ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
    for (let i = gameState.lives; i < CONFIG.INITIAL_LIVES; i++) {
        ctx.fillText('♥', startX + i * heartSize, startY);
    }
}

function drawCombo() {
    if (gameState.combo > 1) {
        const x = canvas.width / 2;
        const y = 100;

        // Combo background
        ctx.save();

        // Pulse effect on high combos
        const pulse = gameState.combo >= 4 ? 1 + Math.sin(Date.now() / 100) * 0.05 : 1;
        ctx.translate(x, y);
        ctx.scale(pulse, pulse);
        ctx.translate(-x, -y);

        ctx.font = '60px Impact';
        ctx.textAlign = 'center';

        // Shadow
        ctx.fillStyle = 'black';
        ctx.fillText('COMBO x' + gameState.comboMultiplier, x + 3, y + 3);

        // Main text with gradient
        const gradient = ctx.createLinearGradient(x - 100, y - 30, x + 100, y + 30);
        gradient.addColorStop(0, 'yellow');
        gradient.addColorStop(0.5, 'orange');
        gradient.addColorStop(1, 'red');
        ctx.fillStyle = gradient;
        ctx.fillText('COMBO x' + gameState.comboMultiplier, x, y);

        // Timer bar
        const barWidth = 200;
        const barHeight = 10;
        const barX = x - barWidth / 2;
        const barY = y + 10;
        const fillWidth = (gameState.comboTimer / CONFIG.COMBO_WINDOW) * barWidth;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = 'yellow';
        ctx.fillRect(barX, barY, fillWidth, barHeight);

        ctx.restore();
    }
}

function drawDifficulty() {
    ctx.font = '20px Impact';
    ctx.fillStyle = 'black';
    ctx.fillText('Level: ' + gameState.difficultyLevel, 52, 123);
    ctx.fillStyle = 'cyan';
    ctx.fillText('Level: ' + gameState.difficultyLevel, 50, 120);
}

function drawActivePowerups() {
    const startY = canvas.height - 100;
    const iconSize = 40;
    let index = 0;

    const now = Date.now();
    for (const [type, expiry] of gameState.activePowerups.entries()) {
        const x = 50 + index * (iconSize + 10);
        const timeLeft = expiry - now;
        const alpha = timeLeft < 1000 ? 0.5 + 0.5 * Math.sin(Date.now() / 100) : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Powerup icon background
        let color;
        switch (type) {
            case 'SLOWMO': color = 'cyan'; break;
            case 'MULTISHOT': color = 'orange'; break;
            case 'SCOREBOOST': color = 'gold'; break;
            default: color = 'white';
        }

        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;

        ctx.fillStyle = color;
        ctx.fillRect(x, startY, iconSize, iconSize);

        // Icon
        ctx.font = '25px Impact';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = type === 'SLOWMO' ? '⏱' : type === 'MULTISHOT' ? '✸' : '★';
        ctx.fillText(icon, x + iconSize / 2, startY + iconSize / 2);

        // Timer bar
        const progress = timeLeft / CONFIG.POWERUP_DURATION;
        ctx.fillStyle = 'white';
        ctx.fillRect(x, startY + iconSize, iconSize * progress, 5);

        ctx.restore();
        index++;
    }
}

function drawHighScore() {
    ctx.font = '20px Impact';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'right';
    ctx.fillText('Best: ' + gameState.highScore, canvas.width - 52, 123);
    ctx.fillStyle = 'gold';
    ctx.fillText('Best: ' + gameState.highScore, canvas.width - 50, 120);
    ctx.textAlign = 'left';
}

function drawStats() {
    const x = 50;
    const y = 160;
    const lineHeight = 25;

    ctx.font = '18px Impact';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 5, y - 20, 200, 130);

    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.fillText('STATS', x, y);
    ctx.font = '14px Impact';
    ctx.fillText('Accuracy: ' + gameState.stats.accuracy + '%', x, y + lineHeight);
    ctx.fillText('Kills: ' + gameState.stats.ravensKilled, x, y + lineHeight * 2);
    ctx.fillText('Best Combo: ' + gameState.stats.bestCombo + 'x', x, y + lineHeight * 3);
    ctx.fillText('Hits: ' + gameState.stats.hits + '/' + gameState.stats.shotsFired, x, y + lineHeight * 4);
}

function drawPauseOverlay() {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pause text
    ctx.font = '100px Impact';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 50);

    // Instructions
    ctx.font = '30px Impact';
    ctx.fillStyle = 'yellow';
    ctx.fillText('Press SPACEBAR to resume', canvas.width / 2, canvas.height / 2 + 50);
    ctx.fillText('Press ESC to quit', canvas.width / 2, canvas.height / 2 + 100);

    // Show stats during pause
    ctx.font = '20px Impact';
    ctx.fillStyle = 'white';
    const statsY = canvas.height / 2 + 180;
    ctx.fillText('Current Stats:', canvas.width / 2, statsY);
    ctx.font = '18px Impact';
    ctx.fillText('Score: ' + gameState.score + ' | Level: ' + gameState.difficultyLevel, canvas.width / 2, statsY + 30);
    ctx.fillText('Accuracy: ' + gameState.stats.accuracy + '% | Best Combo: ' + gameState.stats.bestCombo + 'x', canvas.width / 2, statsY + 55);
    ctx.fillText('Ravens Killed: ' + gameState.stats.ravensKilled, canvas.width / 2, statsY + 80);
}

function drawGameOver() {
    ctx.textAlign = 'center';
    ctx.font = '80px Impact';

    // Game Over text
    ctx.fillStyle = 'black';
    ctx.fillText('GAME OVER', canvas.width / 2 + 4, canvas.height / 2 - 146);
    ctx.fillStyle = 'red';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 150);

    // Final score
    ctx.font = '40px Impact';
    ctx.fillStyle = 'black';
    ctx.fillText('Final Score: ' + gameState.score, canvas.width / 2 + 2, canvas.height / 2 - 78);
    ctx.fillStyle = 'white';
    ctx.fillText('Final Score: ' + gameState.score, canvas.width / 2, canvas.height / 2 - 80);

    // High score
    if (gameState.score >= gameState.highScore) {
        ctx.font = '30px Impact';
        ctx.fillStyle = 'gold';
        ctx.fillText('NEW HIGH SCORE!', canvas.width / 2, canvas.height / 2 - 30);
    } else {
        ctx.font = '25px Impact';
        ctx.fillStyle = 'gray';
        ctx.fillText('High Score: ' + gameState.highScore, canvas.width / 2, canvas.height / 2 - 40);
    }

    // Final stats
    ctx.font = '22px Impact';
    ctx.fillStyle = 'cyan';
    ctx.fillText('FINAL STATS', canvas.width / 2, canvas.height / 2 + 20);

    ctx.font = '18px Impact';
    ctx.fillStyle = 'white';
    ctx.fillText('Accuracy: ' + gameState.stats.accuracy + '%', canvas.width / 2, canvas.height / 2 + 50);
    ctx.fillText('Ravens Killed: ' + gameState.stats.ravensKilled, canvas.width / 2, canvas.height / 2 + 75);
    ctx.fillText('Best Combo: ' + gameState.stats.bestCombo + 'x', canvas.width / 2, canvas.height / 2 + 100);
    ctx.fillText('Shots: ' + gameState.stats.hits + '/' + gameState.stats.shotsFired, canvas.width / 2, canvas.height / 2 + 125);

    // Restart prompt
    ctx.font = '20px Impact';
    ctx.fillStyle = 'yellow';
    ctx.fillText('Click to restart', canvas.width / 2, canvas.height / 2 + 170);
}

// ==================== EVENT HANDLERS ====================
window.addEventListener('click', function(e) {
    if (gameState.gameOver) {
        resetGame();
        animate(0);
        return;
    }

    if (gameState.isPaused) return;

    const detectPixelColor = collisionCtx.getImageData(e.x, e.y, 1, 1);
    const pc = detectPixelColor.data;
    let hitSomething = false;

    // Track shot fired
    gameState.stats.shotsFired++;

    // Create click ripple
    createClickRipple(e.x, e.y);
    playSound('click');

    // Check raven hits
    ravens.forEach(raven => {
        if (raven.randomColors[0] === pc[0] &&
            raven.randomColors[1] === pc[1] &&
            raven.randomColors[2] === pc[2]) {
            raven.hit();
            hitSomething = true;
            gameState.stats.hits++;

            // Multi-shot powerup - hit nearby ravens
            if (isPowerupActive('MULTISHOT')) {
                ravens.forEach(otherRaven => {
                    if (otherRaven !== raven && !otherRaven.markedForDeletion) {
                        const dx = raven.x - otherRaven.x;
                        const dy = raven.y - otherRaven.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < 200) {
                            otherRaven.hit();
                            gameState.stats.hits++;
                        }
                    }
                });
            }
        }
    });

    // Check powerup collection
    powerups.forEach(powerup => {
        if (powerup.randomColors[0] === pc[0] &&
            powerup.randomColors[1] === pc[1] &&
            powerup.randomColors[2] === pc[2]) {
            powerup.collect();
            hitSomething = true;
        }
    });

    // Reset combo if missed click
    if (!hitSomething && ravens.length > 0) {
        resetCombo();
        gameState.stats.misses++;
        createClickRipple(e.x, e.y, 'rgba(255, 0, 0, 0.5)');
    }

    updateStats();
});

// Keyboard controls
window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        if (!gameState.gameOver) {
            togglePause();
        }
    }
    if (e.code === 'Escape') {
        if (gameState.isPaused) {
            gameState.gameOver = true;
            gameState.isPaused = false;
        }
    }
});

// ==================== MAIN GAME LOOP ====================
function animate(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    collisionCtx.clearRect(0, 0, canvas.width, canvas.height);

    let deltatime = timestamp - lastTime;
    lastTime = timestamp;

    // Apply screen shake
    ctx.save();
    const shakeOffset = applyScreenShake();

    if (gameState.isPaused) {
        // Draw everything frozen
        [...particles, ...ravens, ...explosions, ...powerups, ...floatingTexts, ...clickRipples, ...particleBursts].forEach(obj => obj.draw());
        drawScore();
        drawLives();
        drawCombo();
        drawDifficulty();
        drawActivePowerups();
        drawHighScore();
        drawStats();

        // Draw pause overlay
        ctx.restore();
        drawPauseOverlay();

        requestAnimationFrame(animate);
        return;
    }

    // Spawn ravens
    timeToNextRaven += deltatime;
    if (timeToNextRaven > gameState.ravenInterval) {
        ravens.push(new Raven());
        timeToNextRaven = 0;
        ravens.sort((a, b) => a.width - b.width);
    }

    // Update game state
    updateCombo(deltatime);
    updatePowerups();
    updateScreenShake(deltatime);
    updateTimeFreeze(deltatime);

    // Update all entities
    [...particles, ...ravens, ...explosions, ...powerups, ...floatingTexts, ...clickRipples, ...particleBursts].forEach(obj => obj.update(deltatime));

    // Draw all entities
    [...particles, ...ravens, ...explosions, ...powerups, ...floatingTexts, ...clickRipples, ...particleBursts].forEach(obj => obj.draw());

    // Clean up deleted entities
    ravens = ravens.filter(obj => !obj.markedForDeletion);
    explosions = explosions.filter(obj => !obj.markedForDeletion);
    particles = particles.filter(obj => !obj.markedForDeletion);
    powerups = powerups.filter(obj => !obj.markedForDeletion);
    floatingTexts = floatingTexts.filter(obj => !obj.markedForDeletion);
    clickRipples = clickRipples.filter(obj => !obj.markedForDeletion);
    particleBursts = particleBursts.filter(obj => !obj.markedForDeletion);

    // Draw UI
    drawScore();
    drawLives();
    drawCombo();
    drawDifficulty();
    drawActivePowerups();
    drawHighScore();
    drawStats();

    ctx.restore();

    if (!gameState.gameOver) {
        requestAnimationFrame(animate);
    } else {
        drawGameOver();
    }
}

// ==================== INITIALIZE AND START ====================
loadHighScore();
ctx.font = '50px Impact';
animate(0);
