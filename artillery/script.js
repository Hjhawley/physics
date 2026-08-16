"use strict";

// ============================================================
// Projectile Motion Artillery
// Vanilla JavaScript — no libraries required
// ============================================================

// Easy-to-adjust game constants

const GRAVITY = 9.8;
const MAX_ATTEMPTS = 2;
const TARGET_TOLERANCE = 1.0; // meters on either side of target center

const TARGET_DISTANCE_MIN = 30;
const TARGET_DISTANCE_MAX = 60;
const HIDDEN_ANGLE_MIN = 30;
const HIDDEN_ANGLE_MAX = 60;
const OVERALL_SPEED_MIN = 15;
const OVERALL_SPEED_MAX = 30;

const WALL_POSITION_MIN_FRACTION = 0.25;
const WALL_POSITION_MAX_FRACTION = 0.7;
const WALL_HEIGHT_MIN = 2.5;
const WALL_HEIGHT_MAX = 12;
const WALL_HEIGHT_MIN_FRACTION = 0.5;
const WALL_HEIGHT_MAX_FRACTION = 0.78;

const ANGLE_RANGE_MIN_WIDTH = 16;
const ANGLE_RANGE_MAX_WIDTH = 28;
const SPEED_RANGE_MIN_WIDTH = 6;
const SPEED_RANGE_MAX_WIDTH = 10;

const ANIMATION_SPEED = 1.7;
const MAX_GENERATION_TRIES = 5000;
const TRAIL_INTERVAL = 0.05;

// DOM references

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const wallInfo = document.getElementById("wallInfo");
const targetInfo = document.getElementById("targetInfo");
const angleRangeInfo = document.getElementById("angleRangeInfo");
const speedRangeInfo = document.getElementById("speedRangeInfo");
const attemptsRemaining = document.getElementById("attemptsRemaining");

const angleSlider = document.getElementById("angleSlider");
const angleInput = document.getElementById("angleInput");
const speedSlider = document.getElementById("speedSlider");
const speedInput = document.getElementById("speedInput");

const launchButton = document.getElementById("launchButton");
const newRoundButton = document.getElementById("newRoundButton");
const validationMessage = document.getElementById("validationMessage");
const statusMessage = document.getElementById("statusMessage");
const shotSummary = document.getElementById("shotSummary");

// Game state

let currentRound = null;
let attemptsUsed = 0;
let animationRunning = false;
let animationFrameId = null;
let activeShot = null;
let shotHistory = [];

let view = {
  width: 800,
  height: 420,
  dpr: 1,
  left: 60,
  right: 35,
  top: 25,
  groundY: 340,
  scaleX: 1,
  scaleY: 1,
  maxX: 70,
  maxY: 25,
};

// Utility functions

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function format(value, decimals = 1) {
  return Number(value).toFixed(decimals);
}

// Projectile-motion calculations

function calculateProjectilePosition(speed, angleDegrees, time) {
  const angle = degreesToRadians(angleDegrees);

  const vx = speed * Math.cos(angle);
  const vy = speed * Math.sin(angle);

  return {
    x: vx * time,
    y: vy * time - 0.5 * GRAVITY * time * time,
    vx,
    vy,
  };
}

function calculateFlightTime(speed, angleDegrees) {
  const angle = degreesToRadians(angleDegrees);
  const vy = speed * Math.sin(angle);

  return (2 * vy) / GRAVITY;
}

function calculateRange(speed, angleDegrees) {
  const angle = degreesToRadians(angleDegrees);

  return (speed * speed * Math.sin(2 * angle)) / GRAVITY;
}

function calculatePeakHeight(speed, angleDegrees) {
  const angle = degreesToRadians(angleDegrees);
  const vy = speed * Math.sin(angle);

  return (vy * vy) / (2 * GRAVITY);
}

function calculateHeightAtX(x, speed, angleDegrees) {
  const angle = degreesToRadians(angleDegrees);
  const cos = Math.cos(angle);

  if (Math.abs(cos) < 1e-9) {
    return -Infinity;
  }

  return (
    x * Math.tan(angle) - (GRAVITY * x * x) / (2 * speed * speed * cos * cos)
  );
}

