const form = document.getElementById('membershipForm');
const successBox = document.getElementById('successBox');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Submission failed');
    document.getElementById('applicationId').textContent = result.id;
    successBox.hidden = false;
    form.reset();
    window.scrollTo({top: successBox.offsetTop - 100, behavior: 'smooth'});
  } catch (err) {
    alert(err.message);
  }
});
