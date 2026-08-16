"use strict";

// ---------- GAME SETTINGS ----------

const G = 9.8;
const MAX_ATTEMPTS = 3;
const TARGET_TOLERANCE = 1;

const ANGLE_MIN = 20;
const ANGLE_MAX = 70;
const SPEED_MIN = 15;
const SPEED_MAX = 30;

const TARGET_MIN = 30;
const TARGET_MAX = 60;

const ANIMATION_SPEED = 1.7;

// ---------- ELEMENTS ----------

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const wallInfo = document.getElementById("wallInfo");
const targetInfo = document.getElementById("targetInfo");
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

// ---------- STATE ----------

let round;
let attempts = 0;
let shot = null;
let animationFrame = null;

// ---------- PHYSICS ----------

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function velocityComponents(speed, angle) {
  const theta = radians(angle);

  return {
    vx: speed * Math.cos(theta),
    vy: speed * Math.sin(theta),
  };
}

function positionAtTime(speed, angle, time) {
  const { vx, vy } = velocityComponents(speed, angle);

  return {
    x: vx * time,
    y: vy * time - 0.5 * G * time * time,
  };
}

function flightTime(speed, angle) {
  const { vy } = velocityComponents(speed, angle);
  return (2 * vy) / G;
}

function range(speed, angle) {
  const theta = radians(angle);
  return (speed * speed * Math.sin(2 * theta)) / G;
}

function heightAtX(x, speed, angle) {
  const theta = radians(angle);
  const cos = Math.cos(theta);

  return x * Math.tan(theta) - (G * x * x) / (2 * speed * speed * cos * cos);
}

// ---------- RANDOM ROUND ----------

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function generateRound() {
  cancelShot();

  while (true) {
    // Start with a guaranteed-valid shot.
    const solutionAngle = randomInt(30, 60);
    const solutionSpeed = round1(random(18, 28));

    const targetDistance = round1(range(solutionSpeed, solutionAngle));

    if (targetDistance < TARGET_MIN || targetDistance > TARGET_MAX) {
      continue;
    }

    const wallDistance = round1(targetDistance * random(0.3, 0.65));

    const solutionHeight = heightAtX(
      wallDistance,
      solutionSpeed,
      solutionAngle,
    );

    const wallHeight = round1(solutionHeight * random(0.55, 0.75));

    if (wallHeight < 2.5 || wallHeight > 12) {
      continue;
    }

    round = {
      targetDistance,
      wallDistance,
      wallHeight,
    };

    break;
  }

  attempts = 0;
  shot = null;

  angleSlider.value = 45;
  angleInput.value = 45;

  speedSlider.value = 22.5;
  speedInput.value = "22.5";

  wallInfo.textContent =
    `${round.wallDistance.toFixed(1)} m away, ` +
    `${round.wallHeight.toFixed(1)} m tall`;

  targetInfo.textContent = `${round.targetDistance.toFixed(1)} m away`;

  shotSummary.innerHTML = `
    <p class="summary-placeholder">
      Your launch data will appear here after the shot.
    </p>
  `;

  validationMessage.textContent = "";

  setStatus("Read the scenario, calculate your shot, then launch.", "neutral");

  enableControls();
  updateAttempts();
  drawScene();
}

// ---------- CONTROLS ----------

function syncControls(slider, input, decimals = 0) {
  slider.addEventListener("input", () => {
    input.value =
      decimals === 0 ? slider.value : Number(slider.value).toFixed(decimals);
  });

  input.addEventListener("change", () => {
    let value = Number(input.value);

    if (!Number.isFinite(value)) {
      value = Number(slider.value);
    }

    value = Math.max(Number(input.min), Math.min(Number(input.max), value));

    if (decimals === 0) {
      value = Math.round(value);
    }

    slider.value = value;
    input.value = decimals === 0 ? value : value.toFixed(decimals);
  });
}

function updateAttempts() {
  attemptsRemaining.textContent = `Attempts remaining: ${Math.max(0, MAX_ATTEMPTS - attempts)}`;
}

function disableControls() {
  angleSlider.disabled = true;
  angleInput.disabled = true;
  speedSlider.disabled = true;
  speedInput.disabled = true;
  launchButton.disabled = true;
  newRoundButton.disabled = true;
}

function enableControls() {
  angleSlider.disabled = false;
  angleInput.disabled = false;
  speedSlider.disabled = false;
  speedInput.disabled = false;

  launchButton.disabled = attempts >= MAX_ATTEMPTS;
  newRoundButton.disabled = false;
}

