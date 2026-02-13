// PaintBall Slug - Enhanced Game Engine

// === SAVE DATA ===
function loadGameData() {
    try {
        const data = localStorage.getItem('paintballSlug_save');
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}
function saveGameData(data) {
    try { localStorage.setItem('paintballSlug_save', JSON.stringify(data)); } catch (e) {}
}
function getDefaultSaveData() {
    return {
        totalScore: 0,
        upgrades: { extraLife: false, doubleAmmo: false, startingShield: false, checkpointHeal: false },
        bestTimes: {},
        tutorialSeen: {}
    };
}

// === DIFFICULTY CONFIG ===
const DIFFICULTY = {
    easy:      { label: 'Easy',      damageMult: 0.5, ammoMult: 2,    trapSpeedMult: 0.5,  enemySpeedMult: 0.75, scoreMult: 0.5 },
    normal:    { label: 'Normal',    damageMult: 1,   ammoMult: 1,    trapSpeedMult: 1,    enemySpeedMult: 1,    scoreMult: 1 },
    hard:      { label: 'Hard',      damageMult: 1.5, ammoMult: 0.75, trapSpeedMult: 1.25, enemySpeedMult: 1.5,  scoreMult: 2 },
    challenge: { label: 'Challenge', damageMult: 2,   ammoMult: 0.5,  trapSpeedMult: 1.5,  enemySpeedMult: 1.5,  scoreMult: 3, noCheckpoints: true }
};

const SHOP_ITEMS = [
    { id: 'extraLife',      name: 'Extra Life',         desc: 'Start with +1 life',       price: 500 },
    { id: 'doubleAmmo',     name: 'Double Ammo',        desc: 'Start with 40 max ammo',   price: 800 },
    { id: 'startingShield', name: 'Starting Shield',    desc: '3s invincibility on start', price: 1000 },
    { id: 'checkpointHeal', name: 'Checkpoint Heal',    desc: '+1 HP at checkpoints',      price: 1200 }
];

// === GAME CLASS ===
class Game {
    constructor(difficulty = 'normal') {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) { console.error('Canvas not found'); return; }
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Difficulty
        this.difficulty = difficulty;
        this.diffMult = DIFFICULTY[difficulty];

        // Save data
        this.saveData = loadGameData() || getDefaultSaveData();

        this.gameState = 'playing';
        this.paused = false;
        this.keys = {};
        this.lastTime = 0;

        // Game settings
        this.gravity = 1.2;
        this.friction = 0.99;
        this.gameTime = 300;
        this.timeRemaining = this.gameTime;
        this.levelStartTime = this.gameTime;

        // Level management
        this.currentLevel = 1;
        this.maxLevel = 5;

        // Life management
        this.livesPerLevel = 3;
        this.currentLives = this.livesPerLevel;
        this.lastCheckpointPosition = { x: 100, y: 400 };
        this.levelDamageTaken = false;

        // Initialize game objects
        this.player = new Player(100, 400, this);
        this.platforms = [];
        this.traps = [];
        this.gates = [];
        this.plates = [];
        this.potions = [];
        this.checkpoints = [];
        this.particles = [];
        this.enemies = [];
        this.projectiles = [];
        this.damageNumbers = [];

        // Combat
        this.playerScore = 0;
        this.runScore = 0;
        this.baseAmmo = 20;
        this.maxAmmo = this.saveData.upgrades.doubleAmmo ? 40 : 20;
        this.ammo = Math.floor(this.maxAmmo * this.diffMult.ammoMult);
        this.shootCooldown = 0;
        this.maxShootCooldown = 0.3;

        // Combo system
        this.combo = { count: 0, timer: 0, multiplier: 1 };

        // Visual effects
        this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
        this.hitStopFrames = 0;
        this.timeScale = 1;
        this.slowMotionTimer = 0;

        // Tutorial system
        this.tutorials = [];

        // Audio
        this.audioContext = null;
        this.initAudio();

        // Apply upgrades
        if (this.saveData.upgrades.extraLife) this.currentLives++;
        if (this.saveData.upgrades.startingShield) {
            this.player.invincible = true;
            this.player.invincibleTime = 3;
        }

        this.createLevel(this.currentLevel);
        this.setupEventListeners();

        // Show difficulty badge
        const badge = document.getElementById('difficultyBadge');
        if (badge) badge.textContent = this.diffMult.label.toUpperCase();

        // Tutorial for level 1
        this.showTutorial('move', 'Use A/D or Arrow Keys to move, W to jump!');
        setTimeout(() => this.showTutorial('shoot', 'Press X or Click to shoot enemies!'), 3000);

        this.gameLoop();
    }

    // === SCREEN EFFECTS ===
    triggerScreenShake(intensity, duration) {
        this.screenShake.intensity = intensity;
        this.screenShake.duration = duration;
    }

    triggerHitStop(frames) {
        this.hitStopFrames = frames;
    }

    triggerSlowMotion(scale, duration) {
        this.timeScale = scale;
        this.slowMotionTimer = duration;
    }

    showDamageNumber(x, y, text, color) {
        this.damageNumbers.push({ x, y, text, color, life: 1, vy: -80 });
    }

    // === COMBO SYSTEM ===
    registerKill(basePoints, x, y) {
        this.combo.count++;
        this.combo.timer = 3;
        if (this.combo.count >= 5) this.combo.multiplier = 3;
        else if (this.combo.count >= 3) this.combo.multiplier = 2;
        else this.combo.multiplier = 1;

        const points = Math.floor(basePoints * this.combo.multiplier * this.diffMult.scoreMult);
        this.playerScore += points;
        this.runScore += points;
        this.showDamageNumber(x, y - 10, `+${points}`, '#FFD700');

        if (this.combo.count >= 3) {
            this.showDamageNumber(x, y - 30, `${this.combo.count}x COMBO!`, '#FF4500');
        }

        this.triggerSlowMotion(0.3, 0.15);
        this.triggerScreenShake(4, 0.15);
    }

    // === TUTORIAL SYSTEM ===
    showTutorial(id, text) {
        if (this.saveData.tutorialSeen[id]) return;
        this.saveData.tutorialSeen[id] = true;
        saveGameData(this.saveData);
        this.tutorials.push({ text, timer: 4 });

        const container = document.getElementById('tutorialContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'tutorial-toast';
        toast.textContent = text;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }

    // === AUDIO ===
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {}
    }

    playSound(type, frequency = 440, duration = 0.1, volume = 0.1) {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        const t = this.audioContext.currentTime;

        switch (type) {
            case 'shoot':
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.type = 'square'; break;
            case 'jump':
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.type = 'sine'; break;
            case 'hit':
                osc.frequency.setValueAtTime(150, t);
                osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
                gain.gain.setValueAtTime(volume * 1.5, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.type = 'sawtooth'; break;
            case 'enemy_death':
                osc.frequency.setValueAtTime(300, t);
                osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.type = 'square'; break;
            case 'collect':
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.type = 'sine'; break;
            case 'checkpoint':
                osc.frequency.setValueAtTime(500, t);
                osc.frequency.setValueAtTime(750, t + 0.1);
                osc.frequency.setValueAtTime(1000, t + 0.2);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.type = 'triangle'; break;
            case 'level_complete':
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.setValueAtTime(500, t + 0.1);
                osc.frequency.setValueAtTime(600, t + 0.2);
                osc.frequency.setValueAtTime(800, t + 0.3);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                osc.type = 'triangle'; break;
            case 'plate_activate':
                osc.frequency.setValueAtTime(600, t);
                osc.frequency.setValueAtTime(800, t + 0.05);
                gain.gain.setValueAtTime(volume * 0.7, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.type = 'sine'; break;
            case 'shop_buy':
                osc.frequency.setValueAtTime(600, t);
                osc.frequency.setValueAtTime(800, t + 0.05);
                osc.frequency.setValueAtTime(1000, t + 0.1);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.type = 'sine'; break;
            default:
                osc.frequency.setValueAtTime(frequency, t);
                gain.gain.setValueAtTime(volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
                osc.type = 'sine';
        }
        osc.start(t);
        osc.stop(t + (duration || 0.3));
    }

    // === LEVEL CREATION ===
    createLevel(level) {
        this.platforms = [];
        this.traps = [];
        this.gates = [];
        this.plates = [];
        this.potions = [];
        this.checkpoints = [];
        this.enemies = [];
        this.projectiles = [];
        this.damageNumbers = [];

        this.maxAmmo = this.saveData.upgrades.doubleAmmo ? 40 : 20;
        this.ammo = Math.floor(this.maxAmmo * this.diffMult.ammoMult);
        this.shootCooldown = 0;

        this.currentLives = this.livesPerLevel;
        if (this.saveData.upgrades.extraLife) this.currentLives++;
        this.lastCheckpointPosition = { x: 100, y: 400 };
        this.levelDamageTaken = false;
        this.levelStartTime = this.timeRemaining;

        if (level === 1) this.createLevel1();
        else if (level === 2) this.createLevel2();
        else if (level === 3) this.createLevel3();
        else if (level === 4) this.createLevel4();
        else if (level === 5) this.createLevel5();
    }

    createLevel1() {
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40),
            new Platform(200, 500, 200, 20),
            new Platform(500, 400, 150, 20),
            new Platform(300, 300, 100, 20),
            new Platform(600, 250, 120, 20),
            new Platform(100, 200, 80, 20),
            new Platform(680, 150, 100, 20),
        ];
        this.traps = [
            new SpikeTrap(250, 480, 3000, 1000),
            new SpikeTrap(550, 380, 2500, 800),
            new SlicerTrap(350, 280, 4000, 500),
        ];
        this.plates = [ new PressurePlate(320, 280, 'red') ];
        this.gates = [ new Gate(650, 100, 100, 'red') ];
        this.potions = [ new HealthPotion(520, 380), new HealthPotion(120, 180) ];
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 1),
            new Checkpoint(320, 260, 'mid1'),
            new Checkpoint(720, 130, 'next'),
        ];
        this.enemies = [
            new PatrolEnemy(450, this.height - 60, 500, 650),
            new BasicGuard(150, 480),
        ];
    }

    createLevel2() {
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40),
            new Platform(150, 480, 100, 20), new Platform(350, 450, 80, 20),
            new Platform(550, 400, 100, 20), new Platform(200, 350, 60, 20),
            new Platform(450, 300, 80, 20), new Platform(100, 250, 70, 20),
            new Platform(300, 200, 90, 20), new Platform(500, 150, 100, 20),
            new Platform(650, 100, 120, 20),
        ];
        this.traps = [
            new SpikeTrap(180, 460, 2000, 800), new SpikeTrap(380, 430, 2500, 900),
            new SpikeTrap(230, 330, 3000, 1000),
            new SlicerTrap(480, 280, 3500, 600), new SlicerTrap(130, 230, 4000, 700),
        ];
        this.plates = [ new PressurePlate(320, 180, 'blue'), new PressurePlate(520, 130, 'green') ];
        this.gates = [ new Gate(400, 50, 80, 'blue'), new Gate(600, 50, 80, 'green') ];
        this.potions = [ new HealthPotion(380, 430), new HealthPotion(680, 80) ];
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 2),
            new Checkpoint(320, 160, 'mid2'), new Checkpoint(520, 110, 'mid3'),
            new Checkpoint(720, 60, 'next'),
        ];
        this.enemies = [
            new PatrolEnemy(180, 460, 150, 250), new PatrolEnemy(380, 430, 350, 450),
            new ChaseEnemy(130, 230, 150), new BasicGuard(520, 130),
            new PatrolEnemy(300, 180, 250, 400),
        ];
    }

    createLevel3() {
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40),
            new Platform(100, 500, 80, 20), new Platform(250, 450, 60, 20),
            new Platform(400, 400, 70, 20), new Platform(550, 350, 80, 20),
            new Platform(150, 300, 60, 20), new Platform(350, 250, 90, 20),
            new Platform(500, 200, 70, 20), new Platform(200, 150, 80, 20),
            new Platform(600, 100, 150, 20),
        ];
        this.traps = [
            new SpikeTrap(120, 480, 2500, 800), new SpikeTrap(270, 430, 3000, 900),
            new SpikeTrap(570, 330, 2800, 700),
            new SlicerTrap(170, 280, 3500, 600), new SlicerTrap(370, 230, 4000, 700),
            new SlicerTrap(520, 180, 3500, 650),
        ];
        this.plates = [
            new PressurePlate(170, 125, 'red'), new PressurePlate(230, 130, 'blue'),
            new PressurePlate(520, 180, 'green'),
        ];
        this.gates = [ new Gate(650, 50, 50, 'red'), new Gate(700, 50, 50, 'blue'), new Gate(750, 50, 50, 'green') ];
        this.potions = [ new HealthPotion(420, 380), new HealthPotion(200, 130) ];
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 3),
            new Checkpoint(170, 280, 'mid4'), new Checkpoint(350, 230, 'mid5'),
            new Checkpoint(770, 80, 'next'),
        ];
        this.enemies = [
            new PatrolEnemy(120, 480, 100, 180), new PatrolEnemy(270, 430, 250, 310),
            new ChaseEnemy(570, 330, 120), new BasicGuard(170, 130), new BasicGuard(230, 130),
            new PatrolEnemy(350, 230, 300, 440), new ChaseEnemy(200, 130, 100),
        ];
    }

    createLevel4() {
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40),
            new Platform(80, 520, 60, 20), new Platform(200, 460, 50, 20),
            new Platform(320, 400, 60, 20), new Platform(460, 350, 50, 20),
            new Platform(580, 300, 70, 20), new Platform(120, 250, 50, 20),
            new Platform(300, 200, 60, 20), new Platform(500, 150, 50, 20),
            new Platform(650, 100, 130, 20),
        ];
        this.traps = [
            new SpikeTrap(100, 500, 1200, 500), new SpikeTrap(220, 440, 1400, 600),
            new SpikeTrap(480, 330, 1300, 550),
            new SlicerTrap(140, 230, 2000, 400), new SlicerTrap(320, 180, 2200, 450),
            new SlicerTrap(520, 130, 1800, 400), new SpikeTrap(600, 280, 1500, 650),
        ];
        this.plates = [
            new PressurePlate(140, 230, 'red'), new PressurePlate(320, 180, 'blue'),
            new PressurePlate(520, 130, 'green'), new PressurePlate(680, 80, 'red'),
        ];
        this.gates = [
            new Gate(600, 50, 40, 'red'), new Gate(650, 50, 40, 'blue'),
            new Gate(700, 50, 40, 'green'), new Gate(750, 50, 40, 'red'),
        ];
        this.potions = [ new HealthPotion(340, 380), new HealthPotion(680, 80) ];
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 4),
            new Checkpoint(140, 210, 'mid6'), new Checkpoint(520, 110, 'mid7'),
            new Checkpoint(770, 80, 'next'),
        ];
        this.enemies = [
            new PatrolEnemy(100, 500, 80, 140), new PatrolEnemy(220, 440, 200, 270),
            new ChaseEnemy(480, 330, 100), new BasicGuard(140, 210),
            new PatrolEnemy(300, 180, 250, 360), new ChaseEnemy(520, 110, 80),
            new BasicGuard(680, 60), new PatrolEnemy(650, 80, 600, 700),
        ];
    }

    createLevel5() {
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40),
            new Platform(60, 540, 40, 20), new Platform(160, 480, 40, 20),
            new Platform(280, 420, 50, 20), new Platform(400, 360, 40, 20),
            new Platform(540, 300, 50, 20), new Platform(120, 240, 40, 20),
            new Platform(280, 180, 50, 20), new Platform(450, 120, 40, 20),
            new Platform(600, 80, 40, 20), new Platform(680, 40, 100, 20),
        ];
        this.traps = [
            new SpikeTrap(80, 520, 1000, 400), new SpikeTrap(180, 460, 1100, 450),
            new SpikeTrap(300, 400, 1200, 500), new SpikeTrap(560, 280, 1000, 400),
            new SlicerTrap(140, 220, 1500, 300), new SlicerTrap(300, 160, 1600, 350),
            new SlicerTrap(470, 100, 1400, 300),
            new SpikeTrap(420, 340, 1300, 550), new SpikeTrap(140, 220, 1800, 700),
        ];
        this.plates = [
            new PressurePlate(140, 220, 'red'), new PressurePlate(300, 160, 'blue'),
            new PressurePlate(470, 100, 'green'), new PressurePlate(620, 60, 'red'),
            new PressurePlate(700, 20, 'blue'),
        ];
        this.gates = [ new Gate(720, 20, 20, 'red'), new Gate(740, 20, 20, 'blue'), new Gate(760, 20, 20, 'green') ];
        this.potions = [ new HealthPotion(300, 140) ];
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 5),
            new Checkpoint(280, 140, 'mid8'),
            new Checkpoint(770, 20, 'win'),
        ];
        this.enemies = [
            new PatrolEnemy(80, 520, 60, 100), new ChaseEnemy(180, 460, 80),
            new PatrolEnemy(300, 400, 280, 330), new BasicGuard(140, 200),
            new ChaseEnemy(420, 340, 100), new PatrolEnemy(280, 160, 230, 330),
            new BasicGuard(470, 80), new ChaseEnemy(560, 260, 120),
            new BasicGuard(620, 40), new PatrolEnemy(680, 20, 650, 730),
        ];
    }

    // === EVENT LISTENERS ===
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;

            if (e.key === 'Escape') {
                this.togglePause();
                return;
            }

            if (e.key.toLowerCase() === 'r' && !this.paused) {
                this.showStartScreen();
            }

            if (e.key.toLowerCase() === 'x' && this.gameState === 'playing' && !this.paused) {
                const dir = this.player.lastDirection || 1;
                this.shootProjectile(
                    this.player.x + this.player.width / 2 + dir * 50,
                    this.player.y + this.player.height / 2
                );
            }
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });
        this.canvas.addEventListener('click', (e) => {
            if (this.gameState === 'playing' && !this.paused) {
                const rect = this.canvas.getBoundingClientRect();
                this.shootProjectile(e.clientX - rect.left, e.clientY - rect.top);
            }
        });
    }

    togglePause() {
        if (this.gameState !== 'playing') return;
        this.paused = !this.paused;
        const el = document.getElementById('pauseOverlay');
        if (el) el.style.display = this.paused ? 'block' : 'none';
    }

    shootProjectile(targetX, targetY) {
        if (this.shootCooldown > 0 || this.ammo <= 0) return;
        const cx = this.player.x + this.player.width / 2;
        const cy = this.player.y + this.player.height / 2;
        const dx = targetX - cx, dy = targetY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return;

        const speed = 600;
        this.projectiles.push(new Projectile(cx, cy, (dx / dist) * speed, (dy / dist) * speed));
        this.ammo--;
        this.shootCooldown = this.maxShootCooldown;
        this.addParticles(cx, cy, '#FFD700', 3);
        this.playSound('shoot');
    }

    // === ATMOSPHERIC PARTICLES ===
    renderAtmosphericParticles() {
        const time = this._frameTime / 1000;
        for (let i = 0; i < 20; i++) {
            const x = (time * 10 + i * 40) % (this.width + 20) - 10;
            const y = 50 + Math.sin(time + i) * 30;
            const alpha = 0.1 + Math.sin(time * 2 + i) * 0.05;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = this.currentLevel <= 2 ? '#FFFFFF' : '#FFD700';
            this.ctx.fillRect(x, y, 2, 2);
        }
        this.ctx.globalAlpha = 1;
    }

    renderShadows() {
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#000000';
        const groundY = this.height - 40;
        this.ctx.fillRect(this.player.x + 2, groundY, this.player.width - 4, 6);
        this.enemies.forEach(e => this.ctx.fillRect(e.x + 2, groundY, e.width - 4, 4));
        this.ctx.globalAlpha = 1;
    }

    // === DEATH HANDLING ===
    handlePlayerDeath() {
        this.currentLives--;
        this.levelDamageTaken = true;
        this.triggerScreenShake(10, 0.4);

        if (this.currentLives > 0) {
            this.player.x = this.lastCheckpointPosition.x;
            this.player.y = this.lastCheckpointPosition.y;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.health = this.player.maxHealth;
            this.player.invincible = false;
            this.player.invincibleTime = 0;
            this.showLevelMessage(`Lives remaining: ${this.currentLives}`);
        } else {
            this.gameOver('Out of lives! Starting level from beginning...');
            setTimeout(() => {
                this.createLevel(this.currentLevel);
                this.player = new Player(100, 400, this);
                this.gameState = 'playing';
                const el = document.getElementById('gameOver');
                if (el) el.style.display = 'none';
            }, 2000);
        }
    }

    // === UPDATE ===
    update(deltaTime) {
        if (this.gameState !== 'playing' || this.paused) return;

        // Apply time scale for slow motion
        const dt = deltaTime * this.timeScale;
        if (this.slowMotionTimer > 0) {
            this.slowMotionTimer -= deltaTime;
            if (this.slowMotionTimer <= 0) this.timeScale = 1;
        }

        // Screen shake update
        if (this.screenShake.duration > 0) {
            this.screenShake.duration -= deltaTime;
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }

        // Combo timer
        if (this.combo.timer > 0) {
            this.combo.timer -= deltaTime;
            if (this.combo.timer <= 0) {
                this.combo.count = 0;
                this.combo.multiplier = 1;
            }
        }

        // Damage numbers
        this.damageNumbers = this.damageNumbers.filter(dn => {
            dn.y += dn.vy * dt;
            dn.life -= deltaTime * 1.5;
            return dn.life > 0;
        });

        // Timer
        this.timeRemaining -= dt;
        if (this.timeRemaining <= 0) {
            this.gameOver('Time ran out!');
            return;
        }

        // Update game objects
        this.player.update(dt, this);
        this.traps.forEach(trap => trap.update(dt));
        this.plates.forEach(plate => plate.update(dt));
        this.gates.forEach(gate => gate.update(dt));
        this.enemies.forEach(enemy => enemy.update(dt, this));
        this.projectiles.forEach(p => p.update(dt, this));
        this.particles.forEach(p => p.update(dt));

        if (this.shootCooldown > 0) this.shootCooldown -= dt;

        // Remove dead objects
        this.particles = this.particles.filter(p => p.life > 0);
        this.projectiles = this.projectiles.filter(p => p.active);
        this.enemies = this.enemies.filter(e => e.health > 0);

        this.checkCollisions();
        this.updateUI();
    }

    // === COLLISIONS ===
    checkCollisions() {
        const player = this.player;

        // Player vs platforms
        this.platforms.forEach(platform => {
            if (player.collidesWith(platform)) {
                if (player.vy > 0 && player.y + player.height - 10 < platform.y) {
                    player.y = platform.y - player.height;
                    player.vy = 0;
                    player.grounded = true;
                    player.canJump = true;
                } else if (player.vy < 0 && player.y > platform.y + platform.height - 10) {
                    player.y = platform.y + platform.height;
                    player.vy = 0;
                } else if (player.vx > 0 && player.x < platform.x) {
                    player.x = platform.x - player.width;
                    player.vx = 0;
                } else if (player.vx < 0 && player.x + player.width > platform.x + platform.width) {
                    player.x = platform.x + platform.width;
                    player.vx = 0;
                }
            }
        });

        // Enemy vs platforms
        this.enemies.forEach(enemy => {
            this.platforms.forEach(platform => {
                if (enemy.collidesWith(platform) && enemy.vy > 0 &&
                    enemy.y + enemy.height - 10 < platform.y) {
                    enemy.y = platform.y - enemy.height;
                    enemy.vy = 0;
                    enemy.grounded = true;
                }
            });
        });

        // Traps
        this.traps.forEach(trap => {
            if (trap.isActive && player.collidesWith(trap)) {
                player.takeDamage();
                this.playSound('hit');
                this.triggerScreenShake(6, 0.2);
                this.levelDamageTaken = true;
            }
        });

        // Pressure plates
        this.plates.forEach(plate => {
            if (player.collidesWith(plate)) {
                if (!plate.isPressed) {
                    this.playSound('plate_activate');
                    this.showTutorial('plates', 'Pressure plates open matching colored gates!');
                }
                plate.activate();
            } else {
                plate.deactivate();
            }
            this.gates.forEach(gate => {
                if (gate.channel === plate.channel) {
                    if (plate.shouldKeepOpen()) gate.open();
                    else gate.close();
                }
            });
        });

        // Gates
        this.gates.forEach(gate => {
            if (!gate.isOpen && player.collidesWith(gate)) {
                if (player.x < gate.x) player.x = gate.x - player.width;
                else player.x = gate.x + gate.width;
                player.vx = 0;
            }
        });

        // Potions
        this.potions = this.potions.filter(potion => {
            if (potion.active && player.collidesWith(potion)) {
                potion.collect();
                player.heal();
                this.addParticles(potion.x, potion.y, '#4ECDC4', 8);
                this.playSound('collect');
                this.showDamageNumber(potion.x, potion.y, '+1 HP', '#4ECDC4');
                return false;
            }
            return true;
        });

        // Player-Enemy
        this.enemies.forEach(enemy => {
            if (player.collidesWith(enemy) && !enemy.isDying) {
                player.takeDamage();
                this.playSound('hit');
                this.triggerScreenShake(5, 0.15);
                this.levelDamageTaken = true;
                const push = player.x < enemy.x ? -1 : 1;
                player.vx += push * 200;
            }
        });

        // Projectiles
        this.projectiles.forEach(projectile => {
            this.platforms.forEach(platform => {
                if (projectile.collidesWith(platform)) {
                    projectile.active = false;
                    this.addParticles(projectile.x, projectile.y, '#FFD93D', 2);
                }
            });
            this.enemies.forEach(enemy => {
                if (projectile.collidesWith(enemy) && !enemy.isDying) {
                    projectile.active = false;
                    enemy.takeDamage(1);
                    this.triggerHitStop(3);
                    this.triggerScreenShake(3, 0.1);

                    const hitPoints = Math.floor(10 * this.diffMult.scoreMult);
                    this.playerScore += hitPoints;
                    this.runScore += hitPoints;
                    this.showDamageNumber(enemy.x + enemy.width / 2, enemy.y, `-${1}`, '#FF6B6B');
                    this.addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FF6B6B', 5);

                    if (enemy.health <= 0) {
                        enemy.isDying = true;
                        this.registerKill(50, enemy.x + enemy.width / 2, enemy.y);
                        this.addParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FFD700', 10);
                        this.playSound('enemy_death');
                    }
                }
            });
        });

        // Checkpoints
        this.checkpoints.forEach(checkpoint => {
            if (player.collidesWith(checkpoint)) {
                if (checkpoint.floor === 'next' && !checkpoint.activated) {
                    this.playSound('level_complete');
                    this.advanceLevel();
                } else if (checkpoint.floor === 'win' && !checkpoint.activated) {
                    this.playSound('level_complete');
                    this.gameWin();
                } else if (!checkpoint.activated) {
                    this.playSound('checkpoint');
                    this.lastCheckpointPosition = { x: checkpoint.x + checkpoint.width / 2, y: checkpoint.y };
                    this.showTutorial('checkpoint', 'Checkpoint reached! You will respawn here.');
                    if (this.saveData.upgrades.checkpointHeal) {
                        player.heal();
                        this.showDamageNumber(player.x, player.y - 10, '+1 HP', '#4ECDC4');
                    }
                }
                checkpoint.activate();
            }
        });
    }

    addParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
    }

    // === RENDER ===
    render() {
        this.ctx.save();
        this.ctx.translate(this.screenShake.x, this.screenShake.y);

        // Background
        const sky = this.ctx.createLinearGradient(0, 0, 0, this.height);
        if (this.currentLevel <= 2) {
            sky.addColorStop(0, '#87CEEB'); sky.addColorStop(0.6, '#DDA0DD'); sky.addColorStop(1, '#98FB98');
        } else if (this.currentLevel === 3) {
            sky.addColorStop(0, '#4B0082'); sky.addColorStop(0.6, '#8A2BE2'); sky.addColorStop(1, '#2F4F4F');
        } else {
            sky.addColorStop(0, '#2F1B14'); sky.addColorStop(0.6, '#8B0000'); sky.addColorStop(1, '#1C1C1C');
        }
        this.ctx.fillStyle = sky;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.renderAtmosphericParticles();

        // Platforms
        this.platforms.forEach(platform => {
            const pg = this.ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.height);
            pg.addColorStop(0, '#D2B48C'); pg.addColorStop(0.3, '#A0522D'); pg.addColorStop(1, '#654321');
            this.ctx.fillStyle = pg;
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
            // Cached texture seed per platform
            if (!platform._seed) platform._seed = Math.floor(Math.random() * 10000);
            let seed = platform._seed;
            for (let i = 0; i < platform.width; i += 8) {
                for (let j = 0; j < platform.height; j += 8) {
                    seed = (seed * 16807 + 11) % 2147483647;
                    if ((seed / 2147483647) > 0.7) {
                        this.ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
                        this.ctx.fillRect(platform.x + i, platform.y + j, 4, 4);
                    }
                }
            }
            this.ctx.fillStyle = '#F4A460';
            this.ctx.fillRect(platform.x, platform.y, platform.width, 2);
        });

        this.gates.forEach(g => g.render(this.ctx));
        this.plates.forEach(p => p.render(this.ctx));
        this.traps.forEach(t => t.render(this.ctx, this._frameTime));
        this.potions.forEach(p => p.render(this.ctx, this._frameTime));
        this.enemies.forEach(e => e.render(this.ctx, this._frameTime));
        this.checkpoints.forEach(c => c.render(this.ctx, this._frameTime));
        this.projectiles.forEach(p => p.render(this.ctx));
        this.particles.forEach(p => p.render(this.ctx));
        this.renderShadows();
        this.player.render(this.ctx, this._frameTime);

        // Damage numbers (world space)
        this.damageNumbers.forEach(dn => {
            this.ctx.globalAlpha = dn.life;
            this.ctx.fillStyle = dn.color;
            this.ctx.font = 'bold 14px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(dn.text, dn.x, dn.y);
            this.ctx.textAlign = 'left';
            this.ctx.globalAlpha = 1;
        });

        this.ctx.restore();

        // Screen-space UI: combo display
        const comboEl = document.getElementById('comboDisplay');
        if (comboEl) {
            if (this.combo.count >= 3) {
                comboEl.style.display = 'block';
                comboEl.textContent = `${this.combo.count}x COMBO! (${this.combo.multiplier}x score)`;
            } else {
                comboEl.style.display = 'none';
            }
        }

        // Damage vignette
        const vig = document.getElementById('damageVignette');
        if (vig) {
            if (this.player.health <= 1) vig.className = 'damage-vignette critical';
            else if (this.player.health <= 2) vig.className = 'damage-vignette active';
            else vig.className = 'damage-vignette';
        }

        // Pause overlay text
        if (this.paused) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
        }
    }

    // === UI ===
    updateUI() {
        const el = (id) => document.getElementById(id);

        const hearts = el('hearts');
        if (hearts) {
            let h = '';
            for (let i = 0; i < this.player.maxHealth; i++)
                h += i < this.player.health ? '\u2764\uFE0F' : '\uD83D\uDDA4';
            hearts.textContent = h;
        }

        const timer = el('timer');
        if (timer) {
            const m = Math.floor(this.timeRemaining / 60);
            const s = Math.floor(this.timeRemaining % 60);
            timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            timer.style.color = this.timeRemaining < 60 ? '#FF6B6B' : this.timeRemaining < 120 ? '#FFD93D' : '#4ECDC4';
        }

        const floor = el('floor');
        if (floor) floor.textContent = this.currentLevel;

        const score = el('score');
        if (score) score.textContent = this.playerScore;

        const ammo = el('ammo');
        if (ammo) ammo.textContent = `${this.ammo}/${this.maxAmmo}`;

        const lives = el('lives');
        if (lives) lives.textContent = this.currentLives;
    }

    // === GAME STATE ===
    gameOver(reason) {
        this.gameState = 'gameOver';
        // Save score
        this.saveData.totalScore += this.runScore;
        saveGameData(this.saveData);

        const el = document.getElementById('gameOver');
        if (el) el.style.display = 'block';
        const r = document.getElementById('gameOverReason');
        if (r) r.textContent = reason;
        const s = document.getElementById('gameOverScore');
        if (s) s.textContent = this.runScore;
    }

    advanceLevel() {
        this.currentLevel++;
        if (this.currentLevel > this.maxLevel) { this.gameWin(); return; }

        this.player.x = 100; this.player.y = 400;
        this.player.vx = 0; this.player.vy = 0;
        this.player.grounded = false;
        this.createLevel(this.currentLevel);
        this.addParticles(this.width / 2, this.height / 2, '#FFD93D', 15);
        this.showLevelMessage(`Level ${this.currentLevel}!`);

        if (this.currentLevel === 2) this.showTutorial('level2', 'Harder enemies ahead! Watch for chasers!');
    }

    showLevelMessage(message) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,215,0,0.9);color:#1e3c72;padding:20px 40px;border-radius:15px;font-size:24px;font-weight:bold;z-index:1000;border:3px solid #FFA500;font-family:Courier New,monospace;';
        div.textContent = message;
        document.body.appendChild(div);
        setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 2000);
    }

    gameWin() {
        this.gameState = 'gameWon';
        // Save score
        this.saveData.totalScore += this.runScore;
        saveGameData(this.saveData);

        const m = Math.floor(this.timeRemaining / 60);
        const s = Math.floor(this.timeRemaining % 60);
        const ct = document.getElementById('completionTime');
        if (ct) ct.textContent = `Time Remaining: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        const ws = document.getElementById('winScore');
        if (ws) ws.textContent = this.runScore;

        const stats = document.getElementById('winStats');
        if (stats) {
            stats.innerHTML = `
                <span>Difficulty:</span><span>${this.diffMult.label}</span>
                <span>Score Multiplier:</span><span>${this.diffMult.scoreMult}x</span>
                <span>Total Score:</span><span>${this.saveData.totalScore}</span>
            `;
        }

        const el = document.getElementById('gameWin');
        if (el) el.style.display = 'block';
        this.addParticles(this.width / 2, this.height / 2, '#FFD700', 20);
    }

    showStartScreen() {
        // Update total score display
        const tsd = document.getElementById('totalScoreDisplay');
        if (tsd) tsd.textContent = `Total Score: ${this.saveData.totalScore}`;

        // Hide all overlays, show start screen
        ['gameOver', 'gameWin', 'pauseOverlay', 'shopOverlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const ss = document.getElementById('startScreen');
        if (ss) ss.style.display = 'block';

        this.gameState = 'menu';
        this.paused = false;
    }

    restartGame() {
        this.gameState = 'playing';
        this.paused = false;
        this.timeRemaining = this.gameTime;
        this.currentLevel = 1;
        this.playerScore = 0;
        this.runScore = 0;
        this.combo = { count: 0, timer: 0, multiplier: 1 };
        this.player = new Player(100, 400, this);
        this.particles = [];
        this.damageNumbers = [];
        this.createLevel(1);

        if (this.saveData.upgrades.startingShield) {
            this.player.invincible = true;
            this.player.invincibleTime = 3;
        }

        ['gameOver', 'gameWin', 'startScreen', 'shopOverlay', 'pauseOverlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    // === GAME LOOP ===
    gameLoop(currentTime = 0) {
        this._frameTime = currentTime;
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.05); // cap at 50ms
        this.lastTime = currentTime;

        // Hit stop: skip update but still render
        if (this.hitStopFrames > 0) {
            this.hitStopFrames--;
            this.render();
            requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }

        this.update(deltaTime);
        this.render();
        requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// === PLAYER CLASS ===
class Player {
    constructor(x, y, gameRef) {
        this.game = gameRef;
        this.x = x; this.y = y;
        this.width = 24; this.height = 32;
        this.vx = 0; this.vy = 0;
        this.speed = 200; this.jumpPower = 400;
        this.grounded = false; this.canJump = true;
        this.health = 5; this.maxHealth = 5;
        this.invincible = false; this.invincibleTime = 0;
        this.crouching = false; this.rolling = false; this.rollTime = 0;
        this.lastDirection = 1;
        this.animationTime = 0; this.currentFrame = 0; this.animationSpeed = 0.2;
    }

    update(deltaTime, game) {
        this.handleInput(game.keys, deltaTime);
        this.vy += game.gravity * 600 * deltaTime;
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        if (this.grounded) this.vx *= game.friction;

        if (this.invincible) {
            this.invincibleTime -= deltaTime;
            if (this.invincibleTime <= 0) this.invincible = false;
        }
        if (this.rolling) {
            this.rollTime -= deltaTime;
            if (this.rollTime <= 0) { this.rolling = false; this.height = 32; }
        }

        this.animationTime += deltaTime;
        if (this.animationTime >= this.animationSpeed) {
            this.animationTime = 0;
            this.currentFrame = (this.currentFrame + 1) % 4;
        }

        this.grounded = false;
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > game.width) this.x = game.width - this.width;
        if (this.y > this.game.height) {
            this.health = 1;
            this.takeDamage();
        }
    }

    handleInput(keys, deltaTime) {
        if (keys['a'] || keys['arrowleft']) { this.vx -= this.speed * 4 * deltaTime; this.lastDirection = -1; }
        if (keys['d'] || keys['arrowright']) { this.vx += this.speed * 4 * deltaTime; this.lastDirection = 1; }

        if ((keys['w'] || keys['arrowup']) && this.canJump && this.grounded) {
            this.vy = -this.jumpPower;
            this.canJump = false;
            this.grounded = false;
            if (this.game) this.game.playSound('jump');
        }

        if (keys['s'] || keys['arrowdown']) { this.crouching = true; this.height = 22; }
        else { this.crouching = false; if (!this.rolling) this.height = 32; }

        if (keys[' '] && this.grounded && !this.rolling) {
            this.rolling = true; this.rollTime = 0.5; this.height = 15;
            this.vx = this.vx > 0 ? 300 : -300;
        }

        this.vx = Math.max(-300, Math.min(300, this.vx));
    }

    takeDamage() {
        if (this.invincible) return;
        this.health--;
        this.invincible = true;
        this.invincibleTime = 1.5;

        if (this.game) {
            this.game.triggerScreenShake(6, 0.2);
            this.game.showDamageNumber(this.x + this.width / 2, this.y, '-1', '#FF6B6B');
        }

        if (this.health <= 0 && this.game) {
            this.game.handlePlayerDeath();
        }
    }

    heal() { this.health = Math.min(this.maxHealth, this.health + 1); }

    collidesWith(other) {
        return this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }

    render(ctx, frameTime) {
        if (this.invincible && Math.floor((frameTime || 0) / 100) % 2) ctx.globalAlpha = 0.5;

        ctx.fillStyle = '#4169E1';
        ctx.fillRect(this.x + 4, this.y + 10, this.width - 8, this.height - 14);
        ctx.fillStyle = '#FDBCB4';
        ctx.fillRect(this.x + 6, this.y + 4, this.width - 12, 12);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x + 5, this.y, this.width - 10, 6);
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x + 8, this.y + 1, 2, 2);
        ctx.fillRect(this.x + 14, this.y + 1, 2, 2);

        const capeOff = this.rolling ? 0 : (Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame) * 2 : 0);
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(this.x - 2 + capeOff, this.y + 8, 4, this.height - 10);

        ctx.fillStyle = '#FDBCB4';
        if (!this.crouching && !this.rolling) {
            const a = Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame * 2) * 2 : 0;
            ctx.fillRect(this.x + 1, this.y + 12 + a, 3, 8);
            ctx.fillRect(this.x + this.width - 4, this.y + 12 - a, 3, 8);
        }
        ctx.fillStyle = '#4169E1';
        if (!this.crouching && !this.rolling) {
            const l = Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame * 3) * 1.5 : 0;
            ctx.fillRect(this.x + 6, this.y + this.height - 8 + l, 4, 8);
            ctx.fillRect(this.x + 14, this.y + this.height - 8 - l, 4, 8);
        }
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x + 8, this.y + 8, 1, 1);
        ctx.fillRect(this.x + 15, this.y + 8, 1, 1);
        ctx.fillStyle = '#FDBCB4';
        ctx.fillRect(this.lastDirection > 0 ? this.x + 16 : this.x + 7, this.y + 10, 1, 2);

        if (this.rolling) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            const s = this.currentFrame * 2;
            ctx.fillRect(this.x - 2, this.y + s, this.width + 4, 2);
            ctx.fillRect(this.x + s, this.y - 2, 2, this.height + 4);
        }
        ctx.globalAlpha = 1;
    }
}

// === PLATFORM ===
class Platform {
    constructor(x, y, width, height) {
        this.x = x; this.y = y; this.width = width; this.height = height;
    }
}

// === SPIKE TRAP ===
class SpikeTrap {
    constructor(x, y, cycleTime, activeTime) {
        this.x = x; this.y = y; this.width = 40; this.height = 20;
        this.cycleTime = cycleTime / 1000; this.activeTime = activeTime / 1000;
        this.timer = 0; this.isActive = false; this.warningTime = 1; this.isWarning = false;
    }
    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer >= this.cycleTime) this.timer = 0;
        this.isWarning = this.timer >= (this.cycleTime - this.warningTime) && this.timer < this.cycleTime;
        this.isActive = this.timer < this.activeTime;
    }
    render(ctx, frameTime) {
        if (this.isActive) {
            ctx.fillStyle = '#FF1744';
            for (let i = 0; i < this.width; i += 8) {
                ctx.beginPath();
                ctx.moveTo(this.x + i, this.y + this.height);
                ctx.lineTo(this.x + i + 4, this.y);
                ctx.lineTo(this.x + i + 8, this.y + this.height);
                ctx.closePath(); ctx.fill();
            }
        } else if (this.isWarning) {
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(this.x, this.y + this.height - 5, this.width, 5);
            if (Math.floor((frameTime || 0) / 200) % 2) {
                ctx.fillStyle = '#FF1744';
                ctx.fillRect(this.x, this.y + this.height - 3, this.width, 3);
            }
        }
    }
    collidesWith(player) {
        return this.x < player.x + player.width && this.x + this.width > player.x &&
               this.y < player.y + player.height && this.y + this.height > player.y;
    }
}

// === SLICER TRAP ===
class SlicerTrap {
    constructor(x, y, cycleTime, activeTime) {
        this.x = x; this.y = y - 100; this.width = 60; this.height = 100;
        this.cycleTime = cycleTime / 1000; this.activeTime = activeTime / 1000;
        this.timer = 0; this.isActive = false;
        this.bladeY = this.y; this.baseBladeY = this.y;
    }
    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer >= this.cycleTime) this.timer = 0;
        this.isActive = this.timer < this.activeTime;
        this.bladeY = this.isActive ? this.baseBladeY + (this.timer / this.activeTime) * 100 : this.baseBladeY;
    }
    render(ctx) {
        ctx.fillStyle = '#666';
        ctx.fillRect(this.x + this.width / 2 - 2, this.baseBladeY, 4, 100);
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(this.x, this.bladeY, this.width, 20);
        if (!this.isActive && this.timer > this.cycleTime - 1) {
            ctx.fillStyle = '#FF6B6B';
            ctx.fillRect(this.x - 10, this.baseBladeY - 10, this.width + 20, 10);
        }
    }
    collidesWith(player) {
        return this.isActive && player.x < this.x + this.width && player.x + player.width > this.x &&
               player.y < this.bladeY + 20 && player.y + player.height > this.bladeY;
    }
}

// === PRESSURE PLATE ===
class PressurePlate {
    constructor(x, y, channel) {
        this.x = x; this.y = y; this.width = 60; this.height = 10;
        this.channel = channel; this.isPressed = false; this.timer = 0; this.openTime = 8;
    }
    activate() { this.isPressed = true; this.timer = this.openTime; }
    deactivate() { this.isPressed = false; }
    update(deltaTime) { if (!this.isPressed && this.timer > 0) this.timer -= deltaTime; }
    shouldKeepOpen() { return this.isPressed || this.timer > 0; }
    render(ctx) {
        let c;
        if (this.isPressed) c = this.channel === 'red' ? '#FF6B6B' : this.channel === 'blue' ? '#4169E1' : this.channel === 'green' ? '#32CD32' : '#4ECDC4';
        else if (this.timer > 0) c = this.channel === 'red' ? '#8B3A3A' : this.channel === 'blue' ? '#1C4F8B' : this.channel === 'green' ? '#228B22' : '#2C8B8B';
        else c = '#666';
        ctx.fillStyle = c;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// === GATE ===
class Gate {
    constructor(x, y, height, channel) {
        this.x = x; this.y = y; this.width = 20; this.height = height;
        this.channel = channel; this.isOpen = false;
        this.baseHeight = height; this.currentHeight = height;
    }
    open() { this.isOpen = true; }
    close() { this.isOpen = false; }
    update(deltaTime) {
        const target = this.isOpen ? 0 : this.baseHeight;
        this.currentHeight += (target - this.currentHeight) * 5 * deltaTime;
    }
    render(ctx) {
        if (this.currentHeight <= 1) return;
        let c = this.channel === 'red' ? '#8B0000' : this.channel === 'blue' ? '#000080' : this.channel === 'green' ? '#006400' : '#4ECDC4';
        ctx.fillStyle = c;
        ctx.fillRect(this.x, this.y + this.baseHeight - this.currentHeight, this.width, this.currentHeight);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < this.currentHeight; i += 10)
            ctx.fillRect(this.x + 2, this.y + this.baseHeight - this.currentHeight + i, this.width - 4, 2);
    }
    collidesWith(player) {
        return this.currentHeight > 10 && player.x < this.x + this.width && player.x + player.width > this.x &&
               player.y < this.y + this.baseHeight && player.y + player.height > this.y + this.baseHeight - this.currentHeight;
    }
}

// === HEALTH POTION ===
class HealthPotion {
    constructor(x, y) {
        this.x = x; this.y = y; this.width = 15; this.height = 20;
        this.active = true; this.bobOffset = Math.random() * Math.PI * 2;
    }
    collect() { this.active = false; }
    render(ctx, frameTime) {
        if (!this.active) return;
        const bob = Math.sin((frameTime || 0) / 500 + this.bobOffset) * 3;
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(this.x, this.y + bob, this.width, this.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(this.x + 6, this.y + bob + 5, 3, 10);
        ctx.fillRect(this.x + 3, this.y + bob + 8, 9, 3);
        ctx.shadowColor = '#FF6B6B'; ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.fillRect(this.x - 2, this.y + bob - 2, this.width + 4, this.height + 4);
        ctx.shadowBlur = 0;
    }
}

// === CHECKPOINT ===
class Checkpoint {
    constructor(x, y, floor) {
        this.x = x; this.y = y; this.width = 30; this.height = 40;
        this.floor = floor; this.activated = false;
    }
    activate() { this.activated = true; }
    render(ctx, frameTime) {
        ctx.fillStyle = this.activated ? '#4ECDC4' : '#666';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        if (this.activated) {
            const flicker = Math.sin((frameTime || 0) / 100) * 2;
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(this.x + this.width / 2, this.y);
            ctx.lineTo(this.x + this.width / 2 - 8, this.y - 15 + flicker);
            ctx.lineTo(this.x + this.width / 2 + 8, this.y - 15 + flicker);
            ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'white'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
        if (this.floor === 'next') ctx.fillText('\u2192', this.x + this.width / 2, this.y + this.height / 2 + 4);
        else if (this.floor === 'win') ctx.fillText('WIN', this.x + this.width / 2, this.y + this.height / 2 + 4);
        else if (typeof this.floor === 'string' && this.floor.startsWith('mid')) ctx.fillText('\u2713', this.x + this.width / 2, this.y + this.height / 2 + 6);
        else ctx.fillText(this.floor.toString(), this.x + this.width / 2, this.y + this.height / 2 + 6);
        ctx.textAlign = 'left';
    }
}

// === PARTICLE ===
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200 - 100;
        this.life = 1; this.maxLife = 1;
        this.color = color; this.size = Math.random() * 4 + 2;
    }
    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += 200 * deltaTime;
        this.life -= deltaTime * 2;
    }
    render(ctx) {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// === ENEMIES ===
class BasicGuard {
    constructor(x, y) {
        this.x = x; this.y = y; this.width = 25; this.height = 30;
        this.health = 2; this.maxHealth = 2; this.vx = 0; this.vy = 0;
        this.grounded = false; this.isDying = false; this.deathTimer = 0; this.damageFlash = 0;
    }
    update(deltaTime, game) {
        if (this.isDying) { this.deathTimer += deltaTime; if (this.deathTimer > 0.5) this.health = 0; return; }
        this.vy += game.gravity * 600 * deltaTime;
        this.y += this.vy * deltaTime;
        if (this.damageFlash > 0) this.damageFlash -= deltaTime;
        this.grounded = false;
    }
    takeDamage(amount) {
        this.health -= amount; this.damageFlash = 0.3;
        if (this.health <= 0 && !this.isDying) { this.isDying = true; this.deathTimer = 0; }
    }
    collidesWith(other) {
        return this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }
    render(ctx) {
        if (this.isDying) ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#228B22';
        ctx.fillRect(this.x + 3, this.y + 8, this.width - 6, this.height - 8);
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#2E8B57';
        ctx.fillRect(this.x + 2, this.y, this.width - 4, 12);
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(this.x + 5, this.y + 8, 2, 4);
        ctx.fillRect(this.x + this.width - 7, this.y + 8, 2, 4);
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x + 6, this.y + 3, 2, 2);
        ctx.fillRect(this.x + this.width - 8, this.y + 3, 2, 2);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x + 4, this.y + 10, this.width - 8, 8);
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x + this.width - 2, this.y + 5, 4, 15);
        ctx.fillRect(this.x + this.width - 1, this.y + 2, 2, 6);
        ctx.globalAlpha = 1;
    }
}

class PatrolEnemy {
    constructor(x, y, leftBound, rightBound) {
        this.x = x; this.y = y; this.width = 22; this.height = 28;
        this.health = 3; this.maxHealth = 3; this.vx = 50; this.vy = 0;
        this.grounded = false; this.leftBound = leftBound; this.rightBound = rightBound;
        this.direction = 1; this.isDying = false; this.deathTimer = 0; this.damageFlash = 0;
    }
    update(deltaTime, game) {
        if (this.isDying) { this.deathTimer += deltaTime; if (this.deathTimer > 0.5) this.health = 0; return; }
        this.vy += game.gravity * 600 * deltaTime;
        if (this.grounded) {
            this.x += this.vx * this.direction * deltaTime;
            if (this.x <= this.leftBound || this.x + this.width >= this.rightBound) this.direction *= -1;
        }
        this.y += this.vy * deltaTime;
        if (this.damageFlash > 0) this.damageFlash -= deltaTime;
        this.grounded = false;
    }
    takeDamage(amount) {
        this.health -= amount; this.damageFlash = 0.3;
        if (this.health <= 0 && !this.isDying) { this.isDying = true; this.deathTimer = 0; }
    }
    collidesWith(other) {
        return this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }
    render(ctx) {
        if (this.isDying) ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#556B2F';
        ctx.fillRect(this.x + 2, this.y + 6, this.width - 4, this.height - 6);
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#6B8E23';
        ctx.fillRect(this.x + 1, this.y, this.width - 2, 10);
        ctx.fillRect(this.x - 1, this.y + 2, 3, 4);
        ctx.fillRect(this.x + this.width - 2, this.y + 2, 3, 4);
        ctx.fillStyle = '#8B4513';
        if (this.direction > 0) {
            ctx.fillRect(this.x + this.width - 2, this.y + 3, 5, 2);
            ctx.fillRect(this.x + this.width - 1, this.y + 8, 3, 12);
        } else {
            ctx.fillRect(this.x - 3, this.y + 3, 5, 2);
            ctx.fillRect(this.x - 2, this.y + 8, 3, 12);
        }
        ctx.fillStyle = '#FF4500';
        ctx.fillRect(this.x + 4, this.y + 3, 2, 2);
        ctx.fillRect(this.x + this.width - 6, this.y + 3, 2, 2);
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x + 3, this.y + 12, this.width - 6, 2);
        ctx.fillRect(this.x + 3, this.y + 18, this.width - 6, 2);
        ctx.globalAlpha = 1;
    }
}

class ChaseEnemy {
    constructor(x, y, detectionRange) {
        this.x = x; this.y = y; this.width = 24; this.height = 32;
        this.health = 4; this.maxHealth = 4; this.vx = 0; this.vy = 0;
        this.speed = 80; this.grounded = false;
        this.detectionRange = detectionRange || 100;
        this.isChasing = false; this.isDying = false;
        this.deathTimer = 0; this.damageFlash = 0; this.aggroTimer = 0;
    }
    update(deltaTime, game) {
        if (this.isDying) { this.deathTimer += deltaTime; if (this.deathTimer > 0.5) this.health = 0; return; }
        this.vy += game.gravity * 600 * deltaTime;
        const pcx = game.player.x + game.player.width / 2;
        const ecx = this.x + this.width / 2;
        const dist = Math.abs(pcx - ecx);
        if (dist < this.detectionRange) { this.isChasing = true; this.aggroTimer = 2; }
        else if (this.aggroTimer > 0) { this.aggroTimer -= deltaTime; if (this.aggroTimer <= 0) this.isChasing = false; }
        if (this.isChasing && this.grounded) {
            const dir = pcx > ecx ? 1 : -1;
            this.vx = this.speed * dir * deltaTime;
            this.x += this.vx;
        }
        this.y += this.vy * deltaTime;
        if (this.damageFlash > 0) this.damageFlash -= deltaTime;
        this.grounded = false;
    }
    takeDamage(amount) {
        this.health -= amount; this.damageFlash = 0.3;
        this.isChasing = true; this.aggroTimer = 3;
        if (this.health <= 0 && !this.isDying) { this.isDying = true; this.deathTimer = 0; }
    }
    collidesWith(other) {
        return this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }
    render(ctx, frameTime) {
        if (this.isDying) ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : (this.isChasing ? '#8B0000' : '#2F4F4F');
        ctx.fillRect(this.x + 1, this.y + 8, this.width - 2, this.height - 8);
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : (this.isChasing ? '#8B0000' : '#696969');
        ctx.fillRect(this.x, this.y, this.width, 12);
        if (this.isChasing) {
            ctx.fillStyle = '#FFFFFF';
            const steam = Math.sin((frameTime || 0) / 100) * 2;
            ctx.fillRect(this.x - 3, this.y - 5 + steam, 2, 8);
            ctx.fillRect(this.x + this.width + 1, this.y - 5 + steam, 2, 8);
        }
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(this.x + 4, this.y + 9, 3, 6);
        ctx.fillRect(this.x + this.width - 7, this.y + 9, 3, 6);
        ctx.fillStyle = this.isChasing ? '#FF0000' : '#FF4500';
        ctx.fillRect(this.x + 5, this.y + 4, 3, 3);
        ctx.fillRect(this.x + this.width - 8, this.y + 4, 3, 3);
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(this.x + 2, this.y + 2, this.width - 4, 1);
        ctx.fillRect(this.x + this.width / 2 - 1, this.y + 1, 2, 4);
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(this.x - 3, this.y + 18, 6, 10);
        ctx.fillRect(this.x + this.width - 3, this.y + 18, 6, 10);
        ctx.globalAlpha = 1;
    }
}

// === PROJECTILE ===
class Projectile {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.width = 8; this.height = 4;
        this.vx = vx; this.vy = vy; this.active = true;
        this.lifetime = 3; this.trail = [];
    }
    update(deltaTime, game) {
        if (!this.active) return;
        this.trail.push({ x: this.x, y: this.y, life: 0.3 });
        if (this.trail.length > 8) this.trail.shift();
        this.trail.forEach(p => p.life -= deltaTime);
        this.trail = this.trail.filter(p => p.life > 0);
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0 || this.x < 0 || this.x > game.width || this.y < 0 || this.y > game.height)
            this.active = false;
    }
    collidesWith(other) {
        return this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }
    render(ctx) {
        if (!this.active) return;
        this.trail.forEach(p => {
            const a = p.life / 0.3;
            ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#FFD700';
            const s = a * 4;
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        });
        ctx.globalAlpha = 1; ctx.fillStyle = '#FFA500';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(this.x + 1, this.y + 1, this.width - 2, this.height - 2);
    }
}

// === GLOBAL FUNCTIONS (called from HTML) ===
let game;

function startGame(difficulty) {
    const ss = document.getElementById('startScreen');
    if (ss) ss.style.display = 'none';
    game = new Game(difficulty);
}

function restartGame() {
    if (game) game.showStartScreen();
}

function openShopFromMenu() { renderShop(); }
function openShopFromPause() { if (game) game.paused = false; const p = document.getElementById('pauseOverlay'); if (p) p.style.display = 'none'; renderShop(); }
function openShopFromGameOver() { const el = document.getElementById('gameOver'); if (el) el.style.display = 'none'; renderShop(); }
function openShopFromWin() { const el = document.getElementById('gameWin'); if (el) el.style.display = 'none'; renderShop(); }

function renderShop() {
    const data = loadGameData() || getDefaultSaveData();
    const shopEl = document.getElementById('shopOverlay');
    const scoreEl = document.getElementById('shopScore');
    const itemsEl = document.getElementById('shopItems');
    if (!shopEl || !itemsEl) return;

    if (scoreEl) scoreEl.textContent = data.totalScore;
    itemsEl.innerHTML = '';

    SHOP_ITEMS.forEach(item => {
        const owned = data.upgrades[item.id];
        const canAfford = data.totalScore >= item.price;
        const div = document.createElement('div');
        div.className = 'shop-item' + (owned ? ' owned' : '');
        div.innerHTML = `
            <div class="shop-item-info">
                <div class="shop-item-name">${item.name}${owned ? ' (OWNED)' : ''}</div>
                <div class="shop-item-desc">${item.desc}</div>
            </div>
            <div>
                ${owned ? '<span style="color:#4CAF50">Purchased</span>' :
                  `<button ${canAfford ? '' : 'disabled'} onclick="purchaseUpgrade('${item.id}')">${item.price} pts</button>`}
            </div>
        `;
        itemsEl.appendChild(div);
    });

    shopEl.style.display = 'block';
}

function purchaseUpgrade(id) {
    const data = loadGameData() || getDefaultSaveData();
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item || data.upgrades[id] || data.totalScore < item.price) return;

    data.totalScore -= item.price;
    data.upgrades[id] = true;
    saveGameData(data);
    if (game) { game.saveData = data; game.playSound('shop_buy'); }
    renderShop();
}

function closeShop() {
    const el = document.getElementById('shopOverlay');
    if (el) el.style.display = 'none';
    const ss = document.getElementById('startScreen');
    if (ss) ss.style.display = 'block';
    // Update total score display
    const data = loadGameData() || getDefaultSaveData();
    const tsd = document.getElementById('totalScoreDisplay');
    if (tsd) tsd.textContent = `Total Score: ${data.totalScore}`;
}

// === INITIALIZATION ===
window.addEventListener('load', () => {
    const data = loadGameData() || getDefaultSaveData();
    const tsd = document.getElementById('totalScoreDisplay');
    if (tsd) tsd.textContent = `Total Score: ${data.totalScore}`;
    const ss = document.getElementById('startScreen');
    if (ss) ss.style.display = 'block';
});
