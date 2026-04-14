<script lang="ts">
  import { onMount } from "svelte";
  import "./app.css";
  import TabBar from "./lib/components/TabBar.svelte";
  import HeadTrackingTask from "./lib/tasks/head-tracking/HeadTrackingTask.svelte";
  import SmileTask from "./lib/tasks/smile/SmileTask.svelte";
  import MutualGazeTask from "./lib/tasks/mutual-gaze/MutualGazeTask.svelte";
  import { getDebugLogStatus, logDebugEvent } from "./lib/utils/debugLog";

  const tabs = [
    { id: "head-tracking", label: "Head Tracking" },
    { id: "smile", label: "Smile Annotation" },
    { id: "mutual-gaze", label: "Mutual Gaze" },
  ];

  let activeTab = $state("head-tracking");

  onMount(() => {
    const onWindowError = (event: ErrorEvent) => {
      logDebugEvent("frontend", "window-error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error instanceof Error ? event.error.stack ?? event.error.message : String(event.error),
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logDebugEvent("frontend", "unhandled-rejection", {
        reason: reason instanceof Error ? reason.stack ?? reason.message : String(reason),
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    void getDebugLogStatus().then((status) => {
      logDebugEvent("frontend", "app-mounted", {
        debugLogEnabled: status.enabled,
        debugLogPath: status.path,
      });
    });

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  });
</script>

<div class="app">
  <TabBar {tabs} {activeTab} onTabChange={(id) => (activeTab = id)} />

  <div class="task-container">
    <div class="task-panel" class:hidden={activeTab !== "head-tracking"}>
      <HeadTrackingTask active={activeTab === "head-tracking"} />
    </div>
    <div class="task-panel" class:hidden={activeTab !== "smile"}>
      <SmileTask active={activeTab === "smile"} />
    </div>
    <div class="task-panel" class:hidden={activeTab !== "mutual-gaze"}>
      <MutualGazeTask active={activeTab === "mutual-gaze"} />
    </div>
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .task-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .task-panel {
    height: 100%;
  }

  .task-panel.hidden {
    display: none;
  }
</style>
