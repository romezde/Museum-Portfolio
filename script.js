/*
 * THE MUSEUM WALK
 * Content: projects.js | Appearance: style.css | Page text: index.html
 * The lower half of this file handles interaction. The middle draws the scene.
 */

// 1. EDITABLE GALLERY SETTINGS
// Distances below are virtual scene units, not pixels.
const GALLERY_SETTINGS = {
  firstSectionDistance: 15,
  artworkStartOffset: 7,
  artworkRowSpacing: 8,
  sectionGap: 9,
  artworkMaxWidth: 5.2,
  artworkMaxHeight: 3.4,
  distantHallwayWidth: 0.54, // Smaller makes the far end tighter.
  nearbyWidthIncrease: 0.24, // Added to the distant width near the viewer.
  hallwayTaperDistance: 18, // How gradually the hallway opens toward you.
  scrollPixelsPerUnit: 100, // Larger means slower walking per scroll.
};

// 2. SCENE SETUP AND CURRENT CAMERA STATE
const $ = (id) => document.getElementById(id),
  canvas = $("museum"),
  context = canvas.getContext("2d");
const sections = window.MUSEUM_SECTIONS,
  works = [];
let start = GALLERY_SETTINGS.firstSectionDistance;
sections.forEach((section, index) => {
  section.start = start;
  section.index = index;
  section.works.forEach((w, i) => {
    Object.assign(w, {
      section,
      index: works.length,
      s:
        start +
        GALLERY_SETTINGS.artworkStartOffset +
        Math.floor(i / 2) * GALLERY_SETTINGS.artworkRowSpacing,
      side: i % 2 ? 1 : -1,
    });
    works.push(w);
  });
  section.end =
    start +
    Math.ceil(section.works.length / 2) * GALLERY_SETTINGS.artworkRowSpacing +
    GALLERY_SETTINGS.artworkStartOffset;
  start = section.end + GALLERY_SETTINGS.sectionGap;
});
const end = start + 1,
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let viewportWidth = innerWidth,
  viewportHeight = innerHeight,
  focalLength = 800,
  cameraPosition = 0,
  target = 0,
  floorRadius = 70,
  grid = false,
  saved = 0,
  selected = null,
  hits = [],
  animationFrameId = 0,
  last = 0;
