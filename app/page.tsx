"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import YouTube, { YouTubeEvent } from "react-youtube"

type PlayerLike = {
  getCurrentTime: () => number
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

const STORAGE_KEY = "youtube-looper-segments"
const SETTINGS_KEY = "youtube-looper-settings"
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5]
const YOUTUBE_STATE_PLAYING = 1
const FINE_STEP = 0.5

export default function Home() {
  const playerRef = useRef<PlayerLike | null>(null)
  const intervalRef = useRef<number | null>(null)
  const countdownTimeoutRef = useRef<number | null>(null)
  const countdownIntervalRef = useRef<number | null>(null)

  const [videoId, setVideoId] = useState("dQw4w9WgXcQ")
  const [inputValue, setInputValue] = useState("")
  const [currentTime, setCurrentTime] = useState(0)
  const [pointA, setPointA] = useState<number | null>(null)
  const [pointB, setPointB] = useState<number | null>(null)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [segmentTitle, setSegmentTitle] = useState("")
  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([])

  const [useCountIn, setUseCountIn] = useState(false)
  const [countInSeconds, setCountInSeconds] = useState(3)
  const [countdownValue, setCountdownValue] = useState<number | null>(null)
  const [isCountingDown, setIsCountingDown] = useState(false)

  const currentVideoSegments = useMemo(() => {
    return savedSegments.filter((segment) => segment.videoId === videoId)
  }, [savedSegments, videoId])

  const canLoop = pointA !== null && pointB !== null && pointB > pointA

  const onReady = (event: YouTubeEvent) => {
    playerRef.current = event.target as unknown as PlayerLike
    playerRef.current.setPlaybackRate(playbackRate)
  }

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as SavedSegment[]
      setSavedSegments(parsed)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSegments))
  }, [savedSegments])

  useEffect(() => {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as {
        useCountIn?: boolean
        countInSeconds?: number
      }

      setUseCountIn(Boolean(parsed.useCountIn))
      if (parsed.countInSeconds === 2 || parsed.countInSeconds === 3) {
        setCountInSeconds(parsed.countInSeconds)
      }
    } catch {
      localStorage.removeItem(SETTINGS_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        useCountIn,
        countInSeconds,
      }),
    )
  }, [useCountIn, countInSeconds])

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const time = player.getCurrentTime()
      setCurrentTime(time)

      if (
        isLooping &&
        pointA !== null &&
        pointB !== null &&
        pointB > pointA &&
        time >= pointB
      ) {
        player.seekTo(pointA, true)
        player.playVideo()
      }
    }, 200)

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
      }
    }
  }, [isLooping, pointA, pointB])

  useEffect(() => {
    return () => {
      if (countdownTimeoutRef.current !== null) {
        window.clearTimeout(countdownTimeoutRef.current)
      }
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current)
      }
    }
  }, [])

  const clearCountdownTimers = () => {
    if (countdownTimeoutRef.current !== null) {
      window.clearTimeout(countdownTimeoutRef.current)
      countdownTimeoutRef.current = null
    }

    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }

  const startPlaybackWithCountIn = (startAt: number, shouldEnableLoop: boolean) => {
    const player = playerRef.current
    if (!player) return

    clearCountdownTimers()

    player.pauseVideo()
    player.seekTo(startAt, true)
    player.setPlaybackRate(playbackRate)

    if (!useCountIn) {
      setIsCountingDown(false)
      setCountdownValue(null)
      if (shouldEnableLoop) setIsLooping(true)
      player.playVideo()
      return
    }

    setIsLooping(false)
    setIsCountingDown(true)
    setCountdownValue(countInSeconds)

    let remaining = countInSeconds

    countdownIntervalRef.current = window.setInterval(() => {
      remaining -= 1

      if (remaining > 0) {
        setCountdownValue(remaining)
      } else {
        clearCountdownTimers()
        setIsCountingDown(false)
        setCountdownValue(null)
        if (shouldEnableLoop) setIsLooping(true)
        player.seekTo(startAt, true)
        player.setPlaybackRate(playbackRate)
        player.playVideo()
      }
    }, 1000)
  }

  const handleSetA = () => {
    setPointA(currentTime)
  }

  const handleSetB = () => {
    setPointB(currentTime)
  }

  const handleToggleLoop = () => {
    if (!canLoop || pointA === null) return

    if (isLooping || isCountingDown) {
      clearCountdownTimers()
      setIsCountingDown(false)
      setCountdownValue(null)
      setIsLooping(false)
      return
    }

    startPlaybackWithCountIn(pointA, true)
  }

  const seekBy = (seconds: number) => {
    const player = playerRef.current
    if (!player) return

    const nextTime = Math.max(0, player.getCurrentTime() + seconds)
    player.seekTo(nextTime, true)
  }

  const setSpeed = (rate: number) => {
    const player = playerRef.current
    setPlaybackRate(rate)
    player?.setPlaybackRate(rate)
  }

  const increaseSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate)
    if (currentIndex === -1) return
    const nextIndex = Math.min(currentIndex + 1, SPEED_OPTIONS.length - 1)
    setSpeed(SPEED_OPTIONS[nextIndex])
  }

  const decreaseSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate)
    if (currentIndex === -1) return
    const nextIndex = Math.max(currentIndex - 1, 0)
    setSpeed(SPEED_OPTIONS[nextIndex])
  }

  const togglePlayPause = () => {
    const player = playerRef.current
    if (!player) return

    const state = player.getPlayerState()
    if (state === YOUTUBE_STATE_PLAYING) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  }

  const adjustPointA = (delta: number) => {
    setPointA((prev) => {
      if (prev === null) return prev
      const next = Math.max(0, prev + delta)

      if (pointB !== null && next >= pointB) {
        return Math.max(0, pointB - 0.1)
      }

      return next
    })
  }

  const adjustPointB = (delta: number) => {
    setPointB((prev) => {
      if (prev === null) return prev
      const next = Math.max(0, prev + delta)

      if (pointA !== null && next <= pointA) {
        return pointA + 0.1
      }

      return next
    })
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

  const handleLoadVideo = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const extracted = extractVideoId(trimmed)
    if (!extracted) {
      alert("올바른 유튜브 링크를 넣어주세요.")
      return
    }

    clearCountdownTimers()
    setVideoId(extracted)
    setPointA(null)
    setPointB(null)
    setIsLooping(false)
    setIsCountingDown(false)
    setCountdownValue(null)
    setCurrentTime(0)
    setSegmentTitle("")
  }

  const handleSaveSegment = () => {
    if (!canLoop || pointA === null || pointB === null) {
      alert("먼저 A와 B를 올바르게 설정해주세요.")
      return
    }

    const newSegment: SavedSegment = {
      id: crypto.randomUUID(),
      videoId,
      title: segmentTitle.trim() || `구간 ${formatTime(pointA)} - ${formatTime(pointB)}`,
      start: pointA,
      end: pointB,
      createdAt: Date.now(),
    }

    setSavedSegments((prev) => [newSegment, ...prev])
    setSegmentTitle("")
  }

  const handleLoadSegment = (segment: SavedSegment) => {
    const player = playerRef.current
    if (!player) return

    setPointA(segment.start)
    setPointB(segment.end)
    player.seekTo(segment.start, true)
    player.setPlaybackRate(playbackRate)

    startPlaybackWithCountIn(segment.start, true)
  }

  const handleDeleteSegment = (segmentId: string) => {
    setSavedSegments((prev) => prev.filter((segment) => segment.id !== segmentId))
  }

  const formatTime = (seconds: number) => {
    const total = Math.floor(seconds)
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatTimeWithMs = (seconds: number | null) => {
    if (seconds === null) return "-"
    return `${seconds.toFixed(1)}s`
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

      if (isTyping) return

      if (e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault()
        adjustPointA(-FINE_STEP)
        return
      }

      if (e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault()
        adjustPointA(FINE_STEP)
        return
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault()
        adjustPointB(-FINE_STEP)
        return
      }

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault()
        adjustPointB(FINE_STEP)
        return
      }

      switch (e.key) {
        case " ":
          e.preventDefault()
          togglePlayPause()
          break
        case "ArrowLeft":
          e.preventDefault()
          seekBy(-5)
          break
        case "ArrowRight":
          e.preventDefault()
          seekBy(5)
          break
        case "a":
        case "A":
          e.preventDefault()
          handleSetA()
          break
        case "b":
        case "B":
          e.preventDefault()
          handleSetB()
          break
        case "r":
        case "R":
          e.preventDefault()
          handleToggleLoop()
          break
        case "s":
        case "S":
          e.preventDefault()
          handleSaveSegment()
          break
        case "-":
        case "_":
          e.preventDefault()
          decreaseSpeed()
          break
        case "=":
        case "+":
          e.preventDefault()
          increaseSpeed()
          break
        case "Escape":
          e.preventDefault()
          clearCountdownTimers()
          setIsCountingDown(false)
          setCountdownValue(null)
          setIsLooping(false)
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [currentTime, canLoop, playbackRate, pointA, pointB, segmentTitle, isLooping, isCountingDown, useCountIn, countInSeconds])

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">YouTube Looper</h1>
        <p className="text-sm text-gray-600">유튜브 구간 반복 연습용 MVP</p>
      </header>

      <section className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="유튜브 링크를 넣어주세요"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          className="rounded-lg bg-black px-4 py-2 text-white"
          onClick={handleLoadVideo}
        >
          불러오기
        </button>
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

        {isCountingDown && countdownValue !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <div className="rounded-full bg-white/90 px-8 py-5 text-5xl font-bold text-black shadow-lg">
              {countdownValue}
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button className="rounded-lg border px-4 py-3" onClick={handleSetA}>
          A 설정
        </button>
        <button className="rounded-lg border px-4 py-3" onClick={handleSetB}>
          B 설정
        </button>
        <button className="rounded-lg border px-4 py-3" onClick={() => seekBy(-5)}>
          -5초
        </button>
        <button className="rounded-lg border px-4 py-3" onClick={() => seekBy(5)}>
          +5초
        </button>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">A/B 미세 조정</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="mb-3 font-medium">A 지점</p>
            <p className="mb-3 text-sm text-gray-600">
              현재 A: {pointA !== null ? `${formatTime(pointA)} (${formatTimeWithMs(pointA)})` : "-"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => adjustPointA(-FINE_STEP)}
                disabled={pointA === null}
              >
                A -0.5s
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => adjustPointA(FINE_STEP)}
                disabled={pointA === null}
              >
                A +0.5s
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <p className="mb-3 font-medium">B 지점</p>
            <p className="mb-3 text-sm text-gray-600">
              현재 B: {pointB !== null ? `${formatTime(pointB)} (${formatTimeWithMs(pointB)})` : "-"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => adjustPointB(-FINE_STEP)}
                disabled={pointB === null}
              >
                B -0.5s
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => adjustPointB(FINE_STEP)}
                disabled={pointB === null}
              >
                B +0.5s
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">카운트다운 옵션</h2>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useCountIn}
              onChange={(e) => setUseCountIn(e.target.checked)}
            />
            <span className="text-sm">Loop 시작 전에 카운트다운 사용</span>
          </label>

          <div className="flex flex-wrap gap-2">
            {[2, 3].map((sec) => {
              const active = countInSeconds === sec
              return (
                <button
                  key={sec}
                  className={`rounded-lg px-4 py-2 text-sm ${
                    active ? "bg-black text-white" : "border bg-white text-black"
                  }`}
                  onClick={() => setCountInSeconds(sec)}
                  disabled={!useCountIn}
                >
                  {sec}초
                </button>
              )
            })}
          </div>

          <p className="text-sm text-gray-600">
            현재 설정: {useCountIn ? `${countInSeconds}초 카운트다운` : "사용 안 함"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border p-4">
        <div className="flex flex-wrap gap-2">
          {SPEED_OPTIONS.map((rate) => {
            const active = playbackRate === rate
            return (
              <button
                key={rate}
                className={`rounded-lg px-4 py-2 text-sm ${
                  active ? "bg-blue-600 text-white" : "border bg-white text-black"
                }`}
                onClick={() => setSpeed(rate)}
              >
                {rate}x
              </button>
            )
          })}
        </div>

        <button
          className="rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
          onClick={handleToggleLoop}
          disabled={!canLoop}
        >
          {isLooping || isCountingDown ? "Loop 끄기" : "Loop 켜기"}
        </button>

        <div className="text-sm leading-7">
          <p>현재 시간: {formatTime(currentTime)}</p>
          <p>A: {pointA !== null ? formatTime(pointA) : "-"}</p>
          <p>B: {pointB !== null ? formatTime(pointB) : "-"}</p>
          <p>재생 속도: {playbackRate}x</p>
          <p>Loop 상태: {isLooping ? "ON" : isCountingDown ? "COUNTDOWN" : "OFF"}</p>
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">구간 저장</h2>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-lg border px-3 py-2"
            placeholder="구간 이름 예: 인트로, 후렴, 솔로"
            value={segmentTitle}
            onChange={(e) => setSegmentTitle(e.target.value)}
          />
          <button
            className="rounded-lg bg-green-600 px-4 py-2 text-white"
            onClick={handleSaveSegment}
          >
            현재 구간 저장
          </button>
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">저장된 구간</h2>

        {currentVideoSegments.length === 0 ? (
          <p className="text-sm text-gray-500">이 영상에 저장된 구간이 아직 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {currentVideoSegments.map((segment) => (
              <div
                key={segment.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{segment.title}</p>
                  <p className="text-sm text-gray-600">
                    {formatTime(segment.start)} - {formatTime(segment.end)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => handleLoadSegment(segment)}
                  >
                    불러오기
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => handleDeleteSegment(segment.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-gray-50 p-4">
        <h2 className="mb-3 text-lg font-semibold">단축키</h2>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          <p><kbd className="rounded border px-2 py-1">Space</kbd> 재생/일시정지</p>
          <p><kbd className="rounded border px-2 py-1">←</kbd> 5초 뒤로</p>
          <p><kbd className="rounded border px-2 py-1">→</kbd> 5초 앞으로</p>
          <p><kbd className="rounded border px-2 py-1">A</kbd> A 설정</p>
          <p><kbd className="rounded border px-2 py-1">B</kbd> B 설정</p>
          <p><kbd className="rounded border px-2 py-1">R</kbd> Loop 토글</p>
          <p><kbd className="rounded border px-2 py-1">S</kbd> 구간 저장</p>
          <p><kbd className="rounded border px-2 py-1">-</kbd> 속도 낮추기</p>
          <p><kbd className="rounded border px-2 py-1">+</kbd> 속도 높이기</p>
          <p><kbd className="rounded border px-2 py-1">Esc</kbd> Loop/카운트다운 끄기</p>
          <p><kbd className="rounded border px-2 py-1">Shift + ←</kbd> A -0.5초</p>
          <p><kbd className="rounded border px-2 py-1">Shift + →</kbd> A +0.5초</p>
          <p><kbd className="rounded border px-2 py-1">Alt + ←</kbd> B -0.5초</p>
          <p><kbd className="rounded border px-2 py-1">Alt + →</kbd> B +0.5초</p>
        </div>
      </section>
    </main>
  )
}