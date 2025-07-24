document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("eventsub-status");
  fetch("/eventsub/subscriptions")
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data.subscriptions)) {
        statusDiv.innerText = "❌ Failed to load subscriptions";
        return;
      }
      if (data.subscriptions.length === 0) {
        statusDiv.innerText = "⚠️ No active EventSub subscriptions";
        return;
      }

      const list = document.createElement("ul");
      data.subscriptions.forEach(sub => {
        const li = document.createElement("li");
        li.innerText = `${sub.type} - status: ${sub.status} - ${sub.condition?.broadcaster_user_id}`;
        list.appendChild(li);
      });
      statusDiv.appendChild(list);
    })
    .catch(err => {
      statusDiv.innerText = "❌ Error loading EventSub status";
      console.error(err);
    });
});
