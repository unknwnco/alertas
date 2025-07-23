const socket = io();
socket.on('play', file => {
  const ext = file.split('.').pop();
  if (ext === 'mp3' || ext === 'wav') {
    const audio = new Audio(`/media/${file}`);
    audio.play();
  } else if (ext === 'mp4' || ext === 'webm') {
    const video = document.createElement('video');
    video.src = `/media/${file}`;
    video.autoplay = true;
    video.style.position = 'absolute';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    document.body.appendChild(video);
    video.onended = () => video.remove();
  }
});