function checkWallCollision(speed, angleDegrees) {
  const landingX = calculateRange(speed, angleDegrees);

  // If the projectile lands before the wall,
  // it never physically reaches the wall.
  if (landingX < currentRound.wallDistance) {
    return {
      reachesWall: false,
      hit: false,
      time: null,
      height: null,
    };
  }

  const angle = degreesToRadians(angleDegrees);
  const vx = speed * Math.cos(angle);

  if (vx <= 0) {
    return {
      reachesWall: false,
      hit: false,
      time: null,
      height: null,
    };
  }

  const time = currentRound.wallDistance / vx;

  const position = calculateProjectilePosition(speed, angleDegrees, time);

  return {
    reachesWall: true,

    // Exactly equal to wall height
    // counts as hitting the wall.
    hit: position.y <= currentRound.wallHeight,

    time,
    height: position.y,
  };
}

function evaluateLanding(landingX) {
  const targetMin = currentRound.targetDistance - TARGET_TOLERANCE;

  const targetMax = currentRound.targetDistance + TARGET_TOLERANCE;

  // Exactly on either boundary counts as a hit.
  if (landingX >= targetMin && landingX <= targetMax) {
    return "HIT";
  }

  if (landingX < targetMin) {
    return "SHORT";
  }

  return "OVERSHOT";
}

// Guaranteed-solvable round generation

function generateSolvableScenario() {
  for (let i = 0; i < MAX_GENERATION_TRIES; i += 1) {
    /*
      Generate the hidden valid shot first.

      The hidden speed uses 0.1 m/s increments,
      so the guaranteed solution can actually
      be entered using the student's controls.
    */

    const hiddenAngle = randomInt(HIDDEN_ANGLE_MIN, HIDDEN_ANGLE_MAX);

    const hiddenSpeed = roundTo(
      randomBetween(OVERALL_SPEED_MIN, OVERALL_SPEED_MAX),
      1,
    );

    /*
      Because launch and landing heights are both zero:

      R = v² sin(2θ) / g
    */

    const targetDistance = calculateRange(hiddenSpeed, hiddenAngle);

    if (
      targetDistance < TARGET_DISTANCE_MIN ||
      targetDistance > TARGET_DISTANCE_MAX
    ) {
      continue;
    }

    // Put the wall somewhere between
    // the catapult and the target.
    const wallDistance =
      targetDistance *
      randomBetween(WALL_POSITION_MIN_FRACTION, WALL_POSITION_MAX_FRACTION);

    /*
      Determine the height of the known-valid
      trajectory where it reaches the wall.
    */

    const validHeightAtWall = calculateHeightAtX(
      wallDistance,
      hiddenSpeed,
      hiddenAngle,
    );

    if (!Number.isFinite(validHeightAtWall) || validHeightAtWall <= 0) {
      continue;
    }

    /*
      Build the wall well below the valid
      trajectory so the hidden solution does
      not merely scrape it.
    */

    const wallHeight =
      validHeightAtWall *
      randomBetween(WALL_HEIGHT_MIN_FRACTION, WALL_HEIGHT_MAX_FRACTION);

    if (wallHeight < WALL_HEIGHT_MIN || wallHeight > WALL_HEIGHT_MAX) {
      continue;
    }

    // --------------------------
    // Allowed angle range
    // --------------------------

    const angleWidth = randomInt(ANGLE_RANGE_MIN_WIDTH, ANGLE_RANGE_MAX_WIDTH);

    const angleLeft = randomInt(6, angleWidth - 6);

    let angleMin = hiddenAngle - angleLeft;

    let angleMax = angleMin + angleWidth;

    if (angleMin < 15) {
      angleMax += 15 - angleMin;
      angleMin = 15;
    }

    if (angleMax > 75) {
      angleMin -= angleMax - 75;
      angleMax = 75;
    }

    angleMin = Math.round(angleMin);
    angleMax = Math.round(angleMax);

    // --------------------------
    // Allowed speed range
    // --------------------------

    const speedWidth = randomInt(SPEED_RANGE_MIN_WIDTH, SPEED_RANGE_MAX_WIDTH);

    const speedLeft = randomBetween(2.5, speedWidth - 2.5);

    let speedMin = Math.floor(hiddenSpeed - speedLeft);

    let speedMax = Math.ceil(speedMin + speedWidth);

    if (speedMin < OVERALL_SPEED_MIN) {
      speedMax += OVERALL_SPEED_MIN - speedMin;

      speedMin = OVERALL_SPEED_MIN;
    }

    if (speedMax > OVERALL_SPEED_MAX) {
      speedMin -= speedMax - OVERALL_SPEED_MAX;

      speedMax = OVERALL_SPEED_MAX;
    }

    speedMin = Math.max(OVERALL_SPEED_MIN, speedMin);

    speedMax = Math.min(OVERALL_SPEED_MAX, speedMax);

    /*
      Final solvability check:
      the hidden solution must fall inside
      both displayed ranges.
    */

    if (
      hiddenAngle < angleMin ||
      hiddenAngle > angleMax ||
      hiddenSpeed < speedMin ||
      hiddenSpeed > speedMax
    ) {
      continue;
    }

    return {
      targetDistance,
      wallDistance,
      wallHeight,

      angleMin,
      angleMax,
      speedMin,
      speedMax,

      // Never displayed to students.
      hiddenAngle,
      hiddenSpeed,
    };
  }

  throw new Error("Could not generate a solvable round.");
}

