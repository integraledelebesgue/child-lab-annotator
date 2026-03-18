<script lang="ts">
  import type { SmileEvent } from "./types";
  import { EXPRESSION_LABELS, EXPRESSION_COLORS, INTENSITY_LABELS } from "./types";

  interface Props {
    events: SmileEvent[];
    onRemove: (id: number) => void;
    onClear: () => void;
    onExportCSV: () => void;
  }

  let { events, onRemove, onClear, onExportCSV }: Props = $props();

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3);
    return `${m}:${s.padStart(6, "0")}`;
  }
</script>

<aside class="event-sidebar">
  <div class="event-header">
    <span>Events</span>
    <span class="event-count">{events.length}</span>
  </div>

  <div class="event-list">
    {#if events.length === 0}
      <div class="empty-state">
        No events recorded yet.
        Hold Q/W/E to record.
      </div>
    {:else}
      <table class="event-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Expression</th>
            <th>Intensity</th>
            <th>Start [s]</th>
            <th>End [s]</th>
            <th>Duration [s]</th>
            <th>Frame Start</th>
            <th>Frame End</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each events as event, i (event.id)}
            <tr>
              <td class="num">{i + 1}</td>
              <td>
                <span class="expression-badge" style="background: {EXPRESSION_COLORS[event.type]}">
                  {EXPRESSION_LABELS[event.type]}
                </span>
              </td>
              <td class="intensity">{INTENSITY_LABELS[event.intensity]}</td>
              <td class="num">{event.startTime.toFixed(3)}</td>
              <td class="num">{event.endTime.toFixed(3)}</td>
              <td class="num">{(event.endTime - event.startTime).toFixed(3)}</td>
              <td class="num">{event.startFrame}</td>
              <td class="num">{event.endFrame}</td>
              <td>
                <button class="remove-btn" onclick={() => onRemove(event.id)} title="Remove event">
                  ×
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="event-footer">
    <button onclick={onClear} disabled={events.length === 0}>Clear</button>
    <button onclick={onExportCSV} disabled={events.length === 0}>Export CSV</button>
  </div>
</aside>

<style>
  .event-sidebar {
    width: 380px;
    min-width: 380px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .event-header {
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

  .event-count {
    background: var(--bg-surface);
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }

  .event-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .empty-state {
    padding: 24px 12px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
    line-height: 1.5;
  }

  .event-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .event-table th {
    position: sticky;
    top: 0;
    background: var(--bg-secondary);
    padding: 6px 6px;
    text-align: left;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-size: 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .event-table td {
    padding: 5px 6px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .event-table tr:hover {
    background: var(--bg-surface);
  }

  .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .intensity {
    font-size: 11px;
  }

  .expression-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
  }

  .remove-btn {
    padding: 1px 6px;
    font-size: 14px;
    line-height: 1;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .remove-btn:hover {
    color: #ef4444;
    background: none;
  }

  .event-footer {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }

  .event-footer button {
    flex: 1;
    font-size: 12px;
    padding: 5px 10px;
  }
</style>
