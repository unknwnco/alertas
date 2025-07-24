const socket = io();
socket.on('play', file => {
  // Si es un enlace de YouTube
  if (file.includes('youtube.com') || file.includes('youtu.be')) {
    const iframe = document.createElement('iframe');
    iframe.src = file;
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.style.position = "absolute";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.allow = "autoplay";
    iframe.allowFullscreen = true;
    iframe.frameBorder = "0";
    document.body.appendChild(iframe);

    setTimeout(() => iframe.remove(), 15000); // quitar después de 15 segundos
  } else {
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
  }
});