// Round management

function generateRound() {
  cancelAnimation();

  currentRound = generateSolvableScenario();

  attemptsUsed = 0;
  shotHistory = [];
  activeShot = null;

  configureControls();
  updateUI();
  renderShotHistory();

  setStatus("Read the scenario, calculate your shot, then launch.", "neutral");

  validationMessage.textContent = "";

  newRoundButton.disabled = true;
  launchButton.disabled = false;

  setControlsDisabled(false);

  drawScene();
}

function resetRound() {
  generateRound();
}

// Controls

function configureControls() {
  angleSlider.min = currentRound.angleMin;

  angleSlider.max = currentRound.angleMax;

  angleSlider.step = 1;

  angleInput.min = currentRound.angleMin;

  angleInput.max = currentRound.angleMax;

  angleInput.step = 1;

  speedSlider.min = currentRound.speedMin;

  speedSlider.max = currentRound.speedMax;

  speedSlider.step = 0.1;

  speedInput.min = currentRound.speedMin;

  speedInput.max = currentRound.speedMax;

  speedInput.step = 0.1;

  const startingAngle = Math.round(
    (currentRound.angleMin + currentRound.angleMax) / 2,
  );

  const startingSpeed = roundTo(
    (currentRound.speedMin + currentRound.speedMax) / 2,
    1,
  );

  angleSlider.value = startingAngle;

  angleInput.value = startingAngle;

  speedSlider.value = startingSpeed;

  speedInput.value = startingSpeed.toFixed(1);
}

function updateUI() {
  wallInfo.textContent =
    `${format(currentRound.wallDistance)} m away, ` +
    `${format(currentRound.wallHeight)} m tall`;

  targetInfo.textContent = `${format(currentRound.targetDistance)} m away`;

  angleRangeInfo.textContent = `${currentRound.angleMin}°–${currentRound.angleMax}°`;

  speedRangeInfo.textContent = `${currentRound.speedMin}–${currentRound.speedMax} m/s`;

  const remaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

  attemptsRemaining.textContent = `Attempts remaining: ${remaining}`;
}

function setStatus(message, type) {
  statusMessage.textContent = message;

  statusMessage.className = "status-message";

  if (type === "hit") {
    statusMessage.classList.add("status-hit");
  } else if (type === "miss") {
    statusMessage.classList.add("status-miss");
  } else if (type === "ready") {
    statusMessage.classList.add("status-ready");
  } else {
    statusMessage.classList.add("status-neutral");
  }
}

function setControlsDisabled(disabled) {
  angleSlider.disabled = disabled;
  angleInput.disabled = disabled;
  speedSlider.disabled = disabled;
  speedInput.disabled = disabled;
}

