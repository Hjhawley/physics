"use strict";

// ---------- SETTINGS ----------

const G = 9.8;
const MAX_ATTEMPTS = 3;
const TARGET_TOLERANCE = 1;

const SPEED_MIN = 15;
const SPEED_MAX = 30;

const ANGLE_MIN = 20;
const ANGLE_MAX = 70;

// Restrict solve-for-angle rounds to one branch.
const SOLVE_ANGLE_MIN = 20;
const SOLVE_ANGLE_MAX = 45;

const TARGET_MIN = 30;
const TARGET_MAX = 60;

// ---------- ELEMENTS ----------

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const targetInfo = document.getElementById("targetInfo");
const givenInfo = document.getElementById("givenInfo");
const solveInfo = document.getElementById("solveInfo");
const attemptsRemaining = document.getElementById("attemptsRemaining");

const wallCard = document.getElementById("wallCard");
const wallInfo = document.getElementById("wallInfo");
const wallToggle = document.getElementById("wallToggle");

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

// ---------- HELPERS ----------

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------- PHYSICS ----------

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

function projectileRange(speed, angle) {
  const theta = radians(angle);

  return (speed * speed * Math.sin(2 * theta)) / G;
}

function heightAtX(x, speed, angle) {
  const theta = radians(angle);

  return (
    x * Math.tan(theta) -
    (G * x * x) / (2 * speed * speed * Math.cos(theta) ** 2)
  );
}

// ---------- ROUND GENERATION ----------

function generateRound() {
  cancelShot();

  while (true) {
    const mode = Math.random() < 0.5 ? "speed" : "angle";

    const solutionAngle =
      mode === "speed" ? randomInt(25, 65) : randomInt(23, 43);

    const solutionSpeed = round1(random(18, 29));

    const targetDistance = round1(
      projectileRange(solutionSpeed, solutionAngle),
    );

    if (targetDistance < TARGET_MIN || targetDistance > TARGET_MAX) {
      continue;
    }

    round = {
      mode,
      solutionAngle,
      solutionSpeed,
      targetDistance,
      wall: null,
    };

    // Optional AP wall challenge.
    if (wallToggle.checked) {
      const distance = round1(targetDistance * random(0.3, 0.65));

      const trajectoryHeight = heightAtX(
        distance,
        solutionSpeed,
        solutionAngle,
      );

      const height = round1(trajectoryHeight * random(0.55, 0.75));

      if (height < 2.5 || height > 12) {
        continue;
      }

      round.wall = {
        distance,
        height,
      };
    }

    break;
  }

  attempts = 0;
  shot = null;

  configureRound();
  updateAttempts();

  shotSummary.innerHTML = "";

  validationMessage.textContent = "";

  setStatus(
    "Calculate the missing launch variable, then test your shot.",
    "neutral",
  );

  drawScene();
}

// ---------- ROUND SETUP ----------

function configureRound() {
  targetInfo.textContent = `${round.targetDistance.toFixed(1)} m away`;

  wallCard.hidden = !round.wall;

  if (round.wall) {
    wallInfo.textContent =
      `${round.wall.distance.toFixed(1)} m away, ` +
      `${round.wall.height.toFixed(1)} m tall`;
  }

  if (round.mode === "speed") {
    givenInfo.textContent = `Angle = ${round.solutionAngle}°`;

    solveInfo.textContent = "Diagonal launch speed";

    angleSlider.value = round.solutionAngle;

    angleInput.value = round.solutionAngle;

    speedSlider.value = 22.5;
    speedInput.value = "22.5";
  } else {
    givenInfo.textContent = `Speed = ${round.solutionSpeed.toFixed(1)} m/s`;

    solveInfo.textContent = "Launch angle";

    speedSlider.value = round.solutionSpeed;

    speedInput.value = round.solutionSpeed.toFixed(1);

    angleSlider.value = 32;
    angleInput.value = 32;
  }

  enableControls();
}

function enableControls() {
  const solveForSpeed = round.mode === "speed";

  angleSlider.disabled = solveForSpeed;

  angleInput.disabled = solveForSpeed;

  speedSlider.disabled = !solveForSpeed;

  speedInput.disabled = !solveForSpeed;

  launchButton.disabled = attempts >= MAX_ATTEMPTS;

  newRoundButton.disabled = false;
}

function disableControls() {
  angleSlider.disabled = true;
  angleInput.disabled = true;
  speedSlider.disabled = true;
  speedInput.disabled = true;

  launchButton.disabled = true;
  newRoundButton.disabled = true;
}

function updateAttempts() {
  attemptsRemaining.textContent = `Attempts remaining: ${MAX_ATTEMPTS - attempts}`;
}

// ---------- INPUTS ----------

function syncControls(slider, input, decimals = 0) {
  slider.addEventListener("input", () => {
    const value = Number(slider.value);

    input.value = decimals ? value.toFixed(decimals) : value;

    drawScene();
  });

  input.addEventListener("change", () => {
    let value = Number(input.value);

    if (!Number.isFinite(value)) {
      value = Number(slider.value);
    }

    value = clamp(value, Number(input.min), Number(input.max));

    if (!decimals) {
      value = Math.round(value);
    }

    slider.value = value;

    input.value = decimals ? value.toFixed(decimals) : value;

    drawScene();
  });
}

// ---------- LAUNCH ----------

