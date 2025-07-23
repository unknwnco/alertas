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
  alert('Saved');
});
