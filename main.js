import OBR from "https://esm.sh/@owlbear-rodeo/sdk@1.5.2";

const NS = "com.effect-tracker/data";
let selectedItems = [];
let selectedIds = [];
let refreshBusy = false;
let refreshQueued = false;
let selectionPoll = null;
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

function getEffects(item) {
  const data = item?.metadata?.[NS];
  return data?.effects && typeof data.effects === "object" ? data.effects : {};
}

function prettyEffectName(key) {
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describeEffect(key, effect) {
  if (key === "bleed") {
    const power = Number(effect?.power) || Number(effect?.damage) || 1;
    const charges = Number(effect?.charges) || 0;
    return `Bleed · 3x${power} · ${charges}/3 charges`;
  }
  const charges = Number(effect?.charges);
  return `${prettyEffectName(key)}${Number.isFinite(charges) ? ` · ${charges} charges` : ""}`;
}

async function readSelection() {
  if (refreshBusy) {
    refreshQueued = true;
    return;
  }
  refreshBusy = true;
  try {
    const ids = (await OBR.player.getSelection()) ?? [];
    selectedIds = Array.isArray(ids) ? ids : [];
    const items = selectedIds.length ? await OBR.scene.items.getItems(selectedIds) : [];
    selectedItems = items.filter(isCharacter);

    $("connection-status").textContent = "Connected to Owlbear Rodeo.";
    $("selection-count").textContent = `${selectedItems.length} selected`;
    $("selection-label").textContent = selectedItems.length
      ? "Selected character(s) are ready. Choose a Bleed power below to apply it."
      : "Select a character token on the map. This panel updates automatically.";

    const selectionList = $("selection-list");
    selectionList.replaceChildren();
    for (const item of selectedItems) {
      const chip = document.createElement("span");
      chip.className = "token";
      chip.textContent = item.name || "Unnamed character";
      selectionList.append(chip);
    }

    renderCurrent();
    renderActiveEffects();
  } catch (error) {
    console.error("Effect Tracker selection error", error);
    $("connection-status").textContent = `Owlbear API error: ${error?.message || error}`;
  } finally {
    refreshBusy = false;
    if (refreshQueued) {
      refreshQueued = false;
      void readSelection();
    }
  }
}

function renderCurrent() {
  const host = $("current-effects");
  host.replaceChildren();
  if (!selectedItems.length) {
    host.className = "empty";
    host.textContent = "Select a character to see its current effects.";
    return;
  }
  host.className = "current-list";
  for (const item of selectedItems) {
    const card = document.createElement("div");
    card.className = "current-character";
    const heading = document.createElement("strong");
    heading.textContent = item.name || "Unnamed character";
    card.append(heading);
    const effects = Object.entries(getEffects(item));
    if (!effects.length) {
      const empty = document.createElement("p");
      empty.className = "muted current-empty";
      empty.textContent = "No active effects.";
      card.append(empty);
    } else {
      const list = document.createElement("div");
      list.className = "current-effect-tags";
      for (const [key, effect] of effects) {
        const tag = document.createElement("span");
        tag.className = "effect-tag";
        tag.textContent = describeEffect(key, effect);
        list.append(tag);
      }
      card.append(list);
    }
    host.append(card);
  }
}

function renderActiveEffects() {
  const host = $("effects");
  host.replaceChildren();
  const rows = selectedItems.flatMap((item) =>
    Object.entries(getEffects(item)).map(([key, effect]) => ({ item, key, effect }))
  );
  if (!rows.length) {
    host.className = "empty";
    host.textContent = selectedItems.length ? "No active effect on the selected character(s)." : "Select a character to inspect active effects.";
    $("test-tick").disabled = true;
    return;
  }
  host.className = "";
  for (const { item, key, effect } of rows) {
    const row = document.createElement("div");
    row.className = "effect-row";
    const left = document.createElement("strong");
    left.textContent = item.name || "Character";
    const right = document.createElement("span");
    right.textContent = describeEffect(key, effect);
    row.append(left, right);
    host.append(row);
  }
  $("test-tick").disabled = !rows.some(({ key, effect }) => key === "bleed" && Number(effect?.charges) > 0);
}

async function updateCharacter(itemId, mutate) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const current = item.metadata?.[NS] ?? { effects: {} };
      const next = JSON.parse(JSON.stringify(current));
      mutate(next, item);
      item.metadata = { ...item.metadata, [NS]: next };
    }
  });
}

async function applyBleed(power) {
  if (!selectedItems.length) {
    notify("Select a character token on the map first.");
    return;
  }
  const targets = [...selectedItems];
  try {
    for (const item of targets) {
      await updateCharacter(item.id, (data) => {
        data.effects ??= {};
        data.effects.bleed = {
          power,
          damage: power,
          charges: 3,
          appliedAt: new Date().toISOString(),
          schemaVersion: 1
        };
      });
    }
    notify(`Bleed 3×${power} applied to ${targets.length} character(s).`);
    await readSelection();
  } catch (error) {
    console.error("Effect Tracker apply error", error);
    notify(`Could not apply Bleed: ${error?.message || error}`);
  }
}

async function testTick() {
  const targets = selectedItems.filter((item) => {
    const bleed = getEffects(item).bleed;
    return bleed && Number(bleed.charges) > 0;
  });
  if (!targets.length) return;
  try {
    for (const item of targets) {
      await updateCharacter(item.id, (data) => {
        const effect = data.effects?.bleed;
        if (!effect) return;
        effect.charges = Math.max(0, Number(effect.charges) - 1);
        effect.lastTestTickAt = new Date().toISOString();
        if (effect.charges === 0) delete data.effects.bleed;
      });
    }
    notify(`Test only: consumed one Bleed charge on ${targets.length} character(s). HP was not changed.`);
    await readSelection();
  } catch (error) {
    console.error("Effect Tracker test tick error", error);
    notify(`Could not consume Bleed charge: ${error?.message || error}`);
  }
}

function showStartupError(message) {
  const status = $("connection-status");
  if (status) status.textContent = message;
}

// This module is loaded inside Owlbear's action popover. The SDK's onReady
// method returns an unsubscribe function (not a Promise), so do not chain .catch().
OBR.onReady(() => {
  void (async () => {
    try {
      showStartupError("Owlbear SDK ready. Connecting to the current scene…");
      document.querySelectorAll("#tiers button[data-tier]").forEach((button) => {
        button.addEventListener("click", () => applyBleed(Number(button.dataset.tier)));
      });
      $("test-tick").addEventListener("click", testTick);
      $("refresh").addEventListener("click", readSelection);
      $("reload-effects").addEventListener("click", readSelection);

      OBR.scene.items.onChange(() => { void readSelection(); });
      OBR.scene.onReadyChange((ready) => {
        if (ready) void readSelection();
      });

      await readSelection();
      // The public SDK documents getSelection(), but does not expose a dedicated
      // selection-change subscription. Poll while this popover is open.
      selectionPoll = window.setInterval(() => { void readSelection(); }, 500);
    } catch (error) {
      console.error("Effect Tracker startup error", error);
      showStartupError(`Startup error: ${error?.message || error}`);
    }
  })();
});

window.addEventListener("error", (event) => {
  console.error("Effect Tracker script error", event.error || event.message);
  showStartupError(`Script error: ${event.message || "unknown error"}`);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Effect Tracker rejected promise", event.reason);
  showStartupError(`Connection error: ${event.reason?.message || event.reason || "unknown error"}`);
});
