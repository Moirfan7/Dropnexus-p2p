/**
 * Bug Tracker ("Kami Solver") Controller
 * Captures errors, records developer notes, manages resolution status across app versions
 */

class BugTracker {
  constructor() {
    this.bugs = [];
    this.currentProject = null;
    this.currentVersion = null;
    this.lastDetectedError = null;

    this.initListeners();
  }

  initListeners() {
    document.getElementById('btn-new-bug')?.addEventListener('click', () => {
      this.openModal(this.lastDetectedError);
    });

    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('bug-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveBug();
    });
  }

  setContext(project, version) {
    this.currentProject = project;
    this.currentVersion = version;
    this.bugs = project?.bugs || [];
    this.renderBugs();
  }

  onAutoErrorDetected(errorData) {
    this.lastDetectedError = errorData;
    
    // Highlight Kami banner
    const banner = document.getElementById('bug-quick-alert');
    if (banner) {
      banner.style.display = 'block';
      banner.innerHTML = `⚠️ <strong>Error Detected:</strong> ${errorData.message} <button class="btn-secondary" style="margin-left:8px;padding:3px 8px;font-size:11px;" onclick="window.BugTracker.openModal(window.BugTracker.lastDetectedError)">Log This Kami</button>`;
    }
  }

  openModal(prefillData = null) {
    const modal = document.getElementById('bug-modal');
    if (!modal) return;

    document.getElementById('modal-version-tag').innerText = this.currentVersion?.version || 'v1.0.0';

    if (prefillData) {
      document.getElementById('bug-title-input').value = `Runtime Error: ${prefillData.message || 'Crash in app'}`;
      document.getElementById('bug-desc-input').value = `File: ${prefillData.filename || 'unknown'}\nLine: ${prefillData.lineno || 'N/A'}\nNotes: App me ye error observe kiya gaya.`;
      document.getElementById('bug-stack-input').value = prefillData.stack || '';
    } else {
      document.getElementById('bug-title-input').value = '';
      document.getElementById('bug-desc-input').value = '';
      document.getElementById('bug-stack-input').value = '';
    }

    modal.style.display = 'flex';
  }

  closeModal() {
    const modal = document.getElementById('bug-modal');
    if (modal) modal.style.display = 'none';
  }

  async saveBug() {
    if (!this.currentProject) {
      alert('Pehle ek project select karein.');
      return;
    }

    const title = document.getElementById('bug-title-input').value.trim();
    const description = document.getElementById('bug-desc-input').value.trim();
    const stackTrace = document.getElementById('bug-stack-input').value.trim();

    if (!title) {
      alert('Kripya bug ka title darj karein.');
      return;
    }

    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: this.currentProject.id,
          version: this.currentVersion?.version || 'v1.0.0',
          title,
          description,
          stackTrace
        })
      });

      const data = await res.json();
      if (data.success) {
        this.bugs.unshift(data.bug);
        this.renderBugs();
        this.closeModal();

        // Clear quick alert
        const banner = document.getElementById('bug-quick-alert');
        if (banner) banner.style.display = 'none';
        this.lastDetectedError = null;

        if (window.App) {
          window.App.refreshProjectData();
        }
      } else {
        alert('Bug save karne me error: ' + data.error);
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    }
  }

  async toggleBugStatus(bugId, currentStatus) {
    const newStatus = currentStatus === 'open' ? 'resolved' : 'open';
    const resolvedIn = newStatus === 'resolved' ? (this.currentVersion?.version || 'Current') : null;

    try {
      const res = await fetch(`/api/bugs/${bugId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          resolvedInVersion: resolvedIn
        })
      });

      const data = await res.json();
      if (data.success) {
        const bug = this.bugs.find(b => b.id === bugId);
        if (bug) {
          bug.status = newStatus;
          bug.resolvedInVersion = resolvedIn;
        }
        this.renderBugs();
        if (window.App) {
          window.App.refreshProjectData();
        }
      }
    } catch (err) {
      alert('Status update karne me error: ' + err.message);
    }
  }

  async deleteBug(bugId) {
    if (!confirm('Kya aap is bug entry ko delete karna chahte hain?')) return;

    try {
      const res = await fetch(`/api/bugs/${bugId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.bugs = this.bugs.filter(b => b.id !== bugId);
        this.renderBugs();
        if (window.App) {
          window.App.refreshProjectData();
        }
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  renderBugs() {
    const container = document.getElementById('bugs-list-container');
    const countBadge = document.getElementById('bug-count-badge');
    if (!container) return;

    const openCount = this.bugs.filter(b => b.status === 'open').length;
    if (countBadge) {
      countBadge.innerText = openCount > 0 ? `${openCount} Open` : 'All Clear';
      countBadge.className = openCount > 0 ? 'badge-pill badge-bug' : 'badge-pill badge-ok';
    }

    if (!this.bugs || this.bugs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px 10px;color:#64748b;font-size:12.5px;">
          <div style="font-size:28px;margin-bottom:6px;">✨</div>
          Koi kami / bug darj nahi hai.<br>Agar testing me koi problem dikhe to upar "Record Bug" click karein!
        </div>
      `;
      return;
    }

    container.innerHTML = this.bugs.map(bug => {
      const isResolved = bug.status === 'resolved';
      return `
        <div class="bug-card ${isResolved ? 'resolved' : ''}">
          <div class="bug-card-top">
            <div class="bug-title">${this.escapeHtml(bug.title)}</div>
            <button class="bug-status-toggle ${isResolved ? 'bug-status-resolved' : 'bug-status-open'}"
                    onclick="window.BugTracker.toggleBugStatus('${bug.id}', '${bug.status}')">
              ${isResolved ? '✅ Solved' : '🔴 Open'}
            </button>
          </div>

          ${bug.description ? `<div class="bug-desc">${this.escapeHtml(bug.description)}</div>` : ''}

          ${bug.stackTrace ? `
            <div style="background:#0b0f19;padding:6px 8px;border-radius:6px;font-family:monospace;font-size:10px;color:#fca5a5;max-height:80px;overflow-y:auto;white-space:pre-wrap;">
              ${this.escapeHtml(bug.stackTrace)}
            </div>
          ` : ''}

          <div class="bug-meta">
            <span>Found in: <strong>${bug.version}</strong></span>
            ${isResolved && bug.resolvedInVersion ? `<span style="color:#34d399;">Fixed in: <strong>${bug.resolvedInVersion}</strong></span>` : ''}
            <button onclick="window.BugTracker.deleteBug('${bug.id}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:11px;">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

window.BugTracker = BugTracker;
