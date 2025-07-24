
const socket = io();
const container = document.getElementById('video-container');

socket.on('play', (video) => {
  if (video.includes('youtube.com')) {
    const url = new URL(video);
    const videoId = url.searchParams.get('v');
    if (videoId) {
      container.innerHTML = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    }
  } else {
    const videoElement = document.createElement('video');
    videoElement.src = '/videos/' + video;
    videoElement.autoplay = true;
    videoElement.controls = false;
    videoElement.onended = () => {
      container.innerHTML = '';
    };
    container.innerHTML = '';
    container.appendChild(videoElement);
  }

  // Mostrar alerta visual
  const alertBox = document.createElement("div");
  alertBox.innerText = "🔔 ¡Canje recibido!";
  alertBox.style.position = "absolute";
  alertBox.style.top = "10%";
  alertBox.style.left = "50%";
  alertBox.style.transform = "translateX(-50%)";
  alertBox.style.padding = "20px";
  alertBox.style.background = "rgba(0, 0, 0, 0.7)";
  alertBox.style.color = "white";
  alertBox.style.fontSize = "2em";
  alertBox.style.borderRadius = "10px";
  alertBox.style.zIndex = "9999";

  document.body.appendChild(alertBox);
  setTimeout(() => alertBox.remove(), 4000);
});