// ---------- LAUNCH ----------

function launchProjectile() {
  if (shot || attempts >= MAX_ATTEMPTS) {
    return;
  }

  const angle = Number(angleInput.value);
  const speed = Number(speedInput.value);

  if (
    !Number.isFinite(angle) ||
    !Number.isFinite(speed) ||
    angle < ANGLE_MIN ||
    angle > ANGLE_MAX ||
    speed < SPEED_MIN ||
    speed > SPEED_MAX
  ) {
    validationMessage.textContent =
      "Enter an angle from 20°–70° and a speed from 15–30 m/s.";
    return;
  }

  validationMessage.textContent = "";
  attempts++;
  updateAttempts();

  const { vx, vy } = velocityComponents(speed, angle);

  const landing = range(speed, angle);
  const totalTime = flightTime(speed, angle);

  const wallHeight =
    landing >= round.wallDistance
      ? heightAtX(round.wallDistance, speed, angle)
      : null;

  const wallHit = wallHeight !== null && wallHeight <= round.wallHeight;

  const wallTime = wallHit ? round.wallDistance / vx : null;

  shot = {
    angle,
    speed,
    vx,
    vy,
    landing,
    wallHeight,
    wallHit,
    totalTime,
    stopTime: wallHit ? wallTime : totalTime,
    startTime: null,
    time: 0,
    trail: [],
  };

  disableControls();
  setStatus("Projectile in flight…", "neutral");

  animationFrame = requestAnimationFrame(animate);
}

// ---------- ANIMATION ----------

function animate(timestamp) {
  if (!shot) return;

  if (shot.startTime === null) {
    shot.startTime = timestamp;
  }

  shot.time = Math.min(
    ((timestamp - shot.startTime) / 1000) * ANIMATION_SPEED,
    shot.stopTime,
  );

  if (shot.trail.length === 0 || shot.time - shot.trail.at(-1).time > 0.05) {
    const point = positionAtTime(shot.speed, shot.angle, shot.time);

    shot.trail.push({
      time: shot.time,
      x: point.x,
      y: Math.max(0, point.y),
    });
  }

  drawScene();

  if (shot.time >= shot.stopTime) {
    finishShot();
    return;
  }

  animationFrame = requestAnimationFrame(animate);
}

// ---------- RESULTS ----------

function finishShot() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;

  let result;

  if (shot.wallHit) {
    result = "HIT WALL";

    setStatus(
      `Hit the wall! Projectile height: ` +
        `${shot.wallHeight.toFixed(1)} m. ` +
        `Wall height: ${round.wallHeight.toFixed(1)} m.`,
      "miss",
    );
  } else if (
    Math.abs(shot.landing - round.targetDistance) <= TARGET_TOLERANCE
  ) {
    result = "HIT";

    setStatus(
      `Direct hit! Landing position: ` + `${shot.landing.toFixed(1)} m.`,
      "hit",
    );
  } else if (shot.landing < round.targetDistance - TARGET_TOLERANCE) {
    result = "SHORT";

    setStatus(
      `Short! Landing position: ` + `${shot.landing.toFixed(1)} m.`,
      "miss",
    );
  } else {
    result = "OVERSHOT";

    setStatus(
      `Overshot! Landing position: ` + `${shot.landing.toFixed(1)} m.`,
      "miss",
    );
  }

  addSummary(result);

  const hit = result === "HIT";

  shot = null;

  if (hit || attempts >= MAX_ATTEMPTS) {
    angleSlider.disabled = true;
    angleInput.disabled = true;
    speedSlider.disabled = true;
    speedInput.disabled = true;
    launchButton.disabled = true;

    // A new round can always be started once the shot is finished.
    newRoundButton.disabled = false;
  } else {
    enableControls();
  }

  drawScene();
}

