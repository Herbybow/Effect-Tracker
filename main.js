import OBR from "@owlbear-rodeo/sdk";

const NS = "com.effect-tracker/data";
let trackedCharacters = [];
let activeCharacterId = null;
let refreshBusy = false;
let refreshQueued = false;
const $ = (id) => document.getElementById(id);

function notify(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function isCharacter(item) {
  return Boolean(item && item.layer === "CHARACTER" && item.type === "IMAGE");
}

function getBleeds(item) {
  const value = item?.metadata?.[NS]?.effects?.bleed;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return [{
      id: value.id || `legacy-${value.appliedAt || Date.now()}`,
      power: Number(value.power) || Number(value.damage) || 1,
      charges: Math.max(0, Number(value.charges) || 0),
      appliedAt: value.appliedAt || new Date().toISOString()
    }].filter((bleed) => bleed.charges > 0);
  }
  return [];
}

function getActiveCharacter() {
  return trackedCharacters.find((item) => item.id === activeCharacterId) || null;
}

function renderCharacterPicker() {
  const picker = $("character-select");
  const previous = activeCharacterId;
  picker.replaceChildren();
  for (const item of trackedCharacters) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || "Unnamed character";
    picker.append(option);
  }

  activeCharacterId = trackedCharacters.some((item) => item.id === previous)
    ? previous
    : (trackedCharacters[0]?.id ?? null);
  if (activeCharacterId) picker.value = activeCharacterId;
  picker.disabled = trackedCharacters.length === 0;

  const active = getActiveCharacter();
  $("character-name").textContent = active?.name || "No character assigned";
  $("selection-label").textContent = active
    ? "This character has an independent effect tracker."
    : "Right-click a character token and choose Assign Effect Tracker.";
}

function renderCurrent() {
  const host = $("current-effects");
  host.replaceChildren();
  const item = getActiveCharacter();
  if (!item) {
    host.className = "empty";
    host.textContent = "Assign a character to see its current effects.";
    return;
  }

  const bleeds = getBleeds(item);
  if (!bleeds.length) {
    host.className = "empty";
    host.textContent = "No active effects on this character.";
    return;
  }

  host.className = "current-list";
  const summary = document.createElement("p");
  summary.className = "muted";
  summary.textContent = `${bleeds.length} independent Bleed effect${bleeds.length === 1 ? "" : "s"}`;
  host.append(summary);

  const tags = document.createElement("div");
  tags.className = "current-effect-tags";
  for (const bleed of bleeds) {
    const tag = document.createElement("span");
    tag.className = "effect-tag";
    tag.textContent = `3×${bleed.power} · ${bleed.charges}/3 charges`;
    tags.append(tag);
  }
  host.append(tags);
}

function renderActiveEffects() {
  const host = $("effects");
  host.replaceChildren();
  const item = getActiveCharacter();
  if (!item) {
    host.className = "empty";
    host.textContent = "Choose an assigned character first.";
    $("test-tick").disabled = true;
    return;
  }

  const bleeds = getBleeds(item);
  if (!bleeds.length) {
    host.className = "empty";
    host.textContent = "No active Bleed on this character.";
    $("test-tick").disabled = true;
    return;
  }

  host.className = "";
  const totalDamage = bleeds.reduce((sum, bleed) => sum + bleed.power, 0);
  for (const [index, bleed] of bleeds.entries()) {
    const row = document.createElement("div");
    row.className = "effect-row";
    const left = document.createElement("strong");
    left.textContent = `Bleed ${index + 1}`;
    const right = document.createElement("span");
    right.textContent = `3×${bleed.power} · ${bleed.charges}/3`;
    row.append(left, right);
    host.append(row);
  }

  const total = document.createElement("p");
  total.className = "hint";
  total.textContent = `Combined damage at the next turn: ${totalDamage} HP (one charge consumed from each Bleed).`;
  host.append(total);
  $("test-tick").disabled = false;
}

async function refreshTrackedCharacters() {
  if (refreshBusy) {
    refreshQueued = true;
    return;
  }
  refreshBusy = true;
  try {
    const items = await OBR.scene.items.getItems(isCharacter);
    trackedCharacters = items.filter((item) => item.metadata?.[NS]?.tracked === true);
    renderCharacterPicker();
    renderCurrent();
    renderActiveEffects();
  } catch (error) {
    console.error("Effect Tracker refresh error", error);
    notify(`Could not refresh characters: ${error?.message || error}`);
  } finally {
    refreshBusy = false;
    if (refreshQueued) {
      refreshQueued = false;
      void refreshTrackedCharacters();
    }
  }
}

async function updateCharacter(itemId, mutate) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const current = item.metadata?.[NS] ?? { effects: {} };
      const next = JSON.parse(JSON.stringify(current));
      next.effects ??= {};
      mutate(next, item);
      item.metadata = { ...item.metadata, [NS]: next };
    }
  });
}

