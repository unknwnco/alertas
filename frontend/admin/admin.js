async function loadRewards() {
  const res = await fetch('/rewards');
  const data = await res.json();
  const list = document.getElementById('rewardList');
  const select = document.getElementById('simulateSelect');
  list.innerHTML = '';
  select.innerHTML = '';
  for (const [title, file] of Object.entries(data)) {
    const li = document.createElement('li');
    li.textContent = `${title} → ${file}`;
    list.appendChild(li);
    const opt = document.createElement('option');
    opt.value = title;
    opt.textContent = title;
    select.appendChild(opt);
  }
}

document.getElementById('rewardForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const title = form.title.value;
  const file = form.file.value;
  await fetch('/rewards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, file })
  });
  form.reset();
  await loadRewards();
});

document.getElementById('simulateBtn').addEventListener('click', async () => {
  const title = document.getElementById('simulateSelect').value;
  await fetch('/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
});

document.getElementById('createTwitchRewardForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const title = form.title.value;
  const cost = parseInt(form.cost.value);
  const prompt = form.prompt.value;
  const res = await fetch('/rewards/create-on-twitch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, cost, prompt })
  });
  if (res.ok) {
    alert('Created on Twitch');
    form.reset();
  } else {
    const msg = await res.text();
    alert('Failed: ' + msg);
  }
});

loadRewards();
