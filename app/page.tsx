"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import YouTube, { YouTubeEvent } from "react-youtube"

/*
UI RESTRUCTURE GOALS
1. One primary interaction area: A/B loop control
2. Secondary controls: speed + loop
3. Saved segments below
4. Keyboard help moved to modal to reduce visual noise
*/

type PlayerLike = {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  setPlaybackRate: (rate: number) => void
  getPlaybackRate: () => number
  getPlayerState: () => number
}

type SavedSegment = {
  id: string
  videoId: string
  title: string
  start: number
  end: number
  createdAt: number
}

type DragTarget = "a" | "b" | "range" | null

const STORAGE_KEY = "youtube-looper-segments"
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5]
const YOUTUBE_STATE_PLAYING = 1
const HANDLE = 24
const MIN_GAP = 0.1

export default function Home() {
  const playerRef = useRef<PlayerLike | null>(null)
  const progressBarRef = useRef<HTMLDivElement | null>(null)

  const [videoId, setVideoId] = useState("dQw4w9WgXcQ")
  const [inputValue, setInputValue] = useState("")

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const [pointA, setPointA] = useState<number | null>(null)
  const [pointB, setPointB] = useState<number | null>(null)

  const [playbackRate, setPlaybackRate] = useState(1)
  const [isLooping, setIsLooping] = useState(false)

  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([])
  const [segmentTitle, setSegmentTitle] = useState("")

  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const canLoop = pointA !== null && pointB !== null && pointB > pointA

  const loopStartPercent = duration && pointA !== null ? (pointA / duration) * 100 : 0
  const loopEndPercent = duration && pointB !== null ? (pointB / duration) * 100 : 0
  const loopWidth = loopEndPercent - loopStartPercent

  const progressPercent = duration ? (currentTime / duration) * 100 : 0

  const onReady = (e: YouTubeEvent) => {
    playerRef.current = e.target as unknown as PlayerLike
    setDuration(playerRef.current.getDuration())
  }

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setSavedSegments(JSON.parse(raw))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSegments))
  }, [savedSegments])

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current
      if (!p) return

      const t = p.getCurrentTime()
      setCurrentTime(t)
      setDuration(p.getDuration())

      if (isLooping && pointA !== null && pointB !== null && t >= pointB) {
        p.seekTo(pointA, true)
      }
    }, 200)

    return () => clearInterval(id)
  }, [isLooping, pointA, pointB])

  const seekTo = (t: number) => {
    const p = playerRef.current
    if (!p) return
    p.seekTo(Math.max(0, Math.min(t, duration)), true)
  }

  const getTimeFromX = (x: number) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect) return 0

    const ratio = (x - rect.left) / rect.width
    return Math.max(0, Math.min(duration, ratio * duration))
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragTarget) return

    const t = getTimeFromX(e.clientX)

    if (dragTarget === "a") {
      if (pointB !== null) setPointA(Math.min(t, pointB - MIN_GAP))
    }

    if (dragTarget === "b") {
      if (pointA !== null) setPointB(Math.max(t, pointA + MIN_GAP))
    }

    if (dragTarget === "range" && pointA !== null && pointB !== null) {
      const len = pointB - pointA
      let nextA = t
      let nextB = t + len

      if (nextB > duration) {
        nextB = duration
        nextA = duration - len
      }

      setPointA(nextA)
      setPointB(nextB)
    }
  }

  const stopDrag = () => setDragTarget(null)

  const setSpeed = (r: number) => {
    playerRef.current?.setPlaybackRate(r)
    setPlaybackRate(r)
  }

  const toggleLoop = () => {
    if (!canLoop) return

    if (!isLooping && pointA !== null) {
      playerRef.current?.seekTo(pointA, true)
    }

    setIsLooping((v) => !v)
  }

  const handleSave = () => {
    if (!canLoop || pointA === null || pointB === null) return

    const seg: SavedSegment = {
      id: crypto.randomUUID(),
      videoId,
      title: segmentTitle || `${format(pointA)}-${format(pointB)}`,
      start: pointA,
      end: pointB,
      createdAt: Date.now(),
    }

    setSavedSegments((s) => [seg, ...s])
    setSegmentTitle("")
  }

  const format = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">

      {/* header */}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">YouTube Looper</h1>

        <button
          onClick={() => setShowShortcuts(true)}
          className="rounded-lg border px-3 py-1 text-sm"
        >
          단축키
        </button>
      </header>


      {/* load video */}
      <section className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="유튜브 링크"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />

        <button
          className="rounded-lg bg-black px-4 py-2 text-white"
          onClick={() => {
            const id = inputValue.split("v=")[1]
            if (id) setVideoId(id)
          }}
        >
          불러오기
        </button>
      </section>


      {/* player */}
      <div className="overflow-hidden rounded-xl border">
        <YouTube
          videoId={videoId}
          onReady={onReady}
          className="aspect-video w-full"
        />
      </div>


      {/* LOOP CONTROLLER */}
      <section className="rounded-xl border p-4 space-y-3">

        <div
          ref={progressBarRef}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          className="relative h-4 w-full rounded-full bg-gray-200"
        >

          <div
            className="absolute h-4 rounded-full bg-gray-400"
            style={{ width: `${progressPercent}%` }}
          />

          {canLoop && (
            <div
              className="absolute h-4 cursor-grab rounded-full bg-blue-500/70"
              style={{ left: `${loopStartPercent}%`, width: `${loopWidth}%` }}
              onPointerDown={() => setDragTarget("range")}
            />
          )}

          {pointA !== null && (
            <button
              onPointerDown={() => setDragTarget("a")}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600"
              style={{
                left: `${loopStartPercent}%`,
                top: "50%",
                width: HANDLE,
                height: HANDLE,
              }}
            />
          )}

          {pointB !== null && (
            <button
              onPointerDown={() => setDragTarget("b")}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-600"
              style={{
                left: `${loopEndPercent}%`,
                top: "50%",
                width: HANDLE,
                height: HANDLE,
              }}
            />
          )}

          <div
            className="absolute h-5 w-1 bg-red-500"
            style={{ left: `${progressPercent}%` }}
          />
        </div>


        {/* A/B buttons */}
        <div className="flex flex-wrap gap-2">
          <button className="border px-3 py-2 rounded" onClick={() => setPointA(currentTime)}>
            A 설정
          </button>

          <button className="border px-3 py-2 rounded" onClick={() => setPointB(currentTime)}>
            B 설정
          </button>

          <button className="border px-3 py-2 rounded" onClick={() => seekTo(currentTime - 5)}>
            -5초
          </button>

          <button className="border px-3 py-2 rounded" onClick={() => seekTo(currentTime + 5)}>
            +5초
          </button>
        </div>


        {/* SAVE */}
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2"
            placeholder="구간 이름"
            value={segmentTitle}
            onChange={(e) => setSegmentTitle(e.target.value)}
          />

          <button
            disabled={!canLoop}
            onClick={handleSave}
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            저장
          </button>
        </div>

      </section>


      {/* PLAYBACK */}
      <section className="flex flex-wrap gap-2">
        {SPEED_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => setSpeed(r)}
            className={`px-3 py-2 rounded border ${
              playbackRate === r ? "bg-blue-600 text-white" : ""
            }`}
          >
            {r}x
          </button>
        ))}

        <button
          onClick={toggleLoop}
          disabled={!canLoop}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {isLooping ? "Loop OFF" : "Loop ON"}
        </button>
      </section>


      {/* SAVED SEGMENTS */}
      <section className="space-y-2">
        <h2 className="font-semibold">저장된 구간</h2>

        {savedSegments.map((s) => (
          <div key={s.id} className="flex justify-between border rounded p-2">

            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-gray-500">{format(s.start)} - {format(s.end)}</p>
            </div>

            <button
              className="border px-2 rounded"
              onClick={() => {
                setPointA(s.start)
                setPointB(s.end)
                seekTo(s.start)
              }}
            >
              불러오기
            </button>

          </div>
        ))}
      </section>


      {/* SHORTCUT MODAL */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-80 space-y-3">

            <h3 className="font-semibold">단축키</h3>

            <ul className="text-sm space-y-1">
              <li>Space — 재생/정지</li>
              <li>← / → — 5초 이동</li>
              <li>A / B — 포인트 설정</li>
              <li>R — 루프 토글</li>
              <li>S — 구간 저장</li>
              <li>- / + — 속도</li>
            </ul>

            <button
              className="w-full border rounded py-2"
              onClick={() => setShowShortcuts(false)}
            >
              닫기
            </button>

          </div>
        </div>
      )}


    </main>
  )
}
