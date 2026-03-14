"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import YouTube, { YouTubeEvent } from "react-youtube"

type PlayerLike = {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  setPlaybackRate: (rate: number) => void
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

type PersistedPlayerState = {
  videoId: string
  inputValue: string
  currentTime: number
  pointA: number | null
  pointB: number | null
  playbackRate: number
  segmentTitle: string
}

const STORAGE_KEY = "youtube-looper-segments"
const PLAYER_STATE_KEY = "youtube-looper-player-state"
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5]
const YOUTUBE_STATE_PLAYING = 1
const HANDLE = 28
const MIN_GAP = 0.1

export default function Home() {
  const playerRef = useRef<PlayerLike | null>(null)
  const progressBarRef = useRef<HTMLDivElement | null>(null)
  const restoreTimeRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ clientX: number; startA: number; startB: number } | null>(null)

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

  const currentVideoSegments = useMemo(
    () => savedSegments.filter((segment) => segment.videoId === videoId),
    [savedSegments, videoId],
  )

  const canLoop = pointA !== null && pointB !== null && pointB > pointA

  const loopStartPercent = duration > 0 && pointA !== null ? (pointA / duration) * 100 : 0
  const loopEndPercent = duration > 0 && pointB !== null ? (pointB / duration) * 100 : 0
  const loopWidth = Math.max(loopEndPercent - loopStartPercent, 0)
  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0

  const format = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const formatPrecise = (seconds: number | null) => {
    if (seconds === null) return "-"
    return `${seconds.toFixed(1)}s`
  }

  const extractVideoId = (value: string): string | null => {
    try {
      const url = new URL(value)

      if (url.hostname.includes("youtu.be")) {
        return url.pathname.replace("/", "") || null
      }

      if (url.hostname.includes("youtube.com")) {
        if (url.pathname.includes("/shorts/")) {
          const parts = url.pathname.split("/")
          return parts[2] || null
        }
        return url.searchParams.get("v")
      }

      return null
    } catch {
      return null
    }
  }

  const clamp = (value: number) => Math.max(0, Math.min(value, duration || value))

  const seekTo = (time: number) => {
    const player = playerRef.current
    if (!player) return

    const next = clamp(time)
    player.seekTo(next, true)
    setCurrentTime(next)
  }

  const setSpeed = (rate: number) => {
    playerRef.current?.setPlaybackRate(rate)
    setPlaybackRate(rate)
  }

  const onReady = (e: YouTubeEvent) => {
    const player = e.target as unknown as PlayerLike
    playerRef.current = player
    player.setPlaybackRate(playbackRate)

    const nextDuration = player.getDuration()
    setDuration(nextDuration)

    const restoreTime = restoreTimeRef.current
    if (restoreTime !== null) {
      player.seekTo(restoreTime, true)
      setCurrentTime(restoreTime)
      restoreTimeRef.current = null
    }
  }

  useEffect(() => {
    const rawSegments = localStorage.getItem(STORAGE_KEY)
    if (rawSegments) {
      try {
        setSavedSegments(JSON.parse(rawSegments) as SavedSegment[])
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }

    const rawPlayerState = localStorage.getItem(PLAYER_STATE_KEY)
    if (rawPlayerState) {
      try {
        const parsed = JSON.parse(rawPlayerState) as PersistedPlayerState
        if (parsed.videoId) setVideoId(parsed.videoId)
        if (typeof parsed.inputValue === "string") setInputValue(parsed.inputValue)
        if (typeof parsed.currentTime === "number") {
          setCurrentTime(parsed.currentTime)
          restoreTimeRef.current = parsed.currentTime
        }
        if (parsed.pointA === null || typeof parsed.pointA === "number") setPointA(parsed.pointA)
        if (parsed.pointB === null || typeof parsed.pointB === "number") setPointB(parsed.pointB)
        if (SPEED_OPTIONS.includes(parsed.playbackRate)) setPlaybackRate(parsed.playbackRate)
        if (typeof parsed.segmentTitle === "string") setSegmentTitle(parsed.segmentTitle)
      } catch {
        localStorage.removeItem(PLAYER_STATE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSegments))
  }, [savedSegments])

  useEffect(() => {
    const payload: PersistedPlayerState = {
      videoId,
      inputValue,
      currentTime,
      pointA,
      pointB,
      playbackRate,
      segmentTitle,
    }
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(payload))
  }, [videoId, inputValue, currentTime, pointA, pointB, playbackRate, segmentTitle])

  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const time = player.getCurrentTime()
      const total = player.getDuration()
      setCurrentTime(time)
      setDuration(total)

      if (isLooping && pointA !== null && pointB !== null && time >= pointB) {
        player.seekTo(pointA, true)
      }
    }, 200)

    return () => window.clearInterval(id)
  }, [isLooping, pointA, pointB])

  useEffect(() => {
    const stopDrag = () => {
      setDragTarget(null)
      dragStartRef.current = null
    }

    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)
    return () => {
      window.removeEventListener("pointerup", stopDrag)
      window.removeEventListener("pointercancel", stopDrag)
    }
  }, [])

  const getTimeFromX = (x: number) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return 0
    const ratio = (x - rect.left) / rect.width
    return clamp(ratio * duration)
  }

  const startDrag = (target: DragTarget, clientX: number) => {
    if ((target === "range") && (!canLoop || pointA === null || pointB === null)) return

    playerRef.current?.pauseVideo()
    setIsLooping(false)
    setDragTarget(target)

    if (pointA !== null && pointB !== null) {
      dragStartRef.current = {
        clientX,
        startA: pointA,
        startB: pointB,
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget) return

    const time = getTimeFromX(e.clientX)

    if (dragTarget === "a") {
      if (pointB !== null) {
        const nextA = Math.min(time, pointB - MIN_GAP)
        setPointA(Math.max(0, nextA))
      }
      return
    }

    if (dragTarget === "b") {
      if (pointA !== null) {
        const nextB = Math.max(time, pointA + MIN_GAP)
        setPointB(clamp(nextB))
      }
      return
    }

    if (dragTarget === "range") {
      const rect = progressBarRef.current?.getBoundingClientRect()
      const snapshot = dragStartRef.current
      if (!rect || !snapshot) return

      const deltaX = e.clientX - snapshot.clientX
      const deltaSeconds = (deltaX / rect.width) * duration
      const length = snapshot.startB - snapshot.startA

      let nextA = snapshot.startA + deltaSeconds
      let nextB = snapshot.startB + deltaSeconds

      if (nextA < 0) {
        nextA = 0
        nextB = length
      }

      if (nextB > duration) {
        nextB = duration
        nextA = duration - length
      }

      setPointA(nextA)
      setPointB(nextB)
      seekTo(nextA)
    }
  }

  const handleProgressTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragTarget) return
    seekTo(getTimeFromX(e.clientX))
  }

  const togglePlayPause = () => {
    const player = playerRef.current
    if (!player) return

    if (player.getPlayerState() === YOUTUBE_STATE_PLAYING) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  }

  const toggleLoop = () => {
    if (!canLoop || pointA === null) return
    if (!isLooping) seekTo(pointA)
    setIsLooping((prev) => !prev)
  }

  const handleLoadVideo = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const extracted = extractVideoId(trimmed)
    if (!extracted) {
      alert("올바른 유튜브 링크를 넣어주세요.")
      return
    }

    setVideoId(extracted)
    setCurrentTime(0)
    setDuration(0)
    setPointA(null)
    setPointB(null)
    setIsLooping(false)
    restoreTimeRef.current = 0
  }

  const handleSave = () => {
    if (!canLoop || pointA === null || pointB === null) return

    const segment: SavedSegment = {
      id: crypto.randomUUID(),
      videoId,
      title: segmentTitle.trim() || `${format(pointA)}-${format(pointB)}`,
      start: pointA,
      end: pointB,
      createdAt: Date.now(),
    }

    setSavedSegments((prev) => [segment, ...prev])
    setSegmentTitle("")
  }

  const adjustPointA = (delta: number) => {
    setPointA((prev) => {
      if (prev === null) return prev
      const next = Math.max(0, prev + delta)
      if (pointB !== null && next >= pointB) return Math.max(0, pointB - MIN_GAP)
      return next
    })
  }

  const adjustPointB = (delta: number) => {
    setPointB((prev) => {
      if (prev === null) return prev
      const next = clamp(prev + delta)
      if (pointA !== null && next <= pointA) return pointA + MIN_GAP
      return next
    })
  }


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target &&
        (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        )

      // input 포커스 중에도 Ctrl/Cmd 조합은 동작
      if (isTyping) {
        const mod = e.ctrlKey || e.metaKey
        if (!mod) return

        switch (e.key.toLowerCase()) {
          case "a":
            e.preventDefault()
            ;(target as HTMLElement)?.blur()
            setPointA(currentTime)
            return
          case "b":
            e.preventDefault()
            ;(target as HTMLElement)?.blur()
            setPointB(currentTime)
            return
          case "s":
            e.preventDefault()
            ;(target as HTMLElement)?.blur()
            handleSave()
            return
          case "r":
            e.preventDefault()
            ;(target as HTMLElement)?.blur()
            toggleLoop()
            return
          default:
            return
        }
      }

      switch (e.key) {
        case "a":
        case "A":
          e.preventDefault()
          setPointA(currentTime)
          break

        case "b":
        case "B":
          e.preventDefault()
          setPointB(currentTime)
          break

        case "r":
        case "R":
          e.preventDefault()
          toggleLoop()
          break

        case "s":
        case "S":
          e.preventDefault()
          handleSave()
          break

        case " ":
          e.preventDefault()
          togglePlayPause()
          break

        case "ArrowLeft":
          e.preventDefault()
          seekTo(currentTime - 5)
          break

        case "ArrowRight":
          e.preventDefault()
          seekTo(currentTime + 5)
          break

        case "-":
        case "_": {
          e.preventDefault()
          const currentIndex = SPEED_OPTIONS.indexOf(playbackRate)
          if (currentIndex > 0) {
            setSpeed(SPEED_OPTIONS[currentIndex - 1])
          }
          break
        }

        case "=":
        case "+": {
          e.preventDefault()
          const currentIndex = SPEED_OPTIONS.indexOf(playbackRate)
          if (currentIndex < SPEED_OPTIONS.length - 1) {
            setSpeed(SPEED_OPTIONS[currentIndex + 1])
          }
          break
        }

        case "Escape":
          e.preventDefault()
          setIsLooping(false)
          break

        default:
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [currentTime, playbackRate, pointA, pointB, isLooping])

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-white p-3 sm:p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">YouTube Looper</h1>
          <p className="text-xs text-gray-500">모바일 포함 A/B 반복 연습</p>
        </div>
        <button
          onClick={() => setShowShortcuts(true)}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          사용법
        </button>
      </header>

      <section className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm"
          placeholder="유튜브 링크"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          className="shrink-0 rounded-xl bg-black px-4 py-3 text-sm text-white"
          onClick={handleLoadVideo}
        >
          불러오기
        </button>
      </section>

            <section className="sticky bottom-0 z-40 -mx-3 border-t bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">재생 컨트롤</h2>
          <p className="text-xs text-gray-500">모바일 엄지 조작용</p>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={togglePlayPause}
            className="rounded-xl border px-3 py-3 text-sm"
          >
            재생
          </button>
          <button
            onClick={toggleLoop}
            disabled={!canLoop}
            className="rounded-xl bg-blue-600 px-3 py-3 text-sm text-white disabled:opacity-50"
          >
            {isLooping ? "Loop OFF" : "Loop ON"}
          </button>

          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              onClick={() => setSpeed(rate)}
              className={`rounded-xl border px-3 py-3 text-sm ${playbackRate === rate ? "bg-black text-white" : "bg-white"}`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border bg-black">
        <YouTube
          videoId={videoId}
          onReady={onReady}
          opts={{
            width: "100%",
            height: "390",
            playerVars: {
              playsinline: 1,
            },
          }}
          className="aspect-video w-full"
        />
        {/* 투명 오버레이: iframe이 포커스를 가져가지 못하게 차단, 클릭 시 재생/일시정지 */}
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={togglePlayPause}
        />
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">A/B 구간</h2>
            <p className="text-xs text-gray-500">핸들 드래그 또는 버튼으로 조정</p>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p>{format(currentTime)} / {duration > 0 ? format(duration) : "--:--"}</p>
            <p>{canLoop && pointA !== null && pointB !== null ? `길이 ${formatPrecise(pointB - pointA)}` : "구간 미설정"}</p>
          </div>
        </div>

        <div
          ref={progressBarRef}
          onPointerMove={handlePointerMove}
          onClick={handleProgressTap}
          className="relative mb-4 h-5 w-full touch-none rounded-full bg-gray-200"
        >
          <div
            className="absolute left-0 top-0 h-5 rounded-full bg-gray-400"
            style={{ width: `${progressPercent}%` }}
          />

          {canLoop && (
            <div
              className="absolute top-0 z-10 h-5 cursor-grab rounded-full bg-blue-500/70 active:cursor-grabbing"
              style={{ left: `${loopStartPercent}%`, width: `${loopWidth}%` }}
              onPointerDown={(e) => {
                e.stopPropagation()
                startDrag("range", e.clientX)
              }}
            />
          )}

          {pointA !== null && (
            <button
              type="button"
              aria-label="A 핸들"
              title={`A ${formatPrecise(pointA)}`}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startDrag("a", e.clientX)
              }}
              className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
              style={{ left: `${loopStartPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-bold text-white">A</span>
            </button>
          )}

          {pointB !== null && (
            <button
              type="button"
              aria-label="B 핸들"
              title={`B ${formatPrecise(pointB)}`}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startDrag("b", e.clientX)
              }}
              className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow"
              style={{ left: `${loopEndPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-bold text-white">B</span>
            </button>
          )}

          <div
            className="absolute top-[-2px] z-30 h-7 w-1 -translate-x-1/2 rounded bg-red-500"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">A</p>
            <p className="font-medium">{pointA !== null ? formatPrecise(pointA) : "-"}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">B</p>
            <p className="font-medium">{pointB !== null ? formatPrecise(pointB) : "-"}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">길이</p>
            <p className="font-medium">{canLoop && pointA !== null && pointB !== null ? formatPrecise(pointB - pointA) : "-"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className="rounded-xl border px-3 py-3 text-sm" onClick={() => setPointA(currentTime)}>
            A 설정
          </button>
          <button className="rounded-xl border px-3 py-3 text-sm" onClick={() => setPointB(currentTime)}>
            B 설정
          </button>
          <button className="rounded-xl border px-3 py-3 text-sm" onClick={() => seekTo(currentTime - 5)}>
            -5초
          </button>
          <button className="rounded-xl border px-3 py-3 text-sm" onClick={() => seekTo(currentTime + 5)}>
            +5초
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => adjustPointA(-0.5)}
            disabled={pointA === null}
          >
            A -0.5s
          </button>
          <button
            className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => adjustPointA(0.5)}
            disabled={pointA === null}
          >
            A +0.5s
          </button>
          <button
            className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => adjustPointB(-0.5)}
            disabled={pointB === null}
          >
            B -0.5s
          </button>
          <button
            className="rounded-xl border bg-white px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => adjustPointB(0.5)}
            disabled={pointB === null}
          >
            B +0.5s
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm"
            placeholder="구간 이름"
            value={segmentTitle}
            onChange={(e) => setSegmentTitle(e.target.value)}
          />
          <button
            disabled={!canLoop}
            onClick={handleSave}
            className="rounded-xl bg-green-600 px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            현재 구간 저장
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">저장된 구간</h2>
          <p className="text-xs text-gray-500">현재 영상 기준 {currentVideoSegments.length}개</p>
        </div>

        {currentVideoSegments.length === 0 ? (
          <p className="text-sm text-gray-500">이 영상에 저장된 구간이 아직 없습니다.</p>
        ) : (
          currentVideoSegments.map((segment) => (
            <div key={segment.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{segment.title}</p>
                <p className="text-sm text-gray-500">{format(segment.start)} - {format(segment.end)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() => {
                    setPointA(segment.start)
                    setPointB(segment.end)
                    seekTo(segment.start)
                  }}
                >
                  불러오기
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() => setSavedSegments((prev) => prev.filter((item) => item.id !== segment.id))}
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:w-[360px] sm:rounded-2xl">
            <h3 className="mb-3 text-lg font-semibold">사용법</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p>• 재생바 탭: 원하는 위치로 이동</p>
              <p>• A/B 핸들 드래그: 구간 시작/끝 조정</p>
              <p>• 파란 구간 드래그: 루프 전체 이동</p>
              <p>• 모바일에서는 아래 고정 컨트롤로 재생/루프/속도 조절</p>
              <p>• 마지막으로 보던 영상과 위치는 새로고침 후에도 유지</p>
              <p>• 데스크탑: A / B / R / S / Space / 방향키 단축키 지원</p>
            </div>
            <button
              className="mt-4 w-full rounded-xl border px-4 py-3"
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
