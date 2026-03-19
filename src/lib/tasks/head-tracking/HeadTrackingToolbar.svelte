<script lang="ts">
    import type { Target, Phase, PhaseKey, ShapeSizes } from "./types";

    interface Props {
        target: Target;
        phase: Phase;
        completed: Set<PhaseKey>;
        videoPath: string | null;
        shapeSizes: ShapeSizes;
        hasVideo: boolean;
        hasFragments: boolean;
        fragmentLength: number;
        onTargetChange: (t: Target) => void;
        onPhaseChange: (p: Phase) => void;
        onLoadVideo: () => void;
        onLoadCSV: () => void;
        onExportCSV: () => void;
        onFragment: () => void;
        onClearFragments: () => void;
    }

    let {
        target,
        phase,
        completed,
        videoPath,
        shapeSizes = $bindable(),
        hasVideo,
        hasFragments,
        fragmentLength = $bindable(),
        onTargetChange,
        onPhaseChange,
        onLoadVideo,
        onLoadCSV,
        onExportCSV,
        onFragment,
        onClearFragments,
    }: Props = $props();

    function isPhaseComplete(t: Target, p: Phase): boolean {
        return completed.has(`${t}-${p}` as PhaseKey);
    }
</script>

<div class="toolbar">
    <div class="toolbar-group">
        <button onclick={onLoadVideo}>Load Video</button>
        <button onclick={onLoadCSV}>Load CSV</button>
    </div>

    <div class="toolbar-group">
        {#if !hasFragments}
            <label class="size-control">
                <span class="size-label">Len</span>
                <input
                    type="range"
                    class="size-slider"
                    min="5"
                    max="60"
                    step="5"
                    bind:value={fragmentLength}
                />
                <span class="size-value">{fragmentLength}s</span>
            </label>
            <button onclick={onFragment} disabled={!hasVideo}>Fragment</button>
        {:else}
            <button onclick={onClearFragments}>Clear Fragments</button>
        {/if}
    </div>

    <div class="toolbar-group">
        <span class="label">Target:</span>
        <label class="radio" class:active={target === "infant"}>
            <input
                type="radio"
                name="ht-target"
                value="infant"
                checked={target === "infant"}
                onchange={() => onTargetChange("infant")}
            />
            <span class="dot infant"></span>
            Infant
        </label>
        <label class="radio" class:active={target === "mother"}>
            <input
                type="radio"
                name="ht-target"
                value="mother"
                checked={target === "mother"}
                onchange={() => onTargetChange("mother")}
            />
            <span class="dot mother"></span>
            Mother
        </label>
    </div>

    <div class="toolbar-group">
        <span class="label">Phase:</span>
        <label class="radio" class:active={phase === "position"}>
            <input
                type="radio"
                name="ht-phase"
                value="position"
                checked={phase === "position"}
                onchange={() => onPhaseChange("position")}
            />
            Position
        </label>
        <label class="radio" class:active={phase === "orientation"}>
            <input
                type="radio"
                name="ht-phase"
                value="orientation"
                checked={phase === "orientation"}
                onchange={() => onPhaseChange("orientation")}
            />
            Orientation
        </label>
    </div>

    <div class="toolbar-group">
        <button onclick={onExportCSV}>Export CSV</button>
    </div>

    <div class="toolbar-group sizes">
        <span class="label">Size:</span>
        <label class="size-control">
            <span class="size-label">R</span>
            <input
                type="range"
                class="size-slider"
                min="10"
                max="120"
                step="1"
                bind:value={shapeSizes[target].circleRadius}
            />
            <span class="size-value">{shapeSizes[target].circleRadius}</span>
        </label>
        <label class="size-control">
            <span class="size-label">A</span>
            <input
                type="range"
                class="size-slider"
                min="10"
                max="120"
                step="1"
                bind:value={shapeSizes[target].ellipseA}
            />
            <span class="size-value">{shapeSizes[target].ellipseA}</span>
        </label>
        <label class="size-control">
            <span class="size-label">B</span>
            <input
                type="range"
                class="size-slider"
                min="10"
                max="120"
                step="1"
                bind:value={shapeSizes[target].ellipseB}
            />
            <span class="size-value">{shapeSizes[target].ellipseB}</span>
        </label>
    </div>

    {#if videoPath}
        <div class="toolbar-group filename">
            <span class="file-label" title={videoPath}>{videoPath}</span>
        </div>
    {/if}

    <div class="toolbar-group status">
        {#each ["infant", "mother"] as t}
            {#each ["position", "orientation"] as p}
                <span
                    class="phase-status"
                    class:done={isPhaseComplete(t as Target, p as Phase)}
                >
                    {isPhaseComplete(t as Target, p as Phase) ? "✓" : "○"}
                    {t}
                    {p}
                </span>
            {/each}
        {/each}
    </div>
</div>

<style>
    .toolbar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 16px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border);
        flex-wrap: wrap;
    }

    .toolbar-group {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .label {
        color: var(--text-muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .radio {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        border: 1px solid transparent;
        transition: all 0.15s;
    }

    .radio:hover {
        background: var(--bg-surface);
    }

    .radio.active {
        background: var(--bg-surface);
        border-color: var(--border);
    }

    .radio input {
        display: none;
    }

    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }

    .dot.infant {
        background: var(--accent-infant);
    }

    .dot.mother {
        background: var(--accent-mother);
    }

    .sizes {
        gap: 6px;
    }

    .size-control {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .size-label {
        color: var(--text-muted);
        font-size: 11px;
        min-width: 10px;
    }

    .size-slider {
        width: 80px;
        accent-color: var(--accent-active);
    }

    .size-value {
        color: var(--accent-active);
        font-size: 11px;
        min-width: 18px;
        text-align: right;
    }

    .filename {
        color: var(--text-muted);
        font-size: 12px;
    }

    .file-label {
        max-width: 500px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        direction: rtl;
        text-align: left;
    }

    .status {
        margin-left: auto;
        gap: 12px;
    }

    .phase-status {
        font-size: 11px;
        color: var(--text-muted);
    }

    .phase-status.done {
        color: var(--accent-mother);
    }
</style>