function syncSliderAndNumber(slider, numberInput, decimals) {
  slider.addEventListener("input", () => {
    const value = Number(slider.value);

    numberInput.value =
      decimals === 0 ? String(value) : value.toFixed(decimals);
  });

  numberInput.addEventListener("input", () => {
    const value = Number(numberInput.value);

    if (Number.isFinite(value)) {
      slider.value = clamp(value, Number(slider.min), Number(slider.max));
    }
  });

  numberInput.addEventListener("change", () => {
    const min = Number(numberInput.min);

    const max = Number(numberInput.max);

    const value = Number(numberInput.value);

    if (!Number.isFinite(value)) {
      const sliderValue = Number(slider.value);

      numberInput.value =
        decimals === 0 ? String(sliderValue) : sliderValue.toFixed(decimals);

      return;
    }

    const safeValue = clamp(value, min, max);

    slider.value = safeValue;

    numberInput.value =
      decimals === 0
        ? String(Math.round(safeValue))
        : safeValue.toFixed(decimals);
  });
}

function validateInputs() {
  const angle = Number(angleInput.value);

  const speed = Number(speedInput.value);

  if (!Number.isFinite(angle) || !Number.isFinite(speed)) {
    return {
      valid: false,
      message: "Enter a valid angle and launch speed.",
    };
  }

  if (angle < currentRound.angleMin || angle > currentRound.angleMax) {
    return {
      valid: false,
      message:
        `Angle must be between ` +
        `${currentRound.angleMin}° and ` +
        `${currentRound.angleMax}°.`,
    };
  }

  if (speed < currentRound.speedMin || speed > currentRound.speedMax) {
    return {
      valid: false,
      message:
        `Speed must be between ` +
        `${currentRound.speedMin} and ` +
        `${currentRound.speedMax} m/s.`,
    };
  }

  return {
    valid: true,
    angle,
    speed,
  };
}

// Shot summary

function renderShotHistory() {
  if (shotHistory.length === 0) {
    shotSummary.innerHTML =
      '<p class="summary-placeholder">' +
      "Your launch data will appear here after the shot." +
      "</p>";

    return;
  }

  shotSummary.innerHTML = shotHistory
    .map((shot, index) => {
      const wallHeightText =
        shot.heightAtWall === null
          ? "Did not reach wall"
          : `${format(shot.heightAtWall)} m`;

      const landingText =
        shot.result === "HIT WALL" ? "—" : `${format(shot.landingX)} m`;

      return `
            <article class="summary-card">

              <div class="summary-cell">
                <span>Attempt</span>
                <strong>${index + 1}</strong>
              </div>

              <div class="summary-cell">
                <span>Angle</span>
                <strong>${format(shot.angle)}°</strong>
              </div>

              <div class="summary-cell">
                <span>Speed</span>
                <strong>${format(shot.speed)} m/s</strong>
              </div>

              <div class="summary-cell">
                <span>vx</span>
                <strong>${format(shot.vx)} m/s</strong>
              </div>

              <div class="summary-cell">
                <span>vy</span>
                <strong>${format(shot.vy)} m/s</strong>
              </div>

              <div class="summary-cell">
                <span>Height at wall</span>
                <strong>${wallHeightText}</strong>
              </div>

              <div class="summary-cell">
                <span>Landing</span>
                <strong>${landingText}</strong>
              </div>

              <div class="summary-cell">
                <span>Result</span>
                <strong class="summary-result">
                  ${shot.result}
                </strong>
              </div>

            </article>
          `;
    })
    .join("");
}

// Launch

function launchProjectile() {
  if (animationRunning || !currentRound) {
    return;
  }

  if (attemptsUsed >= MAX_ATTEMPTS) {
    return;
  }

  const input = validateInputs();

  if (!input.valid) {
    validationMessage.textContent = input.message;

    return;
  }

  validationMessage.textContent = "";

  const angle = input.angle;
  const speed = input.speed;

  const radians = degreesToRadians(angle);

  const vx = speed * Math.cos(radians);

  const vy = speed * Math.sin(radians);

  const landingX = calculateRange(speed, angle);

  const flightTime = calculateFlightTime(speed, angle);

  const wall = checkWallCollision(speed, angle);

  let result;

  if (wall.hit) {
    result = "HIT WALL";
  } else {
    result = evaluateLanding(landingX);
  }

  attemptsUsed += 1;
  updateUI();

  activeShot = {
    angle,
    speed,
    vx,
    vy,
    landingX,
    flightTime,
    wall,
    result,

    startTimestamp: null,
    elapsed: 0,

    point: {
      x: 0,
      y: 0,
    },

    trail: [],
    lastTrailTime: -Infinity,
  };

  animationRunning = true;

  setControlsDisabled(true);

  launchButton.disabled = true;
  newRoundButton.disabled = true;

  setStatus("Projectile in flight…", "neutral");

  animationFrameId = requestAnimationFrame(animateProjectile);
}

