const DESIGN_WIDTH = 1440;  // Your game's original design width
const DESIGN_HEIGHT = 2560; // Your game's original design height

// WebSocket connection for remote controller
let ws = null;
let remoteInputs = {
  leftUp: false,
  leftDown: false,
  rightUp: false,
  rightDown: false
};

// Connection Scene - shows QR code and waits for controller
class ConnectionScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ConnectionScene' });
    this.controllersConnected = 0;
    this.sessionCode = null;
  }

  preload() {
    this.load.image('background', 'assets/background.png');
    this.load.image('mask', 'assets/foreground.png');
    this.load.image('plank', 'assets/plank.png');
    this.load.image('ball', 'assets/ball.png');
    this.load.image('light', 'assets/light.png');
    this.load.image('glow',  'assets/glow.png');
  }

  create() {
    // Show game background
    this.add.image(0, 0, 'background')
      .setOrigin(0)
      .setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT)
      .setDepth(0);

    // Add game elements for preview (non-interactive)
    const gameBoard = { x: 164, y: 399, width: 1064, height: 1419 };
    const centerX = gameBoard.x + gameBoard.width / 2;
    const plankWidth = gameBoard.width;
    const SPAWN_Y = 800;

    // Add plank
    this.add.image(centerX, SPAWN_Y, 'plank')
      .setDepth(5)
      .setOrigin(0.5, 0.4)
      .setScale(1);

    // Add ball
    this.add.image(centerX, SPAWN_Y - 100, 'ball')
      .setDepth(6)
      .setOrigin(0.5)
      .setScale(0.8);

    // Add mask/foreground
    this.add.image(0, 0, 'mask')
      .setOrigin(0)
      .setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT)
      .setDepth(2);

    // Add some sample score displays
    this.add.text(720, 1698, '3', { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, 0).setDepth(4);
    this.add.text(856, 1816, '1000', { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, .5).setDepth(4);
    this.add.text(856, 1865, '0', { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, 0).setDepth(4);
    
    // Create modal overlay
    this.createModal();

    // Connect to WebSocket server first - QR code will be generated when session code is received
    this.connectWebSocket();
  }

  createModal() {
    // Semi-transparent overlay
    this.modalOverlay = this.add.rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, 0x000000, 0.8)
      .setOrigin(0)
      .setDepth(1000);

    // Modal background
    this.modalBg = this.add.rectangle(DESIGN_WIDTH/2, DESIGN_HEIGHT/2, 1000, 1200, 0xffffff)
      .setOrigin(0.5)
      .setDepth(1001)
      .setStrokeStyle(4, 0x000000);

    // Title
    this.modalTitle = this.add.text(DESIGN_WIDTH/2, DESIGN_HEIGHT/2 - 500, 'ICE COLD BEER', {
      fontFamily: 'Digital7',
      fontSize: '80px',
      color: '#ff0000',
      align: 'center'
    }).setOrigin(0.5).setDepth(1002);

    // Instructions
    this.modalInstructions = this.add.text(DESIGN_WIDTH/2, DESIGN_HEIGHT/2 - 350, 'SCAN QR CODE WITH YOUR PHONE\nTO START PLAYING', {
      fontFamily: 'Digital7',
      fontSize: '36px',
      color: '#000000',
      align: 'center'
    }).setOrigin(0.5).setDepth(1002);

    // QR Code container (moved down slightly for padding)
    this.qrContainer = this.add.container(DESIGN_WIDTH/2, DESIGN_HEIGHT/2 - 20).setDepth(1002);
    
    // Connection status
    this.statusText = this.add.text(DESIGN_WIDTH/2, DESIGN_HEIGHT/2 + 300, 'Waiting for controller...', {
      fontFamily: 'Digital7',
      fontSize: '28px',
      color: '#333333',
      align: 'center'
    }).setOrigin(0.5).setDepth(1002);
  }

  hideModal() {
    // Switch to the game scene instead of just hiding the modal
    this.scene.start('GameScene');
  }

  generateQRCode() {
    if (!this.sessionCode) {
      console.log('No session code yet, waiting...');
      return;
    }

    // Clear existing content
    this.qrContainer.removeAll();

    const controllerUrl = `${window.location.origin}/controller.html?session=${this.sessionCode}`;
    
    console.log('QRCode library available:', typeof QRCode !== 'undefined');
    console.log('Generating QR/fallback for URL:', controllerUrl);
    
    // Always show session code and URL first
    this.showFallbackUrl(controllerUrl);
    
    // Then try to add QR code if library is available
    if (typeof QRCode !== 'undefined') {
      this.addQRCodeIfPossible(controllerUrl);
    }
  }
  
  addQRCodeIfPossible(controllerUrl) {
    console.log('Attempting to generate QR code with davidshimjs library...');
    
    try {
      // Create a div element for the QR code
      const qrDiv = document.createElement('div');
      qrDiv.style.position = 'absolute';
      qrDiv.style.left = '-9999px'; // Hide it off-screen
      document.body.appendChild(qrDiv);
      
      // Generate QR code using davidshimjs library
      const qr = new QRCode(qrDiv, {
        text: controllerUrl,
        width: 300,
        height: 300,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      
      // Wait a moment for QR code to generate, then convert to canvas
      setTimeout(() => {
        try {
          const img = qrDiv.querySelector('img');
          if (img && img.complete) {
            console.log('QR Code generated, converting to Phaser texture...');
            
            // Create canvas and draw the QR code image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 300;
            canvas.height = 300;
            ctx.drawImage(img, 0, 0);
            
            // Add canvas to Phaser as texture
            this.textures.addCanvas('qrcode-' + this.sessionCode, canvas);
            
            // Add QR code image to scene
            const qrImage = this.add.image(0, -100, 'qrcode-' + this.sessionCode).setOrigin(0.5);
            this.qrContainer.add(qrImage);
            
            console.log('QR Code added to scene successfully');
            
            // Clean up temporary div
            document.body.removeChild(qrDiv);
          } else {
            console.error('QR Code image not ready');
            document.body.removeChild(qrDiv);
          }
        } catch (conversionError) {
          console.error('Error converting QR code to Phaser texture:', conversionError);
          if (qrDiv.parentNode) {
            document.body.removeChild(qrDiv);
          }
        }
      }, 500);
      
    } catch (error) {
      console.error('QR Code library error:', error);
    }
  }

  showFallbackUrl(controllerUrl) {
    console.log('Adding fallback URL display...');
    
    try {
      const sessionText = this.add.text(0, 100, `Session Code: ${this.sessionCode}`, {
        fontFamily: 'Digital7',
        fontSize: '48px',
        color: '#00ff00',
        align: 'center'
      }).setOrigin(0.5);
      this.qrContainer.add(sessionText);
      console.log('Session text added');

      const urlText = this.add.text(0, 200, controllerUrl, {
        fontFamily: 'Digital7',
        fontSize: '20px',
        color: '#aaaaaa',
        align: 'center'
      }).setOrigin(0.5);
      this.qrContainer.add(urlText);
      console.log('URL text added');
      
      const instructionText = this.add.text(0, 280, 'Scan QR code or visit URL to control the game', {
        fontFamily: 'Digital7',
        fontSize: '24px',
        color: '#333333',
        align: 'center'
      }).setOrigin(0.5);
      this.qrContainer.add(instructionText);
      console.log('Instruction text added');
      
    } catch (error) {
      console.error('Error adding fallback text:', error);
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?type=game`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Connected to WebSocket server');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'sessionCode') {
          this.sessionCode = data.sessionCode;
          console.log('Received session code:', this.sessionCode);
          this.generateQRCode();
        } else if (data.type === 'status') {
          this.controllersConnected = data.controllersConnected;
          this.updateConnectionStatus();
        } else if (data.type === 'startGame') {
          // Hide the modal and start the game when commanded from controller
          this.hideModal();
          this.scene.get('GameScene').startGame();
        } else if (data.type === 'input') {
          // Update remote inputs
          remoteInputs.leftUp = data.leftUp || false;
          remoteInputs.leftDown = data.leftDown || false;
          remoteInputs.rightUp = data.rightUp || false;
          remoteInputs.rightDown = data.rightDown || false;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
      // Attempt to reconnect
      setTimeout(() => this.connectWebSocket(), 2000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  updateConnectionStatus() {
    if (this.controllersConnected > 0) {
      this.statusText.setText(`${this.controllersConnected} controller(s) connected\nReady to start! Use controller to begin.`);
      this.statusText.setColor('#008000');
    } else {
      this.statusText.setText('Waiting for controller...');
      this.statusText.setColor('#333333');
    }
  }
}

// Main Game Scene
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image('mask', 'assets/foreground.png');
    this.load.image('plank', 'assets/plank.png');
    this.load.image('ball', 'assets/ball.png');
    this.load.image('light', 'assets/light.png');
    this.load.image('glow',  'assets/glow.png');
    this.load.image('background', 'assets/background.png');
  }

  create() {
    // Calculate scale factor for this display
    this.scaleX = this.scale.displaySize.width / DESIGN_WIDTH;
    this.scaleY = this.scale.displaySize.height / DESIGN_HEIGHT;
    this.rawScaleFactor = Math.min(this.scaleX, this.scaleY); // Use the smaller scale to maintain aspect ratio
    
    // Apply gentler scaling curve - don't slow down as much on smaller screens
    // Use square root to reduce the impact of scaling
    this.scaleFactor = Math.sqrt(this.rawScaleFactor);
    
    // Ensure minimum speed - never go below 70% of original speed
    this.scaleFactor = Math.max(this.scaleFactor, 0.7);
    
    // Scale lever step with adjusted factor
    this.leverStep = BASE_LEVER_STEP * this.scaleFactor;
    
    // Debug scaling info
    console.log(`Display: ${this.scale.displaySize.width}x${this.scale.displaySize.height}`);
    console.log(`Design: ${DESIGN_WIDTH}x${DESIGN_HEIGHT}`);
    console.log(`Raw scale factor: ${this.rawScaleFactor.toFixed(3)}`);
    console.log(`Adjusted scale factor: ${this.scaleFactor.toFixed(3)}`);
    console.log(`Lever step: ${BASE_LEVER_STEP} → ${this.leverStep.toFixed(2)}`);
    
    // Initialize game but don't start yet - wait for controller
    this.setupGame();
    this.gameStarted = false;
  }

  setupGame() {
    
    // All the existing create() code goes here
    leftY  = SPAWN_Y_L ;
    rightY = SPAWN_Y;
    isHandling = false;
    timerStarted = false;

    this.matter.world.engine.positionIterations = 8;
    this.matter.world.engine.velocityIterations = 8;

    this.keys = this.input.keyboard.addKeys({ leftUp: 'W', leftDown: 'S', rightUp: 'UP', rightDown: 'DOWN' });

    // Touch input setup (keeping existing for fallback)
    const halfGameWidth = DESIGN_WIDTH / 2;
    const zoneHeight = DESIGN_HEIGHT / 4;
    const debugAlpha = 0.1;

    this.add.rectangle(0, DESIGN_HEIGHT - zoneHeight*2, halfGameWidth, zoneHeight, 0x00ff00, debugAlpha)
      .setOrigin(0,0).setInteractive()
      .on('pointerdown', () => touchInputs.leftUp   = true)
      .on('pointerup',   () => touchInputs.leftUp   = false)
      .on('pointerout',  () => touchInputs.leftUp   = false);
    this.add.rectangle(0, DESIGN_HEIGHT - zoneHeight,   halfGameWidth, zoneHeight, 0xff0000, debugAlpha)
      .setOrigin(0,0).setInteractive()
      .on('pointerdown', () => touchInputs.leftDown = true)
      .on('pointerup',   () => touchInputs.leftDown = false)
      .on('pointerout',  () => touchInputs.leftDown = false);
    this.add.rectangle(halfGameWidth, DESIGN_HEIGHT - zoneHeight*2, halfGameWidth, zoneHeight, 0x0000ff, debugAlpha)
      .setOrigin(0,0).setInteractive()
      .on('pointerdown', () => touchInputs.rightUp   = true)
      .on('pointerup',   () => touchInputs.rightUp   = false)
      .on('pointerout',  () => touchInputs.rightUp   = false);
    this.add.rectangle(halfGameWidth, DESIGN_HEIGHT - zoneHeight,   halfGameWidth, zoneHeight, 0xffff00, debugAlpha)
      .setOrigin(0,0).setInteractive()
      .on('pointerdown', () => touchInputs.rightDown = true)
      .on('pointerup',   () => touchInputs.rightDown = false)
      .on('pointerout',  () => touchInputs.rightDown = false);

    // Continue with all existing game setup...
    // Background Image
    this.add.image(0, 0, 'background')
      .setOrigin(0)
      .setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT)
      .setDepth(0);

    centerX = gameBoard.x + gameBoard.width / 2;
    ballStartY = SPAWN_Y - BALL_RADIUS;

    const DESIGN_W_HOLES = 600, DESIGN_H_HOLES = 800;
    holeCoords = rawDesignHoles.map(p => ({
      x: gameBoard.x + (p.x / DESIGN_W_HOLES) * gameBoard.width,
      y: gameBoard.y + (p.y / DESIGN_H_HOLES) * gameBoard.height
    }));
    holes = holeCoords.map((p,i) => ({ x: p.x, y: p.y, holeIndex: i }));

    this.holeLights = holes.map(h => {
      const l = this.add.image(h.x, h.y, 'light')
        .setDepth(1.1).setOrigin(0.5).setVisible(false);
      l.blinkTimer = null;
      return l;
    });

    this.roundTargets  = [0,1,2,3,4,5,6,7,8,9];
    this.currentRound  = 0;
    this.currentTarget = this.roundTargets[0];
    highlightTarget.call(this);

    // Mask Image
    this.add.image(0, 0, 'mask')
      .setOrigin(0)
      .setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT)
      .setDepth(2);
    
    const initialVisualPlankMidY = (leftY + rightY) / 2;
    
    plank = this.matter.add.sprite(centerX, initialVisualPlankMidY, 'plank', null, {
      shape: { type: 'rectangle', width: plankWidth, height: PHYSICS_PLANK_H },
      isStatic: true, friction: 0.00001, frictionStatic: 0
    })
    .setDepth(5)
    .setOrigin(0.5, 0.4);

    ball = this.matter.add.sprite(centerX, ballStartY, 'ball')
      .setDepth(6).setOrigin(0.5)
      .setCircle(BALL_RADIUS).setBounce(0.3)
      .setFriction(0.00001).setFrictionAir(0).setFixedRotation().setDensity(0.015)
      .setScale(0.8);

    score = 0;
    lives = 3;
    roundPoints = (this.currentRound + 1) * ROUND_START_BASE;

    livesText = this.add.text(720, 1698, `${lives}`, { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, 0).setDepth(4);
    bonusText = this.add.text(856, 1816, `${roundPoints}`, { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, .5).setDepth(4);
    scoreText = this.add.text(856, 1865, `${score}`, { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' }).setOrigin(1, 0).setDepth(4);

    const railCenterDistFromPlankCenter = plankWidth / 2 - railWidth / 2;
    const leftRailInitialX  = centerX - railCenterDistFromPlankCenter;
    const rightRailInitialX = centerX + railCenterDistFromPlankCenter;
    const initialPlankPhysicsY = plank.body.position.y;

    leftRail  = this.matter.add.rectangle(leftRailInitialX,  initialPlankPhysicsY, railWidth, railHeight, { isStatic:true });
    rightRail = this.matter.add.rectangle(rightRailInitialX, initialPlankPhysicsY, railWidth, railHeight, { isStatic:true });
  }

  startGame() {
    this.gameStarted = true;
    console.log('Game started!');
  }

  update() {
    // Only run game logic if game has started
    if (!this.gameStarted) return;
    // Modified input handling to include remote inputs
    const lu = this.keys.leftUp.isDown    || touchInputs.leftUp    || remoteInputs.leftUp;
    const ld = this.keys.leftDown.isDown  || touchInputs.leftDown  || remoteInputs.leftDown;
    const ru = this.keys.rightUp.isDown   || touchInputs.rightUp   || remoteInputs.rightUp;
    const rd = this.keys.rightDown.isDown || touchInputs.rightDown || remoteInputs.rightDown;

    const moved = lu || ld || ru || rd;
    if (moved && !timerStarted) {
      timerStarted = true;
      pointTimer = this.time.addEvent({
        delay: POINT_INTERVAL_MS,
        callback: () => {
          if (roundPoints > 0) {
            roundPoints = Math.max(0, roundPoints - POINT_DECREMENT);
            bonusText.setText(`${roundPoints}`);
          }
        },
        loop: true,
        callbackScope: this
      });
    }

    if (lu) leftY  = Phaser.Math.Clamp(leftY  - this.leverStep, minY, maxY);
    if (ld) leftY  = Phaser.Math.Clamp(leftY  + this.leverStep, minY, maxY);
    if (ru) rightY = Phaser.Math.Clamp(rightY - this.leverStep, minY, maxY);
    if (rd) rightY = Phaser.Math.Clamp(rightY + this.leverStep, minY, maxY);

    const visualMidY = (leftY + rightY) / 2;
    const angle = Math.atan2(rightY - leftY, plankWidth);
    
    plank.setPosition(centerX, visualMidY).setRotation(angle);

    if (plank.body) {
      const plankPhysicsBodyY = plank.body.position.y;
      const railCenterDist = plankWidth / 2 - railWidth / 2;
      const offsetX = railCenterDist * Math.cos(angle);
      const offsetY = railCenterDist * Math.sin(angle);
      const Body = Phaser.Physics.Matter.Matter.Body;
      Body.setPosition(leftRail,  { x: centerX - offsetX, y: plankPhysicsBodyY - offsetY });
      Body.setAngle(leftRail,  angle);
      Body.setPosition(rightRail, { x: centerX + offsetX, y: plankPhysicsBodyY + offsetY });
      Body.setAngle(rightRail, angle);
    }

    if (!isHandling) {
      const holeScreenRadius = (40 * gameBoard.width/600) / 2;
      const thresh = Math.max(1, holeScreenRadius - (BALL_RADIUS * ball.scaleX) );

      for (let h of holes) {
        const dx = ball.x - h.x;
        const dy = ball.y - h.y;
        if (Math.hypot(dx, dy) <= thresh) {
          handleHoleCollision.call(this, h.holeIndex);
          break;
        }
      }
    }
  }
}

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'phaser-game-container',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  fps: {
    target: 60,
    forceSetTimeOut: true
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 7 },
      debug: false,
      positionIterations: 8,
      velocityIterations: 8
    }
  },
  scene: [ConnectionScene, GameScene]
};

const game = new Phaser.Game(config);

const gameBoard = { x: 164, y: 399, width: 1064, height: 1419 };
const plankWidth = gameBoard.width;
const plankHeight = 20;
const BASE_LEVER_STEP = 3.5; // Base lever step for design resolution
const minY = gameBoard.y;
const maxY = gameBoard.y + gameBoard.height - plankHeight;
const ROUND_START_BASE = 100;
const POINT_DECREMENT = 10;
const POINT_INTERVAL_MS = 5000;
const TALLY_TIME_MS = 1500;
const railWidth = 20;
const railHeight = 80;
const rawDesignHoles = [ 
  { x: 309, y: 557 },
  { x: 506, y: 535 },
  { x: 114, y: 481 },
  { x: 407, y: 428 },
  { x: 229, y: 336 },
  { x: 491, y: 243 },
  { x: 322, y: 198 },
  { x: 143, y: 149 },
  { x: 416, y: 82 },
  { x: 252, y: 41 },
  { x:  88, y: 549 },
  { x: 172, y: 529 },
  { x: 238, y: 528 },
  { x: 392, y: 541 },
  { x: 530, y: 606 },
  { x: 571, y: 541 },
  { x: 590, y: 495 },
  { x: 48,  y: 501 },
  { x: 309, y: 505 },
  { x: 457, y: 508 },
  { x: 591, y: 442 },
  { x: 524, y: 489 },
  { x: 396, y: 486 },
  { x: 29,  y: 442 },
  { x: 160, y: 449 },
  { x: 313, y: 439 },
  { x: 463, y: 428 },
  { x: 253, y: 418 },
  { x: 120, y: 395 },
  { x: 212, y: 388 },
  { x: 289, y: 387 },
  { x: 423, y: 367 },
  { x: 372, y: 363 },
  { x: 178, y: 355 },
  { x: 531, y: 359 },
  { x: 82,  y: 337 },
  { x: 336, y: 336 },
  { x: 130, y: 317 },
  { x: 57,  y: 294 },
  { x: 490, y: 314 },
  { x: 559, y: 289 },
  { x: 182, y: 297 },
  { x: 29,  y: 254 },
  { x: 453, y: 281 },
  { x: 324, y: 270 },
  { x: 229, y: 262 },
  { x: 569, y: 244 },
  { x: 412, y: 245 },
  { x: 283, y: 235 },
  { x: 364, y: 235 },
  { x: 591, y: 203 },
  { x: 531, y: 205 },
  { x: 145, y: 208 },
  { x: 243, y: 201 },
  { x: 95,  y: 194 },
  { x: 193, y: 192 },
  { x: 412, y: 199 },
  { x: 36,  y: 167 },
  { x: 493, y: 172 },
  { x: 362, y: 162 },
  { x: 282, y: 164 },
  { x: 78,  y: 152 },
  { x: 205, y: 150 },
  { x: 414, y: 144 },
  { x: 323, y: 130 },
  { x: 452, y: 113 },
  { x: 98,  y: 110 },
  { x: 254, y: 105 },
  { x: 147, y: 97 },
  { x: 485, y: 83 },
  { x: 351, y: 83 },
  { x: 286, y: 70 },
  { x: 220, y: 72 },
  { x: 568, y: 71 },
  { x: 452, y: 54 },
  { x: 111, y: 56 },
  { x: 383, y: 54 },
  { x: 185, y: 47 },
  { x: 323, y: 40 },
  { x: 415, y: 27 },
  { x: 220, y: 16 },
  { x: 288, y: 18 },
  ];

const SPRITE_PLANK_FULL_H = 86;
const PHYSICS_PLANK_H    = 36;   // how tall the invisible railless plank actually is
const PLANK_SHADOW_H     = SPRITE_PLANK_FULL_H - PHYSICS_PLANK_H; // =50
const SPRITE_BALL_DIA = 42.4;
const BALL_RADIUS     = SPRITE_BALL_DIA / 2; // =26.5
// how high down the board to put the plank & ball on spawn
const SPAWN_Y       = 1650;           // ← tweak this to taste
const SPAWN_Y_L       = 1685;           // ← tweak this to taste



let leftY, rightY;
let plank, ball;
let leftRail, rightRail;
let holes = [], holeGlows = [];
let holeCoords = [];
let ballStartY, centerX;
let isHandling;

let score, scoreText;
let lives, livesText;
let bonusText;
let roundPoints, pointTimer;
let timerStarted;
// underneath your other globals:
let touchInputs = {
  leftUp:    false,
  leftDown:  false,
  rightUp:   false,
  rightDown: false
};


// These functions are now methods in the GameScene class above

function highlightTarget() {
  holes.forEach((h, i) => {
    // kill any existing blink on this light
    if (this.holeLights[i].blinkTimer) {
      this.holeLights[i].blinkTimer.remove(false);
      this.holeLights[i].blinkTimer = null;
    }
    // hide all lights by default
    this.holeLights[i].setVisible(false);

    // if this is the current target, show & start blinking
    if (i === this.currentTarget) {
      const lightSpr = this.holeLights[i];
      lightSpr.setTexture('light').setVisible(true);

      lightSpr.blinkTimer = this.time.addEvent({
        delay: 500,    // half-second per frame; adjust as you like
        loop: true,
        callback: () => {
          // swap texture each tick
          lightSpr.setTexture(
            lightSpr.texture.key === 'light' ? 'glow' : 'light'
          );
        }
      });
    }
  });
}


function handleHoleCollision(idx) {
  isHandling = true;
  const holeData = holes[idx];

  ball.setDepth(1.5);
  ball.setIgnoreGravity(true);
  ball.setStatic(true); // Make ball static during its animation

  Object.values(this.keys).forEach(k => { k.enabled = false; k.reset(); });
  // if (pointTimer) pointTimer.paused = true; // Or remove if appropriate

  const fallAnimDuration1 = 200;
  const fallAnimDuration2 = 500;
  const dropToY = gameBoard.y + gameBoard.height + ball.displayHeight;

  this.tweens.add({ // Tween 1: Ball to hole center
    targets: ball,
    x: holeData.x,
    scaleX: ball.scaleX * 0.8,
    scaleY: ball.scaleY * 0.8,
    alpha: 0.8,
    duration: fallAnimDuration1,
    ease: 'Power2',
    onComplete: () => { // <<< ONCOMPLETE_BALL_TWEEN_1_START
      this.tweens.add({ // Tween 2: Ball vertical drop
        targets: ball,
        y: dropToY,
        alpha: 0,
        duration: fallAnimDuration2,
        ease: 'Quad.easeIn',
        onComplete: () => { // <<< ONCOMPLETE_BALL_TWEEN_2_START (This might be where your line 453 "{" is)

          ball.setVisible(false);
          ball.setAlpha(1);
          // ball.setScale(0.8); // Reset scale (or your default) - will be reset before respawn

          const correct = (idx === this.currentTarget);

          // ── MISS CASE ──
          if (!correct) { // <<< IF_NOT_CORRECT_START
            lives--;
            livesText.setText(`${lives}`);

            if (lives <= 0) { // <<< IF_LIVES_ZERO_START
              // Game over logic
              // ball.setVisible(false); // Already hidden
              if (pointTimer) pointTimer.remove();
              bonusText.setVisible(false);
              this.add.text(856, 1816, 'Game Over', { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' })
                .setOrigin(1, 0.5).setDepth(7);
              // Controls are already off. If physics world was paused, ensure it's noted.
              // this.matter.world.resume(); // If world.pause() was used
              return;
            } // <<< IF_LIVES_ZERO_END

            // Respawn logic:
            if (timerStarted) {
                if (pointTimer) pointTimer.remove();
                timerStarted = false;
            }

            const lever = { l: leftY, r: rightY };
            this.tweens.add({ // Plank Reset Tween - MISS
              targets: lever,
              l: SPAWN_Y_L,
              r: SPAWN_Y,
              duration: 1000,
              ease: 'Quad.easeInOut',
              onUpdate: () => { // <<< ONUPDATE_PLANK_MISS_START
                leftY = lever.l;
                rightY = lever.r;
                const visualMidY = (leftY + rightY) / 2;
                const angle = Math.atan2(rightY - leftY, plankWidth);
                plank.setPosition(centerX, visualMidY).setRotation(angle);
                if (plank.body) {
                    const plankPhysicsBodyY = plank.body.position.y;
                    const halfTrackWidth = plankWidth / 2 - railWidth / 2;
                    const offsetX = halfTrackWidth * Math.cos(angle);
                    const offsetY = halfTrackWidth * Math.sin(angle);
                    const Body = Phaser.Physics.Matter.Matter.Body;
                    Body.setPosition(leftRail,  { x: centerX - offsetX, y: plankPhysicsBodyY - offsetY });
                    Body.setAngle(leftRail,  angle);
                    Body.setPosition(rightRail, { x: centerX + offsetX, y: plankPhysicsBodyY + offsetY });
                    Body.setAngle(rightRail, angle);
                }
              }, // <<< ONUPDATE_PLANK_MISS_END
              onComplete: () => { // <<< ONCOMPLETE_PLANK_MISS_START
                this.time.delayedCall(500, () => { // <<< DELAYEDCALL_MISS_START
                  ball.setPosition(centerX, ballStartY)
                      .setVisible(true).setDepth(6).setScale(0.8).setAlpha(1);
                  ball.setStatic(false);
                  ball.setIgnoreGravity(false);
                  ball.setVelocity(0, 0);
                  Object.values(this.keys).forEach(k => { k.enabled = true; k.reset(); });
                  isHandling = false;
                }); // <<< DELAYEDCALL_MISS_END
              } // <<< ONCOMPLETE_PLANK_MISS_END
            }); // End of plank reset tween for MISS
            return;
          } // <<< IF_NOT_CORRECT_END

          // ── HIT CORRECT HOLE ──
          // This 'if (correct)' is technically redundant if the miss case has a return,
          // but it's good for clarity. Or use an 'else'.
          if (correct) { // <<< IF_CORRECT_START
            if (timerStarted) {
                if (pointTimer) pointTimer.remove();
                timerStarted = false;
            }

            const lever = { l: leftY, r: rightY };
            this.tweens.add({ // Plank Reset Tween - HIT
              targets: lever,
              l: SPAWN_Y_L, r: SPAWN_Y,
              duration: 1000,
              ease: 'Quad.easeInOut',
              onUpdate: () => { // <<< ONUPDATE_PLANK_HIT_START (Identical to miss case)
                leftY = lever.l;
                rightY = lever.r;
                const visualMidY = (leftY + rightY) / 2;
                const angle = Math.atan2(rightY - leftY, plankWidth);
                plank.setPosition(centerX, visualMidY).setRotation(angle);
                if (plank.body) {
                    const plankPhysicsBodyY = plank.body.position.y;
                    const halfTrackWidth = plankWidth / 2 - railWidth / 2;
                    const offsetX = halfTrackWidth * Math.cos(angle);
                    const offsetY = halfTrackWidth * Math.sin(angle);
                    const Body = Phaser.Physics.Matter.Matter.Body;
                    Body.setPosition(leftRail,  { x: centerX - offsetX, y: plankPhysicsBodyY - offsetY });
                    Body.setAngle(leftRail,  angle);
                    Body.setPosition(rightRail, { x: centerX + offsetX, y: plankPhysicsBodyY + offsetY });
                    Body.setAngle(rightRail, angle);
                }
              }, // <<< ONUPDATE_PLANK_HIT_END
              onComplete: () => { // <<< ONCOMPLETE_PLANK_HIT_START
                const steps = Math.max(1, Math.ceil(roundPoints / POINT_DECREMENT)); // Ensure steps is at least 1 if TALLY_TIME_MS > 0
                const stepTime = (TALLY_TIME_MS > 0 && roundPoints > 0) ? TALLY_TIME_MS / steps : 0;

                if (stepTime > 0) { // <<< IF_STEPTIME_GT_ZERO_START (for tally tween)
                    this.time.addEvent({ // Score Tally Tween
                        delay: stepTime,
                        repeat: steps - 1,
                        callback: () => {
                            score += POINT_DECREMENT;
                            roundPoints = Math.max(0, roundPoints - POINT_DECREMENT);
                            scoreText.setText(`${score}`);
                            bonusText.setText(`${roundPoints}`);
                        },
                        callbackScope: this
                    });
                } else { // if no tally animation, just update score immediately
                    score += roundPoints;
                    roundPoints = 0;
                    scoreText.setText(`${score}`);
                    bonusText.setText(`${roundPoints}`);
                } // <<< IF_STEPTIME_GT_ZERO_END

                this.time.delayedCall(TALLY_TIME_MS, () => { // <<< DELAYEDCALL_HIT_START
                  if (this.currentRound === this.roundTargets.length - 1) { // <<< IF_WINNER_START
                    bonusText.setVisible(false);
                    this.add.text(856, 1816, 'Winner', { fontFamily: 'Digital7', fontSize: '78px', color: '#ff0000' })
                      .setOrigin(1, 0.3).setDepth(7);
                    isHandling = false;
                    // Controls likely stay disabled for winner screen
                    return;
                  } // <<< IF_WINNER_END

                  this.currentRound++;
                  this.currentTarget = this.roundTargets[this.currentRound];
                  highlightTarget.call(this);
                  roundPoints = (this.currentRound + 1) * ROUND_START_BASE;
                  bonusText.setText(`${roundPoints}`);

                  ball.setPosition(centerX, ballStartY)
                      .setVisible(true).setDepth(6).setScale(0.8).setAlpha(1);
                  ball.setStatic(false);
                  ball.setIgnoreGravity(false);
                  ball.setVelocity(0, 0);
                  Object.values(this.keys).forEach(k => { k.enabled = true; k.reset(); });
                  isHandling = false;
                }, [], this); // <<< DELAYEDCALL_HIT_END
              } // <<< ONCOMPLETE_PLANK_HIT_END
            }); // End of plank reset tween for HIT
          } // <<< IF_CORRECT_END (This is where your line 547 "}" error might be if this is missing)

        } // <<< ONCOMPLETE_BALL_TWEEN_2_END (THIS IS A VERY LIKELY CANDIDATE FOR THE MISSING BRACE)
      }); // End of Tween 2 (Ball vertical drop)
    } // <<< ONCOMPLETE_BALL_TWEEN_1_END
  }); // End of Tween 1 (Ball to hole center)

  // Controls were disabled at the top of this function. They are re-enabled
  // in the onComplete of the plank tweens (or not, in case of game over/winner).
} // <<< End of handleHoleCollision function