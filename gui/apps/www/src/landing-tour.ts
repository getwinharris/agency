/** A public, offline sample. It never creates sessions or sends a prompt. */
export function landingTour() {
  return `<div class="landing-tour" data-landing-tour aria-label="Interactive workspace sample">
  <header class="tour-top"><img src="/brand/bapx-logo-main.svg" width="66" height="22" alt="bapX"><strong>Signup flow review</strong><span>Interactive sample</span></header>
  <div class="tour-layout">
    <aside class="tour-sidebar" aria-label="Sample workspace">
      <span>New thread</span><span>Plugins</span><span>Skills</span><span>Library</span><span>Hosted Sites</span><span>Automations</span>
      <small>Website</small><b>Signup flow review</b><span>Mobile navigation</span><span>Release notes</span>
    </aside>
    <div class="tour-main">
      <div class="tour-thread">
        <p data-tour-message hidden>What’s the status of the signup flow?</p>
        <p data-tour-response hidden>Review complete. The signup flow is documented and the findings are ready to review.</p>
      </div>
      <details class="tour-goal"><summary>Goal</summary><p>Review the signup flow and record the findings.</p></details>
      <div class="tour-composer">
        <p data-tour-prompt aria-label="Sample prompt">What’s the status of the signup flow?</p>
        <div class="tour-controls">
          <label>Agent <select data-tour-agent disabled><option>Codex</option><option>Claude Code</option><option>OpenCode</option><option>Hermes</option></select></label>
          <label>Workspace <select data-tour-target disabled><option value="local">Local</option><option value="cloud">Cloud</option></select></label>
          <button data-tour-send type="button" disabled>Send</button>
        </div>
      </div>
      <footer class="tour-footer"><p data-tour-status role="status">Play to try switching workspaces and agents.</p><button data-tour-play type="button">Play workspace demo</button></footer>
    </div>
  </div>
</div>`;
}