// Projectile animation

function animateProjectile(timestamp) {
  if (!animationRunning || !activeShot) {
    return;
  }

  if (activeShot.startTimestamp === null) {
    activeShot.startTimestamp = timestamp;
  }

  const realElapsed = (timestamp - activeShot.startTimestamp) / 1000;

  const simulationTime = realElapsed * ANIMATION_SPEED;

  let stopTime = activeShot.flightTime;

  if (activeShot.wall.hit) {
    stopTime = Math.min(stopTime, activeShot.wall.time);
  }

  activeShot.elapsed = Math.min(simulationTime, stopTime);

  const point = calculateProjectilePosition(
    activeShot.speed,
    activeShot.angle,
    activeShot.elapsed,
  );

  activeShot.point = {
    x: point.x,
    y: Math.max(0, point.y),
  };

  if (activeShot.elapsed - activeShot.lastTrailTime >= TRAIL_INTERVAL) {
    activeShot.trail.push({
      ...activeShot.point,
    });

    activeShot.lastTrailTime = activeShot.elapsed;
  }

  drawScene();

  if (simulationTime >= stopTime) {
    finishShot();
    return;
  }

  animationFrameId = requestAnimationFrame(animateProjectile);
}

// End of shot

function finishShot() {
  const shot = {
    angle: activeShot.angle,
    speed: activeShot.speed,
    vx: activeShot.vx,
    vy: activeShot.vy,

    heightAtWall: activeShot.wall.reachesWall ? activeShot.wall.height : null,

    landingX: activeShot.landingX,

    result: activeShot.result,
  };

  shotHistory.push(shot);

  renderShotHistory();

  if (activeShot.result === "HIT WALL") {
    setStatus(
      `Hit the wall! ` +
        `Projectile height at wall: ` +
        `${format(activeShot.wall.height)} m. ` +
        `Wall height: ` +
        `${format(currentRound.wallHeight)} m.`,
      "miss",
    );
  } else if (activeShot.result === "HIT") {
    setStatus(
      `Direct hit! ` +
        `Landing position: ` +
        `${format(activeShot.landingX)} m. ` +
        `Target center: ` +
        `${format(currentRound.targetDistance)} m.`,
      "hit",
    );
  } else if (activeShot.result === "SHORT") {
    setStatus(
      `Short! ` +
        `Landing position: ` +
        `${format(activeShot.landingX)} m. ` +
        `Target center: ` +
        `${format(currentRound.targetDistance)} m.`,
      "miss",
    );
  } else {
    setStatus(
      `Overshot! ` +
        `Landing position: ` +
        `${format(activeShot.landingX)} m. ` +
        `Target center: ` +
        `${format(currentRound.targetDistance)} m.`,
      "miss",
    );
  }

  animationRunning = false;
  animationFrameId = null;

  const roundWon = activeShot.result === "HIT";

  const roundOver = roundWon || attemptsUsed >= MAX_ATTEMPTS;

  if (roundOver) {
    setControlsDisabled(true);

    launchButton.disabled = true;

    newRoundButton.disabled = false;
  } else {
    setControlsDisabled(false);

    launchButton.disabled = false;

    newRoundButton.disabled = true;
  }

  drawScene();
}

function cancelAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }

  animationFrameId = null;
  animationRunning = false;
  activeShot = null;
}

// Canvas sizing

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  const width = Math.max(320, rect.width || 800);

  const height = Math.max(300, rect.height || 420);

  const pixelWidth = Math.round(width * dpr);

  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;

    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  view.width = width;
  view.height = height;
  view.dpr = dpr;
}

