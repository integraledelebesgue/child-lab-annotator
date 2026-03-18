<script lang="ts">
  import "./app.css";
  import TabBar from "./lib/components/TabBar.svelte";
  import HeadTrackingTask from "./lib/tasks/head-tracking/HeadTrackingTask.svelte";
  import SmileTask from "./lib/tasks/smile/SmileTask.svelte";

  const tabs = [
    { id: "head-tracking", label: "Head Tracking" },
    { id: "smile", label: "Smile Annotation" },
  ];

  let activeTab = $state("head-tracking");
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