function launchProjectile() {
  if (shot || attempts >= MAX_ATTEMPTS) {
    return;
  }

  const angle = Number(angleInput.value);

  const speed = Number(speedInput.value);

  if (!Number.isFinite(angle) || !Number.isFinite(speed)) {
    validationMessage.textContent = "Enter a valid value.";

    return;
  }

  validationMessage.textContent = "";

  attempts++;
  updateAttempts();

  const { vx, vy } = velocityComponents(speed, angle);

  const landing = projectileRange(speed, angle);

  const totalTime = flightTime(speed, angle);

  let wallHeight = null;
  let wallHit = false;
  let stopTime = totalTime;

  if (round.wall && landing >= round.wall.distance) {
    wallHeight = heightAtX(round.wall.distance, speed, angle);

    wallHit = wallHeight <= round.wall.height;

    if (wallHit) {
      stopTime = round.wall.distance / vx;
    }
  }

  shot = {
    angle,
    speed,
    vx,
    vy,
    landing,
    wallHeight,
    wallHit,
    stopTime,
    startTime: null,
    time: 0,
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

  shot.time = Math.min((timestamp - shot.startTime) / 1000, shot.stopTime);

  drawScene();

  if (shot.time >= shot.stopTime) {
    finishShot();
  } else {
    animationFrame = requestAnimationFrame(animate);
  }
}

// ---------- RESULT ----------

function finishShot() {
  animationFrame = null;

  let result;

  if (shot.wallHit) {
    result = "WALL";

    setStatus(
      `Hit the wall! Height at wall: ` + `${shot.wallHeight.toFixed(1)} m.`,
      "miss",
    );
  } else if (
    Math.abs(shot.landing - round.targetDistance) <= TARGET_TOLERANCE
  ) {
    result = "SUCCESS";

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

  const roundOver = result === "SUCCESS" || attempts >= MAX_ATTEMPTS;

  shot = null;

  if (roundOver) {
    angleSlider.disabled = true;
    angleInput.disabled = true;
    speedSlider.disabled = true;
    speedInput.disabled = true;

    launchButton.disabled = true;
    newRoundButton.disabled = false;
  } else {
    enableControls();
  }

  drawScene();
}

// ---------- SUMMARY ----------

function addSummary(result) {
  const wallText = !round.wall
    ? null
    : shot.wallHeight === null
      ? "Did not reach wall"
      : `${shot.wallHeight.toFixed(1)} m`;

  shotSummary.insertAdjacentHTML(
    "beforeend",
    `
      <article class="summary-card">

        <div class="summary-cell">
          <span>Attempt</span>
          <strong>${attempts}</strong>
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

        ${
          round.wall
            ? `
              <div class="summary-cell">
                <span>Height at wall</span>
                <strong>${wallText}</strong>
              </div>
            `
            : ""
        }

        <div class="summary-cell">
          <span>Landing</span>
          <strong>
            ${shot.wallHit ? "—" : `${shot.landing.toFixed(1)} m`}
          </strong>
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
  if (!round) return;

  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  const width = Math.max(320, rect.width);

  const height = Math.max(300, rect.height);

  canvas.width = Math.round(width * dpr);

  canvas.height = Math.round(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const groundY = height - 60;

  const worldWidth = Math.max(70, round.targetDistance + 12);

  const scale = (width - 90) / worldWidth;

  // Sky
  ctx.fillStyle = "#dff";
  ctx.fillRect(0, 0, width, groundY);

  // Ground
  ctx.fillStyle = "#6a4";
  ctx.fillRect(0, groundY, width, 15);

  ctx.fillStyle = "#863";
  ctx.fillRect(0, groundY + 15, width, height - groundY - 15);

  drawTicks(scale, groundY, worldWidth);

  drawTarget(scale, groundY + 4);

  if (round.wall) {
    drawWall(scale, groundY);
  }

  drawCatapult(55, groundY);

  drawAngleIndicator(55, groundY, shot ? shot.angle : Number(angleInput.value));

  if (shot) {
    const point = positionAtTime(shot.speed, shot.angle, shot.time);

    drawProjectile(
      worldToScreen(point.x, Math.max(0, point.y), scale, groundY),
    );
  }
}

// ---------- SCENE OBJECTS ----------

function drawTicks(scale, groundY, worldWidth) {
  ctx.font = "14px system-ui";
  ctx.fillStyle = "white";
  ctx.strokeStyle = "gray";

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
  const bottom = worldToScreen(round.wall.distance, 0, scale, groundY);

  const top = worldToScreen(
    round.wall.distance,
    round.wall.height,
    scale,
    groundY,
  );

  ctx.fillStyle = "#777f88";

  ctx.fillRect(bottom.x - 9, top.y, 18, bottom.y - top.y);
}

function drawTarget(scale, groundY) {
  const point = worldToScreen(round.targetDistance, 0, scale, groundY);

  ctx.fillStyle = "red";

  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "white";

  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "red";

  ctx.beginPath();
  ctx.arc(point.x, groundY - 5, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCatapult(x, y) {
  ctx.strokeStyle = "#742";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 48, y - 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 24, y - 12);
  ctx.lineTo(x + 28, y - 40);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 28, y - 42);
  ctx.lineTo(x + 8, y - 48);
  ctx.stroke();
}

function drawAngleIndicator(x, y, angle) {
  if (!Number.isFinite(angle)) return;

  const pivotX = x + 28;
  const pivotY = y - 42;

  const theta = radians(angle);
  const length = 75;

  const endX = pivotX + length * Math.cos(theta);

  const endY = pivotY - length * Math.sin(theta);

  ctx.save();

  ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";

  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(pivotX + 30, pivotY);
  ctx.stroke();

  ctx.strokeStyle = "#2563eb";
  ctx.fillStyle = "#2563eb";

  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.font = "12px system-ui";

  ctx.fillText(`${Math.round(angle)}°`, endX + 5, endY - 4);

  ctx.restore();
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

wallToggle.addEventListener("change", generateRound);

window.addEventListener("resize", drawScene);

// ---------- START ----------

generateRound();