// World-to-screen scaling

function calculateView() {
  const candidateAngles = [
    currentRound.angleMin,

    currentRound.angleMax,

    (currentRound.angleMin + currentRound.angleMax) / 2,

    clamp(45, currentRound.angleMin, currentRound.angleMax),
  ];

  let maxRange = currentRound.targetDistance + TARGET_TOLERANCE + 5;

  let maxHeight = currentRound.wallHeight + 4;

  for (const angle of candidateAngles) {
    maxRange = Math.max(maxRange, calculateRange(currentRound.speedMax, angle));

    maxHeight = Math.max(
      maxHeight,
      calculatePeakHeight(currentRound.speedMax, angle),
    );
  }

  view.left = Math.max(50, view.width * 0.07);

  view.right = Math.max(25, view.width * 0.04);

  view.top = Math.max(20, view.height * 0.06);

  view.groundY = view.height - Math.max(58, view.height * 0.16);

  view.maxX = maxRange + 3;

  view.maxY = maxHeight * 1.2;

  view.scaleX = (view.width - view.left - view.right) / view.maxX;

  view.scaleY = (view.groundY - view.top) / view.maxY;
}

function worldToCanvas(x, y) {
  return {
    x: view.left + x * view.scaleX,

    y: view.groundY - y * view.scaleY,
  };
}

// Main drawing function

function drawScene() {
  if (!currentRound) {
    return;
  }

  resizeCanvas();
  calculateView();

  ctx.clearRect(0, 0, view.width, view.height);

  drawSky();
  drawGround();
  drawDistanceTicks();
  drawTarget();
  drawWall();
  drawCatapult();

  if (activeShot) {
    drawTrail(activeShot.trail);

    drawProjectile(activeShot.point);
  }
}

// Sky

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, view.groundY);

  sky.addColorStop(0, "#72c5f5");

  sky.addColorStop(1, "#d9f2ff");

  ctx.fillStyle = sky;

  ctx.fillRect(0, 0, view.width, view.groundY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";

  drawCloud(view.width * 0.22, view.height * 0.16, 0.9);

  drawCloud(view.width * 0.72, view.height * 0.12, 1.1);
}

function drawCloud(x, y, scale) {
  ctx.beginPath();

  ctx.arc(x, y, 17 * scale, 0, Math.PI * 2);

  ctx.arc(x + 22 * scale, y - 7 * scale, 22 * scale, 0, Math.PI * 2);

  ctx.arc(x + 45 * scale, y, 16 * scale, 0, Math.PI * 2);

  ctx.fill();
}

// Ground

function drawGround() {
  ctx.fillStyle = "#63a44e";

  ctx.fillRect(0, view.groundY, view.width, 16);

  ctx.fillStyle = "#8d643d";

  ctx.fillRect(
    0,
    view.groundY + 16,
    view.width,
    view.height - view.groundY - 16,
  );

  ctx.strokeStyle = "#3f6f34";

  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.moveTo(0, view.groundY);

  ctx.lineTo(view.width, view.groundY);

  ctx.stroke();
}

// Distance markers

function drawDistanceTicks() {
  const step = view.maxX > 80 ? 10 : 5;

  ctx.save();

  ctx.font = "11px system-ui, sans-serif";

  ctx.fillStyle = "rgba(23, 32, 51, 0.7)";

  ctx.strokeStyle = "rgba(23, 32, 51, 0.25)";

  for (let x = 0; x <= view.maxX; x += step) {
    const point = worldToCanvas(x, 0);

    ctx.beginPath();

    ctx.moveTo(point.x, view.groundY - 5);

    ctx.lineTo(point.x, view.groundY + 7);

    ctx.stroke();

    ctx.fillText(`${x} m`, point.x - 12, view.groundY + 28);
  }

  ctx.restore();
}

// Catapult

