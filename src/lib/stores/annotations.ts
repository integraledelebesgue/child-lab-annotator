import { writable, get } from "svelte/store";
import type { AnnotationRow, Target, Phase, PhaseKey } from "../types";

function createAnnotationStore() {
  const { subscribe, set, update } = writable<AnnotationRow[]>([]);

  return {
    subscribe,
    set,

    ensureFrame(frame: number, timestamp: number) {
      update((rows) => {
        if (frame < rows.length) return rows;
        const newRows = [...rows];
        while (newRows.length <= frame) {
          newRows.push({
            frame: newRows.length,
            timestamp: newRows.length === frame ? timestamp : 0,
            infantX: null,
            infantY: null,
            infantYaw: null,
            motherX: null,
            motherY: null,
            motherYaw: null,
          });
        }
        return newRows;
      });
    },

    recordPosition(frame: number, timestamp: number, target: Target, x: number, y: number) {
      update((rows) => {
        const newRows = [...rows];
        while (newRows.length <= frame) {
          newRows.push({
            frame: newRows.length,
            timestamp: newRows.length === frame ? timestamp : 0,
            infantX: null,
            infantY: null,
            infantYaw: null,
            motherX: null,
            motherY: null,
            motherYaw: null,
          });
        }
        const row = { ...newRows[frame], timestamp };
        if (target === "infant") {
          row.infantX = x;
          row.infantY = y;
        } else {
          row.motherX = x;
          row.motherY = y;
        }
        newRows[frame] = row;
        return newRows;
      });
    },

    recordOrientation(frame: number, timestamp: number, target: Target, yaw: number) {
      update((rows) => {
        const newRows = [...rows];
        while (newRows.length <= frame) {
          newRows.push({
            frame: newRows.length,
            timestamp: newRows.length === frame ? timestamp : 0,
            infantX: null,
            infantY: null,
            infantYaw: null,
            motherX: null,
            motherY: null,
            motherYaw: null,
          });
        }
        const row = { ...newRows[frame], timestamp };
        if (target === "infant") {
          row.infantYaw = yaw;
        } else {
          row.motherYaw = yaw;
        }
        newRows[frame] = row;
        return newRows;
      });
    },

    getRow(frame: number): AnnotationRow | undefined {
      return get({ subscribe })[frame];
    },

    clear() {
      set([]);
    },
  };
}

export const annotations = createAnnotationStore();

function createCompletedPhasesStore() {
  const { subscribe, set, update } = writable<Set<PhaseKey>>(new Set());

  return {
    subscribe,
    set,

    markComplete(target: Target, phase: Phase) {
      update((s) => {
        const next = new Set(s);
        next.add(`${target}-${phase}` as PhaseKey);
        return next;
      });
    },

    isComplete(target: Target, phase: Phase): boolean {
      let result = false;
      subscribe((s) => {
        result = s.has(`${target}-${phase}` as PhaseKey);
      })();
      return result;
    },

    reset() {
      set(new Set());
    },

    setFromData(rows: AnnotationRow[]) {
      const phases = new Set<PhaseKey>();
      const hasData = (vals: (number | null)[]) => vals.some((v) => v !== null);

      const infantXs = rows.map((r) => r.infantX);
      const infantYs = rows.map((r) => r.infantY);
      const infantYaws = rows.map((r) => r.infantYaw);
      const motherXs = rows.map((r) => r.motherX);
      const motherYs = rows.map((r) => r.motherY);
      const motherYaws = rows.map((r) => r.motherYaw);

      if (hasData(infantXs) && hasData(infantYs)) phases.add("infant-position");
      if (hasData(infantYaws)) phases.add("infant-orientation");
      if (hasData(motherXs) && hasData(motherYs)) phases.add("mother-position");
      if (hasData(motherYaws)) phases.add("mother-orientation");

      set(phases);
    },
  };
}

export const completedPhases = createCompletedPhasesStore();
