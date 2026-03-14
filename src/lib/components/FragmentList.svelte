<script lang="ts">
  import type { Fragment } from "../types";

  interface Props {
    fragments: Fragment[];
    activeFragmentId: number | null;
    onSelectFragment: (id: number) => void;
  }

  let { fragments, activeFragmentId, onSelectFragment }: Props = $props();

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
</script>

<aside class="fragment-sidebar">
  <div class="fragment-header">
    <span>Fragments</span>
    <span class="fragment-count">{fragments.length}</span>
  </div>
  <div class="fragment-list">
    {#each fragments as frag (frag.id)}
      <button
        class="fragment-item"
        class:active={activeFragmentId === frag.id}
        onclick={() => onSelectFragment(frag.id)}
      >
        <div class="fragment-thumbnail">
          {#if frag.thumbnail}
            <img src={frag.thumbnail} alt="Fragment {frag.id + 1}" />
          {:else}
            <div class="thumbnail-placeholder">{frag.id + 1}</div>
          {/if}
        </div>
        <div class="fragment-info">
          <span class="fragment-label">Fragment {frag.id + 1}</span>
          <span class="fragment-range">
            {formatTime(frag.startTime)} – {formatTime(frag.endTime)}
          </span>
          <span class="fragment-phases">
            {frag.completedPhases.size}/4 phases
          </span>
        </div>
      </button>
    {/each}
  </div>
</aside>

<style>
  .fragment-sidebar {
    width: 240px;
    min-width: 240px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .fragment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .fragment-count {
    background: var(--bg-surface);
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }

  .fragment-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .fragment-item {
    display: flex;
    gap: 8px;
    width: 100%;
    padding: 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .fragment-item:hover {
    background: var(--bg-surface);
  }

  .fragment-item.active {
    background: var(--bg-surface);
    border-color: var(--accent-active);
  }

  .fragment-thumbnail {
    width: 72px;
    min-width: 72px;
    height: 48px;
    border-radius: 4px;
    overflow: hidden;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fragment-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
  }

  .fragment-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .fragment-label {
    font-size: 12px;
    font-weight: 500;
  }

  .fragment-range {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .fragment-phases {
    font-size: 10px;
    color: var(--text-muted);
  }
</style>