function drawCatapult() {
  const base = worldToCanvas(0, 0);

  const x = base.x;
  const y = base.y;

  ctx.save();

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Wheels
  ctx.fillStyle = "#4a3424";

  ctx.beginPath();

  ctx.arc(x + 8, y - 2, 11, 0, Math.PI * 2);

  ctx.arc(x + 46, y - 2, 11, 0, Math.PI * 2);

  ctx.fill();

  // Wooden base
  ctx.strokeStyle = "#704820";

  ctx.lineWidth = 9;

  ctx.beginPath();

  ctx.moveTo(x - 5, y - 14);

  ctx.lineTo(x + 56, y - 14);

  ctx.stroke();

  // Upright support
  ctx.strokeStyle = "#8d5b2d";

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.moveTo(x + 27, y - 14);

  ctx.lineTo(x + 29, y - 50);

  ctx.stroke();

  // Throwing arm
  ctx.beginPath();

  ctx.moveTo(x + 29, y - 43);

  ctx.lineTo(x + 64, y - 72);

  ctx.stroke();

  // Loaded boulder
  ctx.fillStyle = "#4b4e54";

  ctx.beginPath();

  ctx.arc(x + 67, y - 75, 7, 0, Math.PI * 2);

  ctx.fill();

  ctx.restore();
}

// Wall

function drawWall() {
  const bottom = worldToCanvas(currentRound.wallDistance, 0);

  const top = worldToCanvas(currentRound.wallDistance, currentRound.wallHeight);

  const width = Math.max(14, Math.min(24, view.scaleX * 1.1));

  const height = bottom.y - top.y;

  ctx.save();

  ctx.fillStyle = "#7b838c";

  ctx.fillRect(bottom.x - width / 2, top.y, width, height);

  ctx.strokeStyle = "#545b63";

  ctx.lineWidth = 1;

  const brickHeight = 13;

  for (let y = top.y + brickHeight; y < bottom.y; y += brickHeight) {
    ctx.beginPath();

    ctx.moveTo(bottom.x - width / 2, y);

    ctx.lineTo(bottom.x + width / 2, y);

    ctx.stroke();
  }

  ctx.restore();
}

// Target

function drawTarget() {
  const center = worldToCanvas(currentRound.targetDistance, 0);

  const radius = Math.max(10, Math.min(18, view.scaleX * TARGET_TOLERANCE));

  const y = center.y - 5;

  ctx.save();

  // Outer red ring
  ctx.fillStyle = "#c82f2f";

  ctx.beginPath();

  ctx.arc(center.x, y, radius, 0, Math.PI * 2);

  ctx.fill();

  // Gold ring
  ctx.fillStyle = "#f4d34d";

  ctx.beginPath();

  ctx.arc(center.x, y, radius * 0.62, 0, Math.PI * 2);

  ctx.fill();

  // Bullseye
  ctx.fillStyle = "#c82f2f";

  ctx.beginPath();

  ctx.arc(center.x, y, radius * 0.24, 0, Math.PI * 2);

  ctx.fill();

  ctx.restore();
}

// Projectile trail

function drawTrail(trail) {
  if (!trail || trail.length < 2) {
    return;
  }

  ctx.save();

  ctx.strokeStyle = "rgba(50, 60, 75, 0.35)";

  ctx.lineWidth = 2;

  ctx.setLineDash([5, 6]);

  ctx.beginPath();

  trail.forEach((point, index) => {
    const p = worldToCanvas(point.x, point.y);

    if (index === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });

  ctx.stroke();

  ctx.restore();
}

// Projectile

function drawProjectile(point) {
  if (!point) {
    return;
  }

  const p = worldToCanvas(point.x, point.y);

  ctx.save();

  ctx.fillStyle = "#50535a";

  ctx.strokeStyle = "#272a2f";

  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Event listeners

syncSliderAndNumber(angleSlider, angleInput, 0);

syncSliderAndNumber(speedSlider, speedInput, 1);

launchButton.addEventListener("click", launchProjectile);

newRoundButton.addEventListener("click", resetRound);

window.addEventListener("resize", () => {
  drawScene();
});

// Start game

function initializeGame() {
  try {
    generateRound();
  } catch (error) {
    console.error(error);

    setStatus(`Game failed to start: ${error.message}`, "miss");

    launchButton.disabled = true;
  }
}

initializeGame();
