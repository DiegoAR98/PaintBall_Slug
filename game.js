// Prince of Run - Web Demo Game Engine
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        this.gameState = 'playing'; // playing, gameOver, gameWon
        this.keys = {};
        this.lastTime = 0;

        // Game settings
        this.gravity = 1.2;
        this.friction = 0.99;
        this.gameTime = 300; // 5 minutes for demo
        this.timeRemaining = this.gameTime;

        // Level management
        this.currentLevel = 1;
        this.maxLevel = 5; // Updated to include levels 4 and 5

        // Life management system
        this.livesPerLevel = 3;
        this.currentLives = this.livesPerLevel;
        this.lastCheckpointPosition = {x: 100, y: 400};

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

        // Combat settings
        this.playerScore = 0;
        this.ammo = 20;
        this.maxAmmo = 20;
        this.shootCooldown = 0;
        this.maxShootCooldown = 0.3;

        // Audio system
        this.audioContext = null;
        this.sounds = {};
        this.initAudio();

        this.createLevel(this.currentLevel);
        this.setupEventListeners();
        this.gameLoop();
    }

    renderAtmosphericParticles() {
        // Add floating atmospheric particles
        const time = Date.now() / 1000;

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

        // Player shadow
        const groundY = this.height - 40;
        this.ctx.fillRect(this.player.x + 2, groundY, this.player.width - 4, 6);

        // Enemy shadows
        this.enemies.forEach(enemy => {
            this.ctx.fillRect(enemy.x + 2, groundY, enemy.width - 4, 4);
        });

        this.ctx.globalAlpha = 1;
    }

    handlePlayerDeath() {
        this.currentLives--;

        if (this.currentLives > 0) {
            // Respawn at last checkpoint
            this.player.x = this.lastCheckpointPosition.x;
            this.player.y = this.lastCheckpointPosition.y;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.health = this.player.maxHealth; // Restore full health on respawn
            this.player.invincible = false;
            this.player.invincibleTime = 0;

            // Show respawn message
            this.showLevelMessage(`Lives remaining: ${this.currentLives}`);
        } else {
            // No lives left, restart from beginning of level
            this.gameOver('Out of lives! Starting level from beginning...');
            setTimeout(() => {
                // Stay on same level - reset from beginning
                this.createLevel(this.currentLevel);
                this.player = new Player(100, 400, this);
                this.gameState = 'playing';
                document.getElementById('gameOver').style.display = 'none';
            }, 2000);
        }
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.log('Audio not supported in this browser');
            return;
        }
    }

    playSound(type, frequency = 440, duration = 0.1, volume = 0.1) {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        switch (type) {
            case 'shoot':
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                oscillator.type = 'square';
                break;
            case 'jump':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
                oscillator.type = 'sine';
                break;
            case 'hit':
                oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(volume * 1.5, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sawtooth';
                break;
            case 'enemy_death':
                oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
                oscillator.type = 'square';
                break;
            case 'collect':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                break;
            case 'checkpoint':
                oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(750, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
                oscillator.type = 'triangle';
                break;
            case 'level_complete':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.3);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
                oscillator.type = 'triangle';
                break;
            case 'plate_activate':
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(volume * 0.7, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                break;
            default:
                oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                oscillator.type = 'sine';
        }

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + (duration || 0.3));
    }

    createLevel(level) {
        // Clear existing objects
        this.platforms = [];
        this.traps = [];
        this.gates = [];
        this.plates = [];
        this.potions = [];
        this.checkpoints = [];
        this.enemies = [];
        this.projectiles = [];

        // Reset combat stats
        this.ammo = this.maxAmmo;
        this.shootCooldown = 0;

        // Reset lives for new level
        this.currentLives = this.livesPerLevel;
        this.lastCheckpointPosition = {x: 100, y: 400};

        if (level === 1) {
            this.createLevel1();
        } else if (level === 2) {
            this.createLevel2();
        } else if (level === 3) {
            this.createLevel3();
        } else if (level === 4) {
            this.createLevel4();
        } else if (level === 5) {
            this.createLevel5();
        }
    }

    createLevel1() {
        // Create platforms
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40), // Ground
            new Platform(200, 500, 200, 20),
            new Platform(500, 400, 150, 20),
            new Platform(300, 300, 100, 20),
            new Platform(600, 250, 120, 20),
            new Platform(100, 200, 80, 20),
            new Platform(680, 150, 100, 20),
        ];

        // Create spike traps
        this.traps = [
            new SpikeTrap(250, 480, 3000, 1000), // x, y, cycle time, active time
            new SpikeTrap(550, 380, 2500, 800),
            new SlicerTrap(350, 280, 4000, 500),
        ];

        // Create pressure plate and gate
        this.plates = [
            new PressurePlate(320, 280, 'red'),
        ];

        this.gates = [
            new Gate(650, 100, 100, 'red'), // blocks the exit
        ];

        // Create potions
        this.potions = [
            new HealthPotion(520, 380),
            new HealthPotion(120, 180),
        ];

        // Create checkpoints (including mid-level checkpoints)
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 1),
            new Checkpoint(320, 260, 'mid1'), // Mid-level checkpoint
            new Checkpoint(720, 130, 'next'), // Level transition checkpoint
        ];

        // Create enemies for Level 1 (tutorial enemies)
        this.enemies = [
            new PatrolEnemy(450, this.height - 60, 500, 650), // Patrol between platforms
            new BasicGuard(150, 480),
        ];
    }

    createLevel2() {
        // Create more challenging Level 2 platforms
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40), // Ground
            new Platform(150, 480, 100, 20),
            new Platform(350, 450, 80, 20),
            new Platform(550, 400, 100, 20),
            new Platform(200, 350, 60, 20),
            new Platform(450, 300, 80, 20),
            new Platform(100, 250, 70, 20),
            new Platform(300, 200, 90, 20),
            new Platform(500, 150, 100, 20),
            new Platform(650, 100, 120, 20),
        ];

        // More challenging traps
        this.traps = [
            new SpikeTrap(180, 460, 2000, 800),
            new SpikeTrap(380, 430, 2500, 900),
            new SpikeTrap(230, 330, 3000, 1000),
            new SlicerTrap(480, 280, 3500, 600),
            new SlicerTrap(130, 230, 4000, 700),
        ];

        // Two-plate puzzle
        this.plates = [
            new PressurePlate(320, 180, 'blue'),
            new PressurePlate(520, 130, 'green'),
        ];

        this.gates = [
            new Gate(400, 50, 80, 'blue'),   // First gate
            new Gate(600, 50, 80, 'green'),  // Second gate - blocks final exit
        ];

        // Fewer potions - more challenging
        this.potions = [
            new HealthPotion(380, 430),
            new HealthPotion(680, 80),
        ];

        // Checkpoints (including mid-level checkpoints)
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 2),
            new Checkpoint(320, 160, 'mid2'), // Mid-level checkpoint
            new Checkpoint(520, 110, 'mid3'), // Another checkpoint
            new Checkpoint(720, 60, 'next'), // Go to Level 3
        ];

        // Create enemies for Level 2 (moderate challenge)
        this.enemies = [
            new PatrolEnemy(180, 460, 150, 250), // Short patrol
            new PatrolEnemy(380, 430, 350, 450), // Medium patrol
            new ChaseEnemy(130, 230, 150), // Chase player when nearby
            new BasicGuard(520, 130), // Stationary guard
            new PatrolEnemy(300, 180, 250, 400), // Platform patrol
        ];
    }

    createLevel3() {
        // Final challenging level
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40), // Ground
            new Platform(100, 500, 80, 20),
            new Platform(250, 450, 60, 20),
            new Platform(400, 400, 70, 20),
            new Platform(550, 350, 80, 20),
            new Platform(150, 300, 60, 20),
            new Platform(350, 250, 90, 20),
            new Platform(500, 200, 70, 20),
            new Platform(200, 150, 80, 20),
            new Platform(600, 100, 150, 20),
        ];

        // Moderately challenging traps (made easier)
        this.traps = [
            new SpikeTrap(120, 480, 2500, 800), // Longer cycle, shorter active time
            new SpikeTrap(270, 430, 3000, 900),
            new SpikeTrap(570, 330, 2800, 700),
            new SlicerTrap(170, 280, 3500, 600), // Longer cycle, shorter active time
            new SlicerTrap(370, 230, 4000, 700),
            new SlicerTrap(520, 180, 3500, 650),
        ];

        // Final puzzle - three plates
        this.plates = [
            new PressurePlate(170, 125, 'red'),
            new PressurePlate(230, 130, 'blue'),
            new PressurePlate(520, 180, 'green'),
        ];

        this.gates = [
            new Gate(650, 50, 50, 'red'),
            new Gate(700, 50, 50, 'blue'),
            new Gate(750, 50, 50, 'green'), // Final exit
        ];

        // More potions to make it easier
        this.potions = [
            new HealthPotion(420, 380),
            new HealthPotion(200, 130), // Added extra health potion
        ];

        // Final checkpoints (including mid-level checkpoints)
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 3),
            new Checkpoint(170, 280, 'mid4'), // Mid-level checkpoint
            new Checkpoint(350, 230, 'mid5'), // Another checkpoint
            new Checkpoint(770, 80, 'next'), // Go to Level 4
        ];

        // Challenging enemies for final level
        this.enemies = [
            new PatrolEnemy(120, 480, 100, 180), // Ground patrol
            new PatrolEnemy(270, 430, 250, 310), // Platform patrol
            new ChaseEnemy(570, 330, 120), // Aggressive chaser
            new BasicGuard(170, 130), // Guard the first plate
            new BasicGuard(230, 130), // Guard the second plate
            new PatrolEnemy(350, 230, 300, 440), // Mid-level patrol
            new ChaseEnemy(200, 130, 100), // Final area chaser
        ];
    }

    createLevel4() {
        // Advanced level with moving platforms and complex traps
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40), // Ground
            new Platform(80, 520, 60, 20),
            new Platform(200, 460, 50, 20),
            new Platform(320, 400, 60, 20),
            new Platform(460, 350, 50, 20),
            new Platform(580, 300, 70, 20),
            new Platform(120, 250, 50, 20),
            new Platform(300, 200, 60, 20),
            new Platform(500, 150, 50, 20),
            new Platform(650, 100, 130, 20),
        ];

        // Intense trap layout
        this.traps = [
            new SpikeTrap(100, 500, 1200, 500),
            new SpikeTrap(220, 440, 1400, 600),
            new SpikeTrap(480, 330, 1300, 550),
            new SlicerTrap(140, 230, 2000, 400),
            new SlicerTrap(320, 180, 2200, 450),
            new SlicerTrap(520, 130, 1800, 400),
            new SpikeTrap(600, 280, 1500, 650),
        ];

        // Complex multi-color puzzle
        this.plates = [
            new PressurePlate(140, 230, 'red'),
            new PressurePlate(320, 180, 'blue'),
            new PressurePlate(520, 130, 'green'),
            new PressurePlate(680, 80, 'red'), // Second red plate
        ];

        this.gates = [
            new Gate(600, 50, 40, 'red'),
            new Gate(650, 50, 40, 'blue'),
            new Gate(700, 50, 40, 'green'),
            new Gate(750, 50, 40, 'red'), // Final gate
        ];

        // Sparse potions for high difficulty
        this.potions = [
            new HealthPotion(340, 380),
            new HealthPotion(680, 80),
        ];

        // Checkpoints
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 4),
            new Checkpoint(140, 210, 'mid6'), // Mid-level checkpoint
            new Checkpoint(520, 110, 'mid7'), // Another checkpoint
            new Checkpoint(770, 80, 'next'), // Go to Level 5
        ];

        // High-level enemies
        this.enemies = [
            new PatrolEnemy(100, 500, 80, 140), // Ground patrol
            new PatrolEnemy(220, 440, 200, 270), // Platform patrol
            new ChaseEnemy(480, 330, 100), // Aggressive chaser
            new BasicGuard(140, 210), // Guard the first plate
            new PatrolEnemy(300, 180, 250, 360), // Mid-level patrol
            new ChaseEnemy(520, 110, 80), // Final area chaser
            new BasicGuard(680, 60), // Final guard
            new PatrolEnemy(650, 80, 600, 700), // Final patrol
        ];
    }

    createLevel5() {
        // Final boss-like level with extreme difficulty
        this.platforms = [
            new Platform(0, this.height - 40, this.width, 40), // Ground
            new Platform(60, 540, 40, 20),
            new Platform(160, 480, 40, 20),
            new Platform(280, 420, 50, 20),
            new Platform(400, 360, 40, 20),
            new Platform(540, 300, 50, 20),
            new Platform(120, 240, 40, 20),
            new Platform(280, 180, 50, 20),
            new Platform(450, 120, 40, 20),
            new Platform(600, 80, 40, 20),
            new Platform(680, 40, 100, 20), // Final platform
        ];

        // Maximum difficulty traps
        this.traps = [
            new SpikeTrap(80, 520, 1000, 400),
            new SpikeTrap(180, 460, 1100, 450),
            new SpikeTrap(300, 400, 1200, 500),
            new SpikeTrap(560, 280, 1000, 400),
            new SlicerTrap(140, 220, 1500, 300),
            new SlicerTrap(300, 160, 1600, 350),
            new SlicerTrap(470, 100, 1400, 300),
            new SpikeTrap(420, 340, 1300, 550),
            new SpikeTrap(140, 220, 1800, 700),
        ];

        // Final complex puzzle requiring all colors
        this.plates = [
            new PressurePlate(140, 220, 'red'),
            new PressurePlate(300, 160, 'blue'),
            new PressurePlate(470, 100, 'green'),
            new PressurePlate(620, 60, 'red'), // Multi-activation required
            new PressurePlate(700, 20, 'blue'), // Final plate
        ];

        this.gates = [
            new Gate(720, 20, 20, 'red'),
            new Gate(740, 20, 20, 'blue'),
            new Gate(760, 20, 20, 'green'),
        ];

        // Single health potion - ultimate challenge
        this.potions = [
            new HealthPotion(300, 140),
        ];

        // Final checkpoints
        this.checkpoints = [
            new Checkpoint(50, this.height - 80, 5),
            new Checkpoint(280, 140, 'mid8'), // Mid-level checkpoint
            new Checkpoint(770, 20, 'win'), // Win the game
        ];

        // Boss-level enemy arrangement
        this.enemies = [
            new PatrolEnemy(80, 520, 60, 100), // Ground patrol
            new ChaseEnemy(180, 460, 80), // Aggressive chaser
            new PatrolEnemy(300, 400, 280, 330), // Platform patrol
            new BasicGuard(140, 200), // Guard the first plate
            new ChaseEnemy(420, 340, 100), // Mid-level chaser
            new PatrolEnemy(280, 160, 230, 330), // Puzzle guard patrol
            new BasicGuard(470, 80), // Puzzle guard
            new ChaseEnemy(560, 260, 120), // Final area chaser
            new BasicGuard(620, 40), // Final approach guard
            new PatrolEnemy(680, 20, 650, 730), // Final boss patrol
        ];
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;

            if (e.key.toLowerCase() === 'r') {
                this.restartGame();
            }

            // Handle shooting with X key
            if (e.key.toLowerCase() === 'x' && this.gameState === 'playing') {
                // Shoot forward based on player direction
                const shootDirection = this.player.lastDirection || 1;
                this.shootProjectile(
                    this.player.x + this.player.width/2 + shootDirection * 50,
                    this.player.y + this.player.height/2
                );
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });

        // Mouse controls for shooting
        this.canvas.addEventListener('click', (e) => {
            if (this.gameState === 'playing') {
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                this.shootProjectile(mouseX, mouseY);
            }
        });
    }

    shootProjectile(targetX, targetY) {
        if (this.shootCooldown <= 0 && this.ammo > 0) {
            const playerCenterX = this.player.x + this.player.width / 2;
            const playerCenterY = this.player.y + this.player.height / 2;

            const dx = targetX - playerCenterX;
            const dy = targetY - playerCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                const speed = 600;
                const vx = (dx / distance) * speed;
                const vy = (dy / distance) * speed;

                this.projectiles.push(new Projectile(playerCenterX, playerCenterY, vx, vy));
                this.ammo--;
                this.shootCooldown = this.maxShootCooldown;

                // Muzzle flash effect and sound
                this.addParticles(playerCenterX, playerCenterY, '#FFD700', 3);
                this.playSound('shoot');
            }
        }
    }

    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        // Update timer
        this.timeRemaining -= deltaTime;
        if (this.timeRemaining <= 0) {
            this.gameOver('Time ran out!');
            return;
        }

        // Update game objects
        this.player.update(deltaTime, this);
        this.traps.forEach(trap => trap.update(deltaTime));
        this.plates.forEach(plate => plate.update(deltaTime)); // Update pressure plates
        this.gates.forEach(gate => gate.update(deltaTime));
        this.enemies.forEach(enemy => enemy.update(deltaTime, this));
        this.projectiles.forEach(projectile => projectile.update(deltaTime, this));
        this.particles.forEach(particle => particle.update(deltaTime));

        // Update combat cooldowns
        if (this.shootCooldown > 0) {
            this.shootCooldown -= deltaTime;
        }

        // Remove dead objects
        this.particles = this.particles.filter(p => p.life > 0);
        this.projectiles = this.projectiles.filter(p => p.active);
        this.enemies = this.enemies.filter(e => e.health > 0);

        // Check collisions
        this.checkCollisions();

        // Update UI
        this.updateUI();
    }

    checkCollisions() {
        // Enhanced Platform collisions for player
        this.platforms.forEach(platform => {
            if (this.player.collidesWith(platform)) {
                // Landing on top of platform
                if (this.player.vy > 0 && this.player.y + this.player.height - 10 < platform.y) {
                    this.player.y = platform.y - this.player.height;
                    this.player.vy = 0;
                    this.player.grounded = true;
                    this.player.canJump = true;
                }
                // Hitting platform from below
                else if (this.player.vy < 0 && this.player.y > platform.y + platform.height - 10) {
                    this.player.y = platform.y + platform.height;
                    this.player.vy = 0;
                }
                // Hitting platform from sides
                else if (this.player.vx > 0 && this.player.x < platform.x) {
                    this.player.x = platform.x - this.player.width;
                    this.player.vx = 0;
                }
                else if (this.player.vx < 0 && this.player.x + this.player.width > platform.x + platform.width) {
                    this.player.x = platform.x + platform.width;
                    this.player.vx = 0;
                }
            }
        });

        // Enemy collisions with platforms
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

        // Trap collisions
        this.traps.forEach(trap => {
            if (trap.isActive && this.player.collidesWith(trap)) {
                this.player.takeDamage();
                this.playSound('hit');
            }
        });

        // Pressure plate collisions
        this.plates.forEach(plate => {
            if (this.player.collidesWith(plate)) {
                if (!plate.isPressed) {
                    this.playSound('plate_activate');
                }
                plate.activate();
            } else {
                plate.deactivate();
            }

            // Update matching gates based on shouldKeepOpen status
            this.gates.forEach(gate => {
                if (gate.channel === plate.channel) {
                    if (plate.shouldKeepOpen()) {
                        gate.open();
                    } else {
                        gate.close();
                    }
                }
            });
        });

        // Gate collisions (block player)
        this.gates.forEach(gate => {
            if (!gate.isOpen && this.player.collidesWith(gate)) {
                // Push player back
                if (this.player.x < gate.x) {
                    this.player.x = gate.x - this.player.width;
                } else {
                    this.player.x = gate.x + gate.width;
                }
                this.player.vx = 0;
            }
        });

        // Potion collisions (use filter to avoid mutation during iteration)
        this.potions = this.potions.filter(potion => {
            if (potion.active && this.player.collidesWith(potion)) {
                potion.collect();
                this.player.heal();
                this.addParticles(potion.x, potion.y, '#4ECDC4', 8);
                this.playSound('collect');
                return false;
            }
            return true;
        });

        // Player-Enemy collisions
        this.enemies.forEach(enemy => {
            if (this.player.collidesWith(enemy) && !enemy.isDying) {
                this.player.takeDamage();
                this.playSound('hit');
                // Knock player back
                const pushDirection = this.player.x < enemy.x ? -1 : 1;
                this.player.vx += pushDirection * 200;
            }
        });

        // Projectile collisions
        this.projectiles.forEach((projectile, pIndex) => {
            // Projectile vs platforms
            this.platforms.forEach(platform => {
                if (projectile.collidesWith(platform)) {
                    projectile.active = false;
                    this.addParticles(projectile.x, projectile.y, '#FFD93D', 2);
                }
            });

            // Projectile vs enemies
            this.enemies.forEach((enemy, eIndex) => {
                if (projectile.collidesWith(enemy) && !enemy.isDying) {
                    projectile.active = false;
                    enemy.takeDamage(1);
                    this.playerScore += 10;
                    this.addParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#FF6B6B', 5);

                    if (enemy.health <= 0) {
                        enemy.isDying = true;
                        this.playerScore += 50;
                        this.addParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#FFD700', 10);
                        this.playSound('enemy_death');
                    }
                }
            });
        });

        // Checkpoint collisions
        this.checkpoints.forEach(checkpoint => {
            if (this.player.collidesWith(checkpoint)) {
                if (checkpoint.floor === 'next' && !checkpoint.activated) {
                    // Advance to next level
                    this.playSound('level_complete');
                    this.advanceLevel();
                } else if (checkpoint.floor === 'win' && !checkpoint.activated) {
                    // Win condition
                    this.playSound('level_complete');
                    this.gameWin();
                } else if (!checkpoint.activated) {
                    this.playSound('checkpoint');
                    // Save checkpoint position
                    this.lastCheckpointPosition = {x: checkpoint.x + checkpoint.width/2, y: checkpoint.y};
                }
                checkpoint.activate();
            }
        });
    }

    addParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    render() {
        // Enhanced background with parallax effect
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);

        // Dynamic sky colors based on level
        if (this.currentLevel <= 2) {
            skyGradient.addColorStop(0, '#87CEEB'); // Sky blue
            skyGradient.addColorStop(0.6, '#DDA0DD'); // Plum
            skyGradient.addColorStop(1, '#98FB98'); // Pale green
        } else if (this.currentLevel === 3) {
            skyGradient.addColorStop(0, '#4B0082'); // Indigo
            skyGradient.addColorStop(0.6, '#8A2BE2'); // Blue violet
            skyGradient.addColorStop(1, '#2F4F4F'); // Dark slate gray
        } else {
            skyGradient.addColorStop(0, '#2F1B14'); // Dark brown
            skyGradient.addColorStop(0.6, '#8B0000'); // Dark red
            skyGradient.addColorStop(1, '#1C1C1C'); // Very dark gray
        }

        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Add floating particles for atmosphere
        this.renderAtmosphericParticles();

        // Draw enhanced platforms with texture and shading
        this.platforms.forEach(platform => {
            // Platform base
            this.ctx.fillStyle = '#8B4513';
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

            // Top surface with gradient
            const platformGradient = this.ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.height);
            platformGradient.addColorStop(0, '#D2B48C');
            platformGradient.addColorStop(0.3, '#A0522D');
            platformGradient.addColorStop(1, '#654321');
            this.ctx.fillStyle = platformGradient;
            this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

            // Stone texture effect
            for (let i = 0; i < platform.width; i += 8) {
                for (let j = 0; j < platform.height; j += 8) {
                    if (Math.random() > 0.7) {
                        this.ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
                        this.ctx.fillRect(platform.x + i, platform.y + j, 4, 4);
                    }
                }
            }

            // Platform edge highlight
            this.ctx.fillStyle = '#F4A460';
            this.ctx.fillRect(platform.x, platform.y, platform.width, 2);
        });

        // Draw gates
        this.gates.forEach(gate => gate.render(this.ctx));

        // Draw pressure plates
        this.plates.forEach(plate => plate.render(this.ctx));

        // Draw traps
        this.traps.forEach(trap => trap.render(this.ctx));

        // Draw potions
        this.potions.forEach(potion => potion.render(this.ctx));

        // Draw enemies
        this.enemies.forEach(enemy => enemy.render(this.ctx));

        // Draw checkpoints
        this.checkpoints.forEach(checkpoint => checkpoint.render(this.ctx));

        // Draw projectiles
        this.projectiles.forEach(projectile => projectile.render(this.ctx));

        // Draw particles
        this.particles.forEach(particle => particle.render(this.ctx));

        // Draw shadows for depth
        this.renderShadows();

        // Draw player
        this.player.render(this.ctx);
    }

    updateUI() {
        // Update hearts
        const heartsElement = document.getElementById('hearts');
        let heartsDisplay = '';
        for (let i = 0; i < this.player.maxHealth; i++) {
            heartsDisplay += i < this.player.health ? '❤️' : '🖤';
        }
        heartsElement.textContent = heartsDisplay;

        // Update timer
        const timerElement = document.getElementById('timer');
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = Math.floor(this.timeRemaining % 60);
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Change color based on time remaining
        if (this.timeRemaining < 60) {
            timerElement.style.color = '#FF6B6B';
        } else if (this.timeRemaining < 120) {
            timerElement.style.color = '#FFD93D';
        }

        // Update floor
        const floorElement = document.getElementById('floor');
        floorElement.textContent = this.currentLevel;

        // Update score
        const scoreElement = document.getElementById('score');
        if (scoreElement) {
            scoreElement.textContent = this.playerScore;
        }

        // Update ammo
        const ammoElement = document.getElementById('ammo');
        if (ammoElement) {
            ammoElement.textContent = `${this.ammo}/${this.maxAmmo}`;
        }

        // Update lives
        const livesElement = document.getElementById('lives');
        if (livesElement) {
            livesElement.textContent = this.currentLives;
        }
    }

    gameOver(reason) {
        this.gameState = 'gameOver';
        document.getElementById('gameOverReason').textContent = reason;
        document.getElementById('gameOver').style.display = 'block';
    }

    advanceLevel() {
        this.currentLevel++;
        if (this.currentLevel > this.maxLevel) {
            this.gameWin();
            return;
        }

        // Reset player position
        this.player.x = 100;
        this.player.y = 400;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.grounded = false;

        // Create new level
        this.createLevel(this.currentLevel);

        // Level transition particles
        this.addParticles(this.width / 2, this.height / 2, '#FFD93D', 15);

        // Show level transition message briefly
        this.showLevelMessage(`Level ${this.currentLevel}!`);
    }

    showLevelMessage(message) {
        // Create temporary message display
        const messageDiv = document.createElement('div');
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '50%';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translate(-50%, -50%)';
        messageDiv.style.background = 'rgba(255, 215, 0, 0.9)';
        messageDiv.style.color = '#1e3c72';
        messageDiv.style.padding = '20px 40px';
        messageDiv.style.borderRadius = '15px';
        messageDiv.style.fontSize = '24px';
        messageDiv.style.fontWeight = 'bold';
        messageDiv.style.zIndex = '1000';
        messageDiv.style.border = '3px solid #FFA500';
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            document.body.removeChild(messageDiv);
        }, 2000);
    }

    gameWin() {
        this.gameState = 'gameWon';
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = Math.floor(this.timeRemaining % 60);
        document.getElementById('completionTime').textContent =
            `Time Remaining: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('gameWin').style.display = 'block';

        // Victory particles
        this.addParticles(this.width / 2, this.height / 2, '#FFD700', 20);
    }

    restartGame() {
        this.gameState = 'playing';
        this.timeRemaining = this.gameTime;
        this.currentLevel = 1;
        this.player = new Player(100, 400, this);
        this.particles = [];

        // Recreate level 1
        this.createLevel(1);

        // Hide UI panels
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('gameWin').style.display = 'none';
    }

    gameLoop(currentTime = 0) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

// Player class
class Player {
    constructor(x, y, gameRef) {
        this.game = gameRef;
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 32;
        this.vx = 0;
        this.vy = 0;
        this.speed = 200;
        this.jumpPower = 400;
        this.grounded = false;
        this.canJump = true;
        this.health = 5;
        this.maxHealth = 5;
        this.invincible = false;
        this.invincibleTime = 0;
        this.crouching = false;
        this.rolling = false;
        this.rollTime = 0;
        this.lastDirection = 1; // Track facing direction

        // Animation properties
        this.animationTime = 0;
        this.currentFrame = 0;
        this.animationSpeed = 0.2; // seconds per frame
    }

    update(deltaTime, game) {
        // Handle input
        this.handleInput(game.keys, deltaTime);

        // Apply physics
        this.vy += game.gravity * 600 * deltaTime; // gravity

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Apply friction when grounded
        if (this.grounded) {
            this.vx *= game.friction;
        }

        // Update timers
        if (this.invincible) {
            this.invincibleTime -= deltaTime;
            if (this.invincibleTime <= 0) {
                this.invincible = false;
            }
        }

        if (this.rolling) {
            this.rollTime -= deltaTime;
            if (this.rollTime <= 0) {
                this.rolling = false;
                this.height = 32;
            }
        }

        // Update animation
        this.animationTime += deltaTime;
        if (this.animationTime >= this.animationSpeed) {
            this.animationTime = 0;
            this.currentFrame = (this.currentFrame + 1) % 4; // 4 frame animation cycle
        }

        // Reset grounded (will be set by collision detection)
        this.grounded = false;

        // Boundary checks
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > game.width) this.x = game.width - this.width;
        if (this.y > this.game.height) {
            // Player fell off screen - instant death
            this.health = 1;
            this.takeDamage();
        }
    }

    handleInput(keys, deltaTime) {
        // Horizontal movement
        if (keys['a'] || keys['arrowleft']) {
            this.vx -= this.speed * 4 * deltaTime;
            this.lastDirection = -1;
        }
        if (keys['d'] || keys['arrowright']) {
            this.vx += this.speed * 4 * deltaTime;
            this.lastDirection = 1;
        }

        // Jumping
        if ((keys['w'] || keys['arrowup']) && this.canJump && this.grounded) {
            this.vy = -this.jumpPower;
            this.canJump = false;
            this.grounded = false;
            if (this.game) {
                this.game.playSound('jump');
            }
        }

        // Crouching
        if (keys['s'] || keys['arrowdown']) {
            this.crouching = true;
            this.height = 22;
        } else {
            this.crouching = false;
            if (!this.rolling) {
                this.height = 32;
            }
        }

        // Rolling
        if (keys[' '] && this.grounded && !this.rolling) {
            this.rolling = true;
            this.rollTime = 0.5;
            this.height = 15;
            this.vx = this.vx > 0 ? 300 : -300;
        }

        // Shooting with X key handled in main game loop
        // This is now handled by click events in the main game class

        // Clamp horizontal velocity
        this.vx = Math.max(-300, Math.min(300, this.vx));
    }

    takeDamage() {
        if (this.invincible) return;

        this.health--;
        this.invincible = true;
        this.invincibleTime = 1.5;

        if (this.health <= 0) {
            if (this.game) {
                this.game.handlePlayerDeath();
            }
        }
    }

    heal() {
        this.health = Math.min(this.maxHealth, this.health + 1);
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    render(ctx) {
        // Draw player with invincibility flashing
        if (this.invincible && Math.floor(Date.now() / 100) % 2) {
            ctx.globalAlpha = 0.5;
        }

        // Prince body (royal blue)
        ctx.fillStyle = '#4169E1';
        ctx.fillRect(this.x + 4, this.y + 10, this.width - 8, this.height - 14);

        // Prince head (skin tone)
        ctx.fillStyle = '#FDBCB4';
        ctx.fillRect(this.x + 6, this.y + 4, this.width - 12, 12);

        // Crown
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x + 5, this.y, this.width - 10, 6);
        // Crown jewels
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x + 8, this.y + 1, 2, 2);
        ctx.fillRect(this.x + 14, this.y + 1, 2, 2);

        // Cape (animated based on movement and frame)
        const capeOffset = this.rolling ? 0 : (Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame) * 2 : 0);
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(this.x - 2 + capeOffset, this.y + 8, 4, this.height - 10);

        // Arms (moving animation)
        ctx.fillStyle = '#FDBCB4';
        if (!this.crouching && !this.rolling) {
            const armOffset = Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame * 2) * 2 : 0;
            ctx.fillRect(this.x + 1, this.y + 12 + armOffset, 3, 8);
            ctx.fillRect(this.x + this.width - 4, this.y + 12 - armOffset, 3, 8);
        }

        // Legs (walking animation)
        ctx.fillStyle = '#4169E1';
        if (!this.crouching && !this.rolling) {
            const legOffset = Math.abs(this.vx) > 50 ? Math.sin(this.currentFrame * 3) * 1.5 : 0;
            ctx.fillRect(this.x + 6, this.y + this.height - 8 + legOffset, 4, 8);
            ctx.fillRect(this.x + 14, this.y + this.height - 8 - legOffset, 4, 8);
        }

        // Eyes
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x + 8, this.y + 8, 1, 1);
        ctx.fillRect(this.x + 15, this.y + 8, 1, 1);

        // Face direction indicator (nose)
        ctx.fillStyle = '#FDBCB4';
        if (this.lastDirection > 0) {
            ctx.fillRect(this.x + 16, this.y + 10, 1, 2);
        } else {
            ctx.fillRect(this.x + 7, this.y + 10, 1, 2);
        }

        // Special states
        if (this.rolling) {
            // Rolling effect - draw spinning motion
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            const spinOffset = this.currentFrame * 2;
            ctx.fillRect(this.x - 2, this.y + spinOffset, this.width + 4, 2);
            ctx.fillRect(this.x + spinOffset, this.y - 2, 2, this.height + 4);
        }

        ctx.globalAlpha = 1;
    }
}

// Platform class
class Platform {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

// SpikeTrap class
class SpikeTrap {
    constructor(x, y, cycleTime, activeTime) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 20;
        this.cycleTime = cycleTime / 1000; // convert to seconds
        this.activeTime = activeTime / 1000;
        this.timer = 0;
        this.isActive = false;
        this.warningTime = 1;
        this.isWarning = false;
    }

    update(deltaTime) {
        this.timer += deltaTime;

        if (this.timer >= this.cycleTime) {
            this.timer = 0;
        }

        this.isWarning = this.timer >= (this.cycleTime - this.warningTime) && this.timer < this.cycleTime;
        this.isActive = this.timer < this.activeTime;
    }

    reset() {
        this.timer = 0;
        this.isActive = false;
        this.isWarning = false;
    }

    render(ctx) {
        if (this.isActive) {
            ctx.fillStyle = '#FF1744';
            // Draw spikes
            for (let i = 0; i < this.width; i += 8) {
                ctx.beginPath();
                ctx.moveTo(this.x + i, this.y + this.height);
                ctx.lineTo(this.x + i + 4, this.y);
                ctx.lineTo(this.x + i + 8, this.y + this.height);
                ctx.closePath();
                ctx.fill();
            }
        } else if (this.isWarning) {
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(this.x, this.y + this.height - 5, this.width, 5);
            // Blinking effect
            if (Math.floor(Date.now() / 200) % 2) {
                ctx.fillStyle = '#FF1744';
                ctx.fillRect(this.x, this.y + this.height - 3, this.width, 3);
            }
        }
    }
}

// SlicerTrap class
class SlicerTrap {
    constructor(x, y, cycleTime, activeTime) {
        this.x = x;
        this.y = y - 100;
        this.width = 60;
        this.height = 100;
        this.cycleTime = cycleTime / 1000;
        this.activeTime = activeTime / 1000;
        this.timer = 0;
        this.isActive = false;
        this.bladeY = this.y;
        this.baseBladeY = this.y;
    }

    update(deltaTime) {
        this.timer += deltaTime;

        if (this.timer >= this.cycleTime) {
            this.timer = 0;
        }

        this.isActive = this.timer < this.activeTime;

        if (this.isActive) {
            // Blade drops down
            this.bladeY = this.baseBladeY + (this.timer / this.activeTime) * 100;
        } else {
            // Blade retracts
            this.bladeY = this.baseBladeY;
        }
    }

    reset() {
        this.timer = 0;
        this.isActive = false;
        this.bladeY = this.baseBladeY;
    }

    render(ctx) {
        // Draw blade track
        ctx.fillStyle = '#666';
        ctx.fillRect(this.x + this.width/2 - 2, this.baseBladeY, 4, 100);

        // Draw blade
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(this.x, this.bladeY, this.width, 20);

        // Warning indicator
        if (!this.isActive && this.timer > this.cycleTime - 1) {
            ctx.fillStyle = '#FF6B6B';
            ctx.fillRect(this.x - 10, this.baseBladeY - 10, this.width + 20, 10);
        }
    }

    collidesWith(player) {
        return this.isActive &&
               player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.bladeY + 20 &&
               player.y + player.height > this.bladeY;
    }
}

// PressurePlate class
class PressurePlate {
    constructor(x, y, channel) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 10;
        this.channel = channel;
        this.isPressed = false;
        this.timer = 0;
        this.openTime = 8; // Keep gate open for 8 seconds after stepping off
    }

    activate() {
        this.isPressed = true;
        this.timer = this.openTime; // Reset timer when stepped on
    }

    deactivate() {
        this.isPressed = false;
        // Timer will continue counting down
    }

    update(deltaTime) {
        // Count down timer when not pressed
        if (!this.isPressed && this.timer > 0) {
            this.timer -= deltaTime;
        }
    }

    // Check if plate should keep gates open
    shouldKeepOpen() {
        return this.isPressed || this.timer > 0;
    }

    reset() {
        this.isPressed = false;
        this.timer = 0;
    }

    render(ctx) {
        // Simple platform appearance - no more checkbox look
        let plateColor;
        if (this.isPressed) {
            // Bright color when standing on it
            if (this.channel === 'red') plateColor = '#FF6B6B';
            else if (this.channel === 'blue') plateColor = '#4169E1';
            else if (this.channel === 'green') plateColor = '#32CD32';
            else plateColor = '#4ECDC4';
        } else if (this.timer > 0) {
            // Dimmer color when gate is still open but not standing on it
            if (this.channel === 'red') plateColor = '#8B3A3A';
            else if (this.channel === 'blue') plateColor = '#1C4F8B';
            else if (this.channel === 'green') plateColor = '#228B22';
            else plateColor = '#2C8B8B';
        } else {
            // Gray when inactive
            plateColor = '#666';
        }

        // Draw the pressure plate as a simple colored platform
        ctx.fillStyle = plateColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Add a slight border to make it visible
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// Gate class
class Gate {
    constructor(x, y, height, channel) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = height;
        this.channel = channel;
        this.isOpen = false;
        this.baseHeight = height;
        this.currentHeight = height;
    }

    open() {
        this.isOpen = true;
    }

    close() {
        this.isOpen = false;
    }

    update(deltaTime) {
        const targetHeight = this.isOpen ? 0 : this.baseHeight;
        this.currentHeight += (targetHeight - this.currentHeight) * 5 * deltaTime;
    }

    reset() {
        this.isOpen = false;
        this.currentHeight = this.baseHeight;
    }

    render(ctx) {
        if (this.currentHeight > 1) {
            let gateColor = '#4ECDC4';
            if (this.channel === 'red') gateColor = '#8B0000';
            else if (this.channel === 'blue') gateColor = '#000080';
            else if (this.channel === 'green') gateColor = '#006400';

            ctx.fillStyle = gateColor;
            ctx.fillRect(this.x, this.y + this.baseHeight - this.currentHeight, this.width, this.currentHeight);

            // Draw gate pattern
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            for (let i = 0; i < this.currentHeight; i += 10) {
                ctx.fillRect(this.x + 2, this.y + this.baseHeight - this.currentHeight + i, this.width - 4, 2);
            }
        }
    }

    collidesWith(player) {
        return this.currentHeight > 10 &&
               player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.y + this.baseHeight &&
               player.y + player.height > this.y + this.baseHeight - this.currentHeight;
    }
}

// HealthPotion class
///// Make the helth last longer
class HealthPotion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 15;
        this.height = 20;
        this.active = true;
        this.bobOffset = Math.random() * Math.PI * 2;
    }

    collect() {
        this.active = false;
    }

    render(ctx) {
        if (!this.active) return;

        const bob = Math.sin(Date.now() / 500 + this.bobOffset) * 3;

        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(this.x, this.y + bob, this.width, this.height);

        // Draw cross
        ctx.fillStyle = 'white';
        ctx.fillRect(this.x + 6, this.y + bob + 5, 3, 10);
        ctx.fillRect(this.x + 3, this.y + bob + 8, 9, 3);

        // Glow effect
        ctx.shadowColor = '#FF6B6B';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.fillRect(this.x - 2, this.y + bob - 2, this.width + 4, this.height + 4);
        ctx.shadowBlur = 0;
    }
}

// Checkpoint class
class Checkpoint {
    constructor(x, y, floor) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 40;
        this.floor = floor;
        this.activated = false;
    }

    activate() {
        if (!this.activated) {
            this.activated = true;
        }
    }

    reset() {
        this.activated = false;
    }

    render(ctx) {
        ctx.fillStyle = this.activated ? '#4ECDC4' : '#666';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Draw flame/crystal effect
        if (this.activated) {
            const flicker = Math.sin(Date.now() / 100) * 2;
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(this.x + this.width/2, this.y);
            ctx.lineTo(this.x + this.width/2 - 8, this.y - 15 + flicker);
            ctx.lineTo(this.x + this.width/2 + 8, this.y - 15 + flicker);
            ctx.closePath();
            ctx.fill();
        }

        // Draw floor number or symbol
        ctx.fillStyle = 'white';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';

        if (this.floor === 'next') {
            ctx.fillText('→', this.x + this.width/2, this.y + this.height/2 + 4);
        } else if (this.floor === 'win') {
            ctx.fillText('WIN', this.x + this.width/2, this.y + this.height/2 + 4);
        } else if (typeof this.floor === 'string' && this.floor.startsWith('mid')) {
            ctx.fillText('✓', this.x + this.width/2, this.y + this.height/2 + 6);
        } else {
            ctx.fillText(this.floor.toString(), this.x + this.width/2, this.y + this.height/2 + 6);
        }

        ctx.textAlign = 'left';
    }
}

// Particle class
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200 - 100;
        this.life = 1;
        this.maxLife = 1;
        this.color = color;
        this.size = Math.random() * 4 + 2;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += 200 * deltaTime; // gravity
        this.life -= deltaTime * 2;
    }

    render(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// Enemy classes
class BasicGuard {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 25;
        this.height = 30;
        this.health = 2;
        this.maxHealth = 2;
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.isDying = false;
        this.deathTimer = 0;
        this.damageFlash = 0;
    }

    update(deltaTime, game) {
        if (this.isDying) {
            this.deathTimer += deltaTime;
            if (this.deathTimer > 0.5) {
                this.health = 0; // Mark for removal
            }
            return;
        }

        // Apply gravity
        this.vy += game.gravity * 600 * deltaTime;
        this.y += this.vy * deltaTime;

        // Update damage flash
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }

        this.grounded = false;
    }

    takeDamage(amount) {
        this.health -= amount;
        this.damageFlash = 0.3;
        if (this.health <= 0 && !this.isDying) {
            this.isDying = true;
            this.deathTimer = 0;
        }
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    render(ctx) {
        if (this.isDying) {
            ctx.globalAlpha = 0.3;
        } else if (this.damageFlash > 0) {
            ctx.fillStyle = '#FF6B6B';
        } else {
            ctx.fillStyle = '#228B22'; // Orc green skin
        }

        // Draw orc body
        ctx.fillRect(this.x + 3, this.y + 8, this.width - 6, this.height - 8);

        // Draw orc head (larger and green)
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#2E8B57';
        ctx.fillRect(this.x + 2, this.y, this.width - 4, 12);

        // Draw orc tusks
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(this.x + 5, this.y + 8, 2, 4);
        ctx.fillRect(this.x + this.width - 7, this.y + 8, 2, 4);

        // Draw angry red eyes
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x + 6, this.y + 3, 2, 2);
        ctx.fillRect(this.x + this.width - 8, this.y + 3, 2, 2);

        // Draw crude armor
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x + 4, this.y + 10, this.width - 8, 8);

        // Draw weapon (club)
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x + this.width - 2, this.y + 5, 4, 15);
        ctx.fillRect(this.x + this.width - 1, this.y + 2, 2, 6);

        ctx.globalAlpha = 1;
    }
}

class PatrolEnemy {
    constructor(x, y, leftBound, rightBound) {
        this.x = x;
        this.y = y;
        this.width = 22;
        this.height = 28;
        this.health = 3;
        this.maxHealth = 3;
        this.vx = 50; // patrol speed
        this.vy = 0;
        this.grounded = false;
        this.leftBound = leftBound;
        this.rightBound = rightBound;
        this.direction = 1; // 1 for right, -1 for left
        this.isDying = false;
        this.deathTimer = 0;
        this.damageFlash = 0;
    }

    update(deltaTime, game) {
        if (this.isDying) {
            this.deathTimer += deltaTime;
            if (this.deathTimer > 0.5) {
                this.health = 0; // Mark for removal
            }
            return;
        }

        // Apply gravity
        this.vy += game.gravity * 600 * deltaTime;

        // Patrol logic
        if (this.grounded) {
            this.x += this.vx * this.direction * deltaTime;

            // Check bounds and reverse direction
            if (this.x <= this.leftBound || this.x + this.width >= this.rightBound) {
                this.direction *= -1;
            }
        }

        // Update position
        this.y += this.vy * deltaTime;

        // Update damage flash
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }

        this.grounded = false;
    }

    takeDamage(amount) {
        this.health -= amount;
        this.damageFlash = 0.3;
        if (this.health <= 0 && !this.isDying) {
            this.isDying = true;
            this.deathTimer = 0;
        }
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    render(ctx) {
        if (this.isDying) {
            ctx.globalAlpha = 0.3;
        } else if (this.damageFlash > 0) {
            ctx.fillStyle = '#FF6B6B';
        } else {
            ctx.fillStyle = '#556B2F'; // Dark olive orc skin
        }

        // Draw orc patrol body
        ctx.fillRect(this.x + 2, this.y + 6, this.width - 4, this.height - 6);

        // Draw orc head
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#6B8E23';
        ctx.fillRect(this.x + 1, this.y, this.width - 2, 10);

        // Draw orc ears (pointy)
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : '#6B8E23';
        ctx.fillRect(this.x - 1, this.y + 2, 3, 4);
        ctx.fillRect(this.x + this.width - 2, this.y + 2, 3, 4);

        // Draw movement indicator (weapon swing)
        ctx.fillStyle = '#8B4513';
        if (this.direction > 0) {
            ctx.fillRect(this.x + this.width - 2, this.y + 3, 5, 2);
            ctx.fillRect(this.x + this.width - 1, this.y + 8, 3, 12);
        } else {
            ctx.fillRect(this.x - 3, this.y + 3, 5, 2);
            ctx.fillRect(this.x - 2, this.y + 8, 3, 12);
        }

        // Draw glowing red eyes
        ctx.fillStyle = '#FF4500';
        ctx.fillRect(this.x + 4, this.y + 3, 2, 2);
        ctx.fillRect(this.x + this.width - 6, this.y + 3, 2, 2);

        // Draw armor straps
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x + 3, this.y + 12, this.width - 6, 2);
        ctx.fillRect(this.x + 3, this.y + 18, this.width - 6, 2);

        ctx.globalAlpha = 1;
    }
}

class ChaseEnemy {
    constructor(x, y, detectionRange) {
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 32;
        this.health = 4;
        this.maxHealth = 4;
        this.vx = 0;
        this.vy = 0;
        this.speed = 80;
        this.grounded = false;
        this.detectionRange = detectionRange || 100;
        this.isChasing = false;
        this.isDying = false;
        this.deathTimer = 0;
        this.damageFlash = 0;
        this.aggroTimer = 0;
    }

    update(deltaTime, game) {
        if (this.isDying) {
            this.deathTimer += deltaTime;
            if (this.deathTimer > 0.5) {
                this.health = 0; // Mark for removal
            }
            return;
        }

        // Apply gravity
        this.vy += game.gravity * 600 * deltaTime;

        // Check if player is in range
        const playerCenterX = game.player.x + game.player.width / 2;
        const enemyCenterX = this.x + this.width / 2;
        const distance = Math.abs(playerCenterX - enemyCenterX);

        if (distance < this.detectionRange) {
            this.isChasing = true;
            this.aggroTimer = 2; // Stay aggressive for 2 seconds after losing sight
        } else if (this.aggroTimer > 0) {
            this.aggroTimer -= deltaTime;
            if (this.aggroTimer <= 0) {
                this.isChasing = false;
            }
        }

        // Chase behavior
        if (this.isChasing && this.grounded) {
            const direction = playerCenterX > enemyCenterX ? 1 : -1;
            this.vx = this.speed * direction * deltaTime;
            this.x += this.vx;
        }

        // Update position
        this.y += this.vy * deltaTime;

        // Update damage flash
        if (this.damageFlash > 0) {
            this.damageFlash -= deltaTime;
        }

        this.grounded = false;
    }

    takeDamage(amount) {
        this.health -= amount;
        this.damageFlash = 0.3;
        this.isChasing = true; // Become aggressive when hurt
        this.aggroTimer = 3;
        if (this.health <= 0 && !this.isDying) {
            this.isDying = true;
            this.deathTimer = 0;
        }
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    render(ctx) {
        if (this.isDying) {
            ctx.globalAlpha = 0.3;
        } else if (this.damageFlash > 0) {
            ctx.fillStyle = '#FF6B6B';
        } else {
            ctx.fillStyle = this.isChasing ? '#8B0000' : '#2F4F4F'; // Berserker orc colors
        }

        // Draw berserker orc body (larger and more muscular)
        ctx.fillRect(this.x + 1, this.y + 8, this.width - 2, this.height - 8);

        // Draw orc head (bigger for berserker)
        ctx.fillStyle = this.damageFlash > 0 ? '#FF6B6B' : (this.isChasing ? '#8B0000' : '#696969');
        ctx.fillRect(this.x, this.y, this.width, 12);

        // Draw rage indicator (steam from ears when chasing)
        if (this.isChasing) {
            ctx.fillStyle = '#FFFFFF';
            const steam = Math.sin(Date.now() / 100) * 2;
            ctx.fillRect(this.x - 3, this.y - 5 + steam, 2, 8);
            ctx.fillRect(this.x + this.width + 1, this.y - 5 + steam, 2, 8);
        }

        // Draw massive tusks (bigger than regular orcs)
        ctx.fillStyle = '#FFF8DC';
        ctx.fillRect(this.x + 4, this.y + 9, 3, 6);
        ctx.fillRect(this.x + this.width - 7, this.y + 9, 3, 6);

        // Draw berserker eyes (glowing when chasing)
        ctx.fillStyle = this.isChasing ? '#FF0000' : '#FF4500';
        ctx.fillRect(this.x + 5, this.y + 4, 3, 3);
        ctx.fillRect(this.x + this.width - 8, this.y + 4, 3, 3);

        // Draw war paint
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(this.x + 2, this.y + 2, this.width - 4, 1);
        ctx.fillRect(this.x + this.width/2 - 1, this.y + 1, 2, 4);

        // Draw massive claws/weapons
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(this.x - 3, this.y + 18, 6, 10);
        ctx.fillRect(this.x + this.width - 3, this.y + 18, 6, 10);

        ctx.globalAlpha = 1;
    }
}

// Projectile class
class Projectile {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 8;
        this.height = 4;
        this.vx = vx;
        this.vy = vy;
        this.active = true;
        this.lifetime = 3; // seconds before auto-destroy
        this.trail = [];
    }

    update(deltaTime, game) {
        if (!this.active) return;

        // Add trail effect
        this.trail.push({x: this.x, y: this.y, life: 0.3});
        if (this.trail.length > 8) {
            this.trail.shift();
        }

        // Update trail
        this.trail.forEach(point => {
            point.life -= deltaTime;
        });
        this.trail = this.trail.filter(point => point.life > 0);

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Reduce lifetime
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0) {
            this.active = false;
        }

        // Check boundaries
        if (this.x < 0 || this.x > game.width || this.y < 0 || this.y > game.height) {
            this.active = false;
        }
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    render(ctx) {
        if (!this.active) return;

        // Draw trail
        this.trail.forEach((point, index) => {
            const alpha = point.life / 0.3;
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#FFD700';
            const size = alpha * 4;
            ctx.fillRect(point.x - size/2, point.y - size/2, size, size);
        });

        // Draw projectile
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFA500';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Draw core
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(this.x + 1, this.y + 1, this.width - 2, this.height - 2);
    }
}

// Global restart function
function restartGame() {
    game.restartGame();
}

// Initialize game when page loads
let game;
window.addEventListener('load', () => {
    game = new Game();
});