function addSummary(result) {
  const attemptNumber = attempts;

  if (attemptNumber === 1) {
    shotSummary.innerHTML = "";
  }

  const wallText =
    shot.wallHeight === null
      ? "Did not reach wall"
      : `${shot.wallHeight.toFixed(1)} m`;

  shotSummary.insertAdjacentHTML(
    "beforeend",
    `
      <article class="summary-card">
        <div class="summary-cell">
          <span>Attempt</span>
          <strong>${attemptNumber}</strong>
        </div>

        <div class="summary-cell">
          <span>Angle</span>
          <strong>${shot.angle.toFixed(1)}°</strong>
        </div>

        <div class="summary-cell">
          <span>Speed</span>
          <strong>${shot.speed.toFixed(1)} m/s</strong>
        </div>

        <div class="summary-cell">
          <span>vx</span>
          <strong>${shot.vx.toFixed(1)} m/s</strong>
        </div>

        <div class="summary-cell">
          <span>vy</span>
          <strong>${shot.vy.toFixed(1)} m/s</strong>
        </div>

        <div class="summary-cell">
          <span>Height at wall</span>
          <strong>${wallText}</strong>
        </div>

        <div class="summary-cell">
          <span>Landing</span>
          <strong>${shot.wallHit ? "—" : `${shot.landing.toFixed(1)} m`}</strong>
        </div>

        <div class="summary-cell">
          <span>Result</span>
          <strong>${result}</strong>
        </div>
      </article>
    `,
  );
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
}

function cancelShot() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
  }

  animationFrame = null;
  shot = null;
}

// ---------- CANVAS ----------

function worldToScreen(x, y, scale, groundY) {
  return {
    x: 55 + x * scale,
    y: groundY - y * scale,
  };
}

function drawScene() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const width = Math.max(320, rect.width);
  const height = Math.max(300, rect.height);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const groundY = height - 60;

  // Leave room beyond the target for overshoots.
  const worldWidth = Math.max(70, round.targetDistance + 12);

  const scale = (width - 90) / worldWidth;

  // Sky
  ctx.fillStyle = "#d9f2ff";
  ctx.fillRect(0, 0, width, groundY);

  // Ground
  ctx.fillStyle = "#63a44e";
  ctx.fillRect(0, groundY, width, 15);

  ctx.fillStyle = "#8d643d";
  ctx.fillRect(0, groundY + 15, width, height - groundY - 15);

  drawTicks(scale, groundY, worldWidth);
  drawTarget(scale, groundY);
  drawWall(scale, groundY);
  drawCatapult(55, groundY);

  if (shot) {
    drawTrail(scale, groundY);

    const point = positionAtTime(shot.speed, shot.angle, shot.time);

    drawProjectile(
      worldToScreen(point.x, Math.max(0, point.y), scale, groundY),
    );
  }
}

function drawTicks(scale, groundY, worldWidth) {
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#46505f";
  ctx.strokeStyle = "#8b949f";

  for (let x = 0; x <= worldWidth; x += 5) {
    const point = worldToScreen(x, 0, scale, groundY);

    ctx.beginPath();
    ctx.moveTo(point.x, groundY - 4);
    ctx.lineTo(point.x, groundY + 6);
    ctx.stroke();

    ctx.fillText(`${x} m`, point.x - 10, groundY + 25);
  }
}

function drawWall(scale, groundY) {
  const bottom = worldToScreen(round.wallDistance, 0, scale, groundY);

  const top = worldToScreen(
    round.wallDistance,
    round.wallHeight,
    scale,
    groundY,
  );

  ctx.fillStyle = "#777f88";
  ctx.fillRect(bottom.x - 9, top.y, 18, bottom.y - top.y);
}

function drawTarget(scale, groundY) {
  const point = worldToScreen(round.targetDistance, 0, scale, groundY);

  ctx.fillStyle = "#c92f2f";
  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1d04b";
  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c92f2f";
  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCatapult(x, y) {
  ctx.strokeStyle = "#704820";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 48, y - 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 24, y - 12);
  ctx.lineTo(x + 28, y - 46);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 28, y - 42);
  ctx.lineTo(x + 58, y - 68);
  ctx.stroke();

  ctx.fillStyle = "#4d5056";
  ctx.beginPath();
  ctx.arc(x + 61, y - 71, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrail(scale, groundY) {
  if (shot.trail.length < 2) return;

  ctx.strokeStyle = "#4c556566";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);

  ctx.beginPath();

  shot.trail.forEach((point, index) => {
    const p = worldToScreen(point.x, point.y, scale, groundY);

    if (index === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });

  ctx.stroke();
  ctx.setLineDash([]);
}

function drawProjectile(point) {
  ctx.fillStyle = "#50535a";
  ctx.strokeStyle = "#22262b";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ---------- EVENTS ----------

syncControls(angleSlider, angleInput);
syncControls(speedSlider, speedInput, 1);

launchButton.addEventListener("click", launchProjectile);
newRoundButton.addEventListener("click", generateRound);

window.addEventListener("resize", drawScene);

// ---------- START ----------

generateRound();
