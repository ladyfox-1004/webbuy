// 원본 영상 삽입. 처음엔 썸네일만 보여 주고, 누르면 youtube-nocookie iframe 을 띄운다.
// (iframe 을 바로 넣으면 페이지마다 유튜브 스크립트 수백 KB 와 쿠키가 따라온다.)

import { useState } from "react";
import { Play } from "lucide-react";

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

export function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  if (!VIDEO_ID.test(videoId)) return null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`영상 재생: ${title}`}
          className="group absolute inset-0 h-full w-full"
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-[var(--shadow-glow)] transition group-hover:scale-105">
              <Play className="ml-1 h-7 w-7" fill="currentColor" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