// 3. PLACEHOLDER ARTWORK — replaced when you supply image paths in projects.js.
function createSampleArtwork(i) {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 620;
  const g = c.getContext("2d"),
    p = [
      ["#c7cbb4", "#879276", "#48553f"],
      ["#d4c5b2", "#a88f73", "#675d4c"],
      ["#b5c4c5", "#7f9da0", "#3f6269"],
    ][i % 3];
  g.fillStyle = p[0];
  g.fillRect(0, 0, 900, 620);
  const grad = g.createLinearGradient(0, 0, 900, 620);
  grad.addColorStop(0, "#ffffff55");
  grad.addColorStop(1, "#00000022");
  g.fillStyle = grad;
  g.fillRect(0, 0, 900, 620);
  g.fillStyle = p[1];
  g.beginPath();
  g.moveTo(0, 430);
  g.lineTo(450, 340);
  g.lineTo(900, 430);
  g.lineTo(900, 620);
  g.lineTo(0, 620);
  g.fill();
  if (i % 2 === 0) {
    for (let n = 0; n < 3; n++) {
      const x = 180 + n * 220,
        y = 140 + (n % 2) * 65;
      g.fillStyle = p[2];
      g.fillRect(x, y, 130, 300 - y / 2);
      g.beginPath();
      g.ellipse(x + 65, y, 65, 25, 0, 0, Math.PI * 2);
      g.fillStyle = p[1];
      g.fill();
      g.fillStyle = "#eee9d7";
      g.fillRect(x + 15, y + 45, 100, 150);
    }
  } else {
    g.fillStyle = p[2];
    g.beginPath();
    g.roundRect(210, 95, 480, 370, [220, 220, 0, 0]);
    g.fill();
    g.fillStyle = p[0];
    g.beginPath();
    g.roundRect(240, 125, 420, 340, [195, 195, 0, 0]);
    g.fill();
    g.fillStyle = p[2];
    g.fillRect(300, 385, 310, 38);
    g.fillRect(320, 420, 20, 65);
    g.fillRect(570, 420, 20, 65);
  }
  g.fillStyle = "#f5f2e7";
  g.fillRect(28, 28, 205, 36);
  g.fillStyle = "#515746";
  g.font = "14px Arial";
  g.fillText("SAMPLE / REPLACE IMAGE", 40, 51);
  return c;
}
works.forEach((w) => {
  w.texture = createSampleArtwork(w.index);
  w.preview = w.texture.toDataURL();
  if (w.image) {
    const im = new Image();
    im.onload = () => {
      w.texture = im;
      w.preview = w.image;
      buildCollection();
      requestRender();
    };
    im.onerror = () => {
      w.failed = true;
    };
    im.src = w.image;
  }
});
// Bring both walls inward and gently tighten the distant hallway.
// The same taper applies to floors, frames, and signs so they stay aligned.
// 4. PERSPECTIVE MATH — positions on the curved floor become screen coordinates.
// x = left/right, y = height, s = distance along the hallway.
function getScenePoint(x, y, s) {
  const d = s - cameraPosition;
  x *=
    GALLERY_SETTINGS.distantHallwayWidth +
    GALLERY_SETTINGS.nearbyWidthIncrease *
      Math.exp(-Math.max(0, d) / GALLERY_SETTINGS.hallwayTaperDistance);
  if (floorRadius > 1e7) return { x, y: y - 2.25, z: d };
  const a = d / floorRadius;
  return {
    x,
    y: (floorRadius + y) * Math.cos(a) - floorRadius - 2.25,
    z: (floorRadius + y) * Math.sin(a),
  };
}
function projectToScreen(p) {
  return {
    x: viewportWidth / 2 + (p.x * focalLength) / p.z,
    y: viewportHeight * 0.46 - (p.y * focalLength) / p.z,
  };
}
function clipAtCamera(vertices) {
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      ina = a.z > 0.15,
      inb = b.z > 0.15;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (0.15 - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0.15 });
    }
  }
  return out;
}
function drawPolygon(vertices, color) {
  const v = clipAtCamera(vertices);
  if (v.length < 3) return;
  context.beginPath();
  v.forEach((p, i) => {
    const q = projectToScreen(p);
    i ? context.lineTo(q.x, q.y) : context.moveTo(q.x, q.y);
  });
  context.closePath();
  context.fillStyle = color;
  context.fill();
}
function getWallCorners(side, y1, y2, s1, s2) {
  return [
    getScenePoint(side * 4.5, y2, s1),
    getScenePoint(side * 4.5, y2, s2),
    getScenePoint(side * 4.5, y1, s2),
    getScenePoint(side * 4.5, y1, s1),
  ];
}
function getFrontCorners(x1, x2, y1, y2, s) {
  return [
    getScenePoint(x1, y2, s),
    getScenePoint(x2, y2, s),
    getScenePoint(x2, y1, s),
    getScenePoint(x1, y1, s),
  ];
}
// Map small image triangles onto the wall to preserve perspective.
function drawImageTriangle(im, src, dst) {
  const [a, b, c] = src,
    [p, q, r] = dst,
    den = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
  if (!den) return;
  const A = (p.x * (b.y - c.y) + q.x * (c.y - a.y) + r.x * (a.y - b.y)) / den,
    B = (p.y * (b.y - c.y) + q.y * (c.y - a.y) + r.y * (a.y - b.y)) / den,
    C = (p.x * (c.x - b.x) + q.x * (a.x - c.x) + r.x * (b.x - a.x)) / den,
    D = (p.y * (c.x - b.x) + q.y * (a.x - c.x) + r.y * (b.x - a.x)) / den,
    E =
      (p.x * (b.x * c.y - c.x * b.y) +
        q.x * (c.x * a.y - a.x * c.y) +
        r.x * (a.x * b.y - b.x * a.y)) /
      den,
    G =
      (p.y * (b.x * c.y - c.x * b.y) +
        q.y * (c.x * a.y - a.x * c.y) +
        r.y * (a.x * b.y - b.x * a.y)) /
      den;
  context.save();
  context.beginPath();
  const mx = (p.x + q.x + r.x) / 3,
    my = (p.y + q.y + r.y) / 3;
  [p, q, r].forEach((v, i) => {
    const dx = v.x - mx,
      dy = v.y - my,
      l = Math.hypot(dx, dy) || 1;
    const x = v.x + (dx / l) * 0.65,
      y = v.y + (dy / l) * 0.65;
    i ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.closePath();
  context.clipAtCamera();
  const dx = canvas.width / viewportWidth,
    dy = canvas.height / viewportHeight;
  context.setTransform(A * dx, B * dy, C * dx, D * dy, E * dx, G * dy);
  context.drawImage(im, 0, 0);
  context.restore();
}
function drawPerspectiveImage(im, v) {
  if (v.some((p) => p.z <= 0.2)) return;
  const iw = im.naturalWidth || im.width,
    ih = im.naturalHeight || im.height,
    N = 6;
  const lerp = (u, t) => {
    const p = {};
    for (const k of ["x", "y", "z"])
      p[k] =
        (v[0][k] * (1 - u) + v[1][k] * u) * (1 - t) +
        (v[3][k] * (1 - u) + v[2][k] * u) * t;
    return projectToScreen(p);
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const u = i / N,
        t = j / N,
        u2 = (i + 1) / N,
        t2 = (j + 1) / N,
        s = [
          { x: u * iw, y: t * ih },
          { x: u2 * iw, y: t * ih },
          { x: u2 * iw, y: t2 * ih },
          { x: u * iw, y: t2 * ih },
        ],
        d = [lerp(u, t), lerp(u2, t), lerp(u2, t2), lerp(u, t2)];
      drawImageTriangle(im, [s[0], s[1], s[2]], [d[0], d[1], d[2]]);
      drawImageTriangle(im, [s[0], s[2], s[3]], [d[0], d[2], d[3]]);
    }
}
// 5. DRAWING — frames, overhead signs, floor tiles, and walls.
function drawArtwork(w) {
  const ratio =
      (w.texture.naturalWidth || w.texture.width) /
      (w.texture.naturalHeight || w.texture.height),
    len = Math.min(
      GALLERY_SETTINGS.artworkMaxWidth,
      GALLERY_SETTINGS.artworkMaxHeight * ratio,
    ),
    h = len / ratio,
    s1 = w.s - len / 2,
    s2 = w.s + len / 2,
    y1 = 2.9 - h / 2,
    y2 = 2.9 + h / 2;
  drawPolygon(
    getWallCorners(w.side, y1 - 0.18, y2 + 0.18, s1 - 0.18, s2 + 0.18),
    "#5a5345",
  );
  drawPolygon(
    getWallCorners(w.side, y1 - 0.12, y2 + 0.12, s1 - 0.12, s2 + 0.12),
    "#f8f4e8",
  );
  let v = getWallCorners(w.side, y1, y2, s1, s2);
  if (w.side === 1) v = [v[1], v[0], v[3], v[2]];
  drawPerspectiveImage(w.texture, v);
  if (v.every((p) => p.z > 0.2)) {
    hits.push({ work: w, pts: v.map(projectToScreen) });
  }
  drawPolygon(
    getWallCorners(w.side, y1 - 0.52, y1 - 0.3, s1, s1 + 1),
    "#f6f4eb",
  );
}
function drawSectionSign(s) {
  const v = getFrontCorners(-2.8, 2.8, 4.35, 5.85, s.start);
  drawPolygon(v, "#eeece3");
  if (v.some((p) => p.z <= 0.2)) return;
  const center = projectToScreen(getScenePoint(0, 5.13, s.start)),
    scale = focalLength / getScenePoint(0, 5.13, s.start).z;
  context.fillStyle = "#56604b";
  context.textAlign = "center";
  context.font = `${Math.max(1, scale * 0.54)}px Georgia`;
  context.fillText(s.title, center.x, center.y, 5 * scale);
  context.font = `${Math.max(1, scale * 0.095)}px Arial`;
  context.fillText(
    `${String(s.index + 1).padStart(2, "0")} / ${s.subtitle}`,
    center.x,
    center.y + scale * 0.35,
    4.9 * scale,
  );
  [-2.3, 2.3].forEach((x) =>
    drawPolygon(
      getFrontCorners(x - 0.015, x + 0.015, 5.85, 7, s.start),
      "#9da18f",
    ),
  );
}
function getHorizonY() {
  return (
    viewportHeight * 0.46 +
    (focalLength * Math.sqrt((floorRadius + 2.25) ** 2 - floorRadius ** 2)) /
      floorRadius
  );
}
function renderMuseum() {
  context.setTransform(
    canvas.width / viewportWidth,
    0,
    0,
    canvas.height / viewportHeight,
    0,
    0,
  );
  context.fillStyle = "#e6e8df";
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  hits = [];
  const far = Math.min(
    end + 25,
    cameraPosition + Math.min(75, floorRadius * 1.2),
  );
  for (let s = Math.floor(far); s >= Math.floor(cameraPosition); s--) {
    const t = s + 1;
    drawPolygon(
      [
        getScenePoint(-4.5, 0, s),
        getScenePoint(4.5, 0, s),
        getScenePoint(4.5, 0, t),
        getScenePoint(-4.5, 0, t),
      ],
      Math.floor(s / 3) % 2 ? "#dadcd0" : "#dddfd3",
    );
    for (const side of [-1, 1]) {
      drawPolygon(
        getWallCorners(side, 0, 7, s, t),
        side === -1 ? "#ecebe3" : "#e5e6db",
      );
      drawPolygon(getWallCorners(side, 0, 0.13, s, t), "#c3c7b7");
    }
    if (s % 4 === 0)
      drawPolygon(
        [
          getScenePoint(-4.5, 0.006, s),
          getScenePoint(4.5, 0.006, s),
          getScenePoint(4.5, 0.006, s + 0.015),
          getScenePoint(-4.5, 0.006, s + 0.015),
        ],
        "#c8cdbe",
      );
    for (const x of [-3, -1.5, 0, 1.5, 3])
      drawPolygon(
        [
          getScenePoint(x, 0.009, s),
          getScenePoint(x + 0.008, 0.009, s),
          getScenePoint(x + 0.008, 0.009, t),
          getScenePoint(x, 0.009, t),
        ],
        "#ced2c4",
      );
  }
  const exhibits = [];
  works.forEach((w) => {
    if (w.s > cameraPosition + 2.85 && w.s < far)
      exhibits.push({ s: w.s, draw: () => drawArtwork(w) });
  });
  sections.forEach((s) => {
    if (s.start > cameraPosition + 0.2 && s.start < far)
      exhibits.push({ s: s.start, draw: () => drawSectionSign(s) });
  });
  exhibits
    .sort((a, b) => b.s - a.s)
    .forEach((e) => {
      context.save();
      if (
        floorRadius < 1e7 &&
        e.s - cameraPosition > Math.sqrt(2 * floorRadius * 2.25)
      ) {
        context.beginPath();
        context.rect(0, 0, viewportWidth, getHorizonY());
        context.clipAtCamera();
      }
      context.globalAlpha = Math.min(1, cameraPosition / 7);
      e.draw();
      context.restore();
    });
  const opacity = Math.max(0, 1 - cameraPosition / 7);
  $("intro").style.opacity = opacity;
  $("intro").style.visibility = opacity ? "visible" : "hidden";
  $("hint").hidden = cameraPosition < 7 || cameraPosition > end - 5 || grid;
  $("ending").hidden = cameraPosition < end - 5 || grid;
  const current = sections.filter((s) => cameraPosition >= s.start - 3).at(-1);
  $("section-name").textContent = current
    ? current.title.toUpperCase()
    : "THE ENTRANCE";
  $("number").textContent =
    `${String(current ? current.index + 1 : 0).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")}`;
  $("progress").style.width = `${(cameraPosition / end) * 100}%`;
}
// 6. WALKING AND RESIZING — ease toward the scroll position.
function animateCamera(time) {
  animationFrameId = 0;
  const dt = Math.min(50, time - last || 16);
  last = time;
  cameraPosition = reduced
    ? target
    : cameraPosition + (target - cameraPosition) * (1 - Math.exp(-dt / 95));
  if (Math.abs(target - cameraPosition) < 0.002) cameraPosition = target;
  if (!grid) renderMuseum();
  if (cameraPosition !== target)
    animationFrameId = requestAnimationFrame(animateCamera);
}
function requestRender() {
  if (!animationFrameId)
    animationFrameId = requestAnimationFrame(animateCamera);
}
function onScroll() {
  if (!grid) {
    target = Math.max(
      0,
      Math.min(end, scrollY / GALLERY_SETTINGS.scrollPixelsPerUnit),
    );
    requestRender();
  }
}
function resize() {
  viewportWidth = innerWidth;
  viewportHeight = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(viewportHeight * dpr);
  focalLength = Math.min(viewportWidth * 0.85, viewportHeight * 0.95);
  $("spacer").style.height =
    `${end * GALLERY_SETTINGS.scrollPixelsPerUnit + viewportHeight}px`;
  onScroll();
  requestRender();
}
function walkTo(s) {
  scrollTo({
    top: s * GALLERY_SETTINGS.scrollPixelsPerUnit,
    behavior: reduced ? "instant" : "smooth",
  });
}
// 7. ARTWORK VIEWER AND THE ALTERNATIVE COLLECTION GRID
function open(w) {
  selected = w;
  $("detail-image").src = w.preview;
  $("detail-image").alt = w.image ? w.title : `Sample artwork for ${w.title}`;
  $("detail-title").textContent = w.title;
  $("detail-section").textContent = w.section.title;
  $("description").textContent = w.description;
  $("upload-status").textContent = "";
  $("detail").showModal();
  document.body.style.overflow = "hidden";
}
function buildCollection() {
  const root = $("grid");
  root.replaceChildren();
  sections.forEach((s) => {
    const heading = document.createElement("h3");
    heading.className = "collection-heading";
    heading.textContent = s.title;
    root.append(heading);
    s.works.forEach((w) => {
      const button = document.createElement("button");
      button.className = "collection-item";
      const im = document.createElement("img");
      im.src = w.preview;
      im.alt = w.title;
      im.loading = "lazy";
      const title = document.createElement("h3");
      title.textContent = w.title;
      const note = document.createElement("p");
      note.textContent = w.image
        ? "VIEW ARTWORK ↗"
        : "SAMPLE / ADD YOUR SCREENSHOT";
      button.append(im, title, note);
      button.onclick = () => open(w);
      root.append(button);
    });
  });
}
function pointInsidePolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function findArtworkAt(x, y) {
  return [...hits]
    .reverse()
    .find(
      (a) =>
        pointInsidePolygon(a.pts, x, y) &&
        !(
          floorRadius < 1e7 &&
          a.work.s - cameraPosition > Math.sqrt(2 * floorRadius * 2.25) &&
          y > getHorizonY()
        ),
    );
}
// 8. INPUT — distinguish a tap on artwork from a swipe to walk.
let down = null;
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, scroll: scrollY };
});
canvas.addEventListener("pointerup", (e) => {
  if (
    !down ||
    Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 ||
    Math.abs(scrollY - down.scroll) > 10
  )
    return;
  const a = findArtworkAt(e.clientX, e.clientY);
  if (a && cameraPosition > 5) open(a.work);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse")
    canvas.style.cursor = findArtworkAt(e.clientX, e.clientY)
      ? "pointer"
      : "default";
});
// 9. BUTTONS, CURVATURE SLIDER, AND LOCAL IMAGE PREVIEW
$("enter").onclick = () => walkTo(17);
$("restart").onclick = () => walkTo(0);
document.querySelector(".brand").onclick = (e) => {
  e.preventDefault();
  if (grid) $("view").click();
  walkTo(0);
};
$("view").onclick = () => {
  if (!grid) saved = scrollY;
  grid = !grid;
  document.body.classList.toggle("grid-mode", grid);
  $("collection").hidden = !grid;
  $("walk").hidden = grid;
  $("view").textContent = grid ? "Museum view ↗" : "Collection ↗";
  if (grid) {
    scrollTo(0, 0);
    $("ending").hidden = true;
  } else {
    scrollTo(0, saved);
    onScroll();
    requestRender();
  }
};
$("settings-button").onclick = () => {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("settings-button").setAttribute("aria-expanded", String(open));
};
$("curve").oninput = (e) => {
  const v = +e.target.value;
  floorRadius = v === 0 ? 1e9 : Math.max(40, 180 - v * 2);
  $("curve-value").textContent =
    v === 0 ? "Flat" : v < 35 ? "Subtle" : v < 75 ? "Gentle" : "Pronounced";
  requestRender();
};
$("close").onclick = () => $("detail").close();
$("detail").addEventListener("close", () => {
  document.body.style.overflow = "";
});
$("upload-button").onclick = () => $("upload").click();
$("upload").onchange = (e) => {
  const file = e.target.files[0];
  if (!file || !selected) return;
  if (!file.type.startsWith("image/")) {
    $("upload-status").textContent = "Please choose an image.";
    return;
  }
  const w = selected,
    url = URL.createObjectURL(file),
    im = new Image();
  im.onload = () => {
    if (w.objectUrl) URL.revokeObjectURL(w.objectUrl);
    w.objectUrl = url;
    w.texture = im;
    w.preview = url;
    w.image = url;
    $("detail-image").src = url;
    $("detail-image").alt = w.title;
    $("upload-status").textContent =
      "Your screenshot is now hanging in the gallery.";
    buildCollection();
    requestRender();
  };
  im.onerror = () => {
    URL.revokeObjectURL(url);
    $("upload-status").textContent =
      "This image could not be opened. Try JPG, PNG, or WebP.";
  };
  im.src = url;
  e.target.value = "";
};
// 10. START THE MUSEUM
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", resize);
buildCollection();
resize();