async function applyBleed(power) {
  const item = getActiveCharacter();
  if (!item) {
    notify("Choose or assign one character first.");
    return;
  }

  try {
    await updateCharacter(item.id, (data) => {
      const current = data.effects.bleed;
      const bleeds = Array.isArray(current)
        ? current
        : (current && typeof current === "object" ? [{
            id: current.id || `legacy-${current.appliedAt || Date.now()}`,
            power: Number(current.power) || Number(current.damage) || 1,
            charges: Math.max(0, Number(current.charges) || 0),
            appliedAt: current.appliedAt || new Date().toISOString()
          }] : []);
      bleeds.push({
        id: crypto.randomUUID(),
        power,
        charges: 3,
        appliedAt: new Date().toISOString(),
        schemaVersion: 2
      });
      data.effects.bleed = bleeds.filter((bleed) => bleed.charges > 0);
    });
    notify(`Added a new 3×${power} Bleed to ${item.name || "the character"}.`);
    await refreshTrackedCharacters();
  } catch (error) {
    console.error("Effect Tracker apply error", error);
    notify(`Could not apply Bleed: ${error?.message || error}`);
  }
}

async function testTick() {
  const item = getActiveCharacter();
  if (!item) return;
  const bleeds = getBleeds(item);
  if (!bleeds.length) return;

  const totalDamage = bleeds.reduce((sum, bleed) => sum + bleed.power, 0);
  try {
    await updateCharacter(item.id, (data) => {
      const current = Array.isArray(data.effects.bleed) ? data.effects.bleed : getBleeds(item);
      data.effects.bleed = current
        .map((bleed) => ({ ...bleed, charges: Math.max(0, Number(bleed.charges) - 1) }))
        .filter((bleed) => bleed.charges > 0);
      if (data.effects.bleed.length === 0) delete data.effects.bleed;
    });
    notify(`Test tick: ${item.name || "Character"} would lose ${totalDamage} HP. One charge consumed from every Bleed. HP is not modified yet.`);
    await refreshTrackedCharacters();
  } catch (error) {
    console.error("Effect Tracker test tick error", error);
    notify(`Could not consume Bleed charges: ${error?.message || error}`);
  }
}

OBR.onReady(() => {
  void (async () => {
    try {
      document.querySelectorAll("#tiers button[data-tier]").forEach((button) => {
        button.addEventListener("click", () => applyBleed(Number(button.dataset.tier)));
      });
      $("test-tick").addEventListener("click", testTick);
      $("refresh").addEventListener("click", refreshTrackedCharacters);
      $("reload-effects").addEventListener("click", refreshTrackedCharacters);
      $("character-select").addEventListener("change", (event) => {
        activeCharacterId = event.target.value || null;
        renderCharacterPicker();
        renderCurrent();
        renderActiveEffects();
      });

      await OBR.contextMenu.create({
        id: "com.effect-tracker/context-menu",
        icons: [
          {
            icon: "https://herbybow.github.io/Effect-Tracker/assign.svg",
            label: "Assign Effect Tracker",
            filter: {
              every: [
                { key: "layer", value: "CHARACTER" },
                { key: ["metadata", NS], value: undefined }
              ]
            }
          },
          {
            icon: "https://herbybow.github.io/Effect-Tracker/unassign.svg",
            label: "Remove from Effect Tracker",
            filter: {
              every: [
                { key: "layer", value: "CHARACTER" },
                { key: ["metadata", NS, "tracked"], value: true }
              ]
            }
          }
        ],
        async onClick(context, elementId) {
          const shouldAssign = elementId === "0";
          await OBR.scene.items.updateItems(context.items, (items) => {
            for (const item of items) {
              const current = item.metadata?.[NS] ?? { effects: {} };
              const next = JSON.parse(JSON.stringify(current));
              if (shouldAssign) next.tracked = true;
              else delete next.tracked;
              item.metadata = { ...item.metadata, [NS]: next };
            }
          });
          if (shouldAssign && context.items[0]) activeCharacterId = context.items[0].id;
          await refreshTrackedCharacters();
          notify(shouldAssign ? "Character assigned to Effect Tracker." : "Character removed from Effect Tracker.");
        }
      });

      OBR.scene.items.onChange((items) => {
        const previousId = activeCharacterId;
        trackedCharacters = items.filter((item) => isCharacter(item) && item.metadata?.[NS]?.tracked === true);
        if (!trackedCharacters.some((item) => item.id === previousId)) {
          activeCharacterId = trackedCharacters[0]?.id ?? null;
        }
        renderCharacterPicker();
        renderCurrent();
        renderActiveEffects();
      });

      OBR.scene.onReadyChange((ready) => {
        if (ready) void refreshTrackedCharacters();
      });
      await refreshTrackedCharacters();
    } catch (error) {
      console.error("Effect Tracker startup error", error);
      notify(`Effect Tracker startup error: ${error?.message || error}`);
    }
  })();
});

window.addEventListener("error", (event) => {
  console.error("Effect Tracker script error", event.error || event.message);
  notify(`Script error: ${event.message || "unknown error"}`);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Effect Tracker rejected promise", event.reason);
  notify(`Connection error: ${event.reason?.message || event.reason || "unknown error"}`);
});
