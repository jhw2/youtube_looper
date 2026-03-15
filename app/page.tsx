"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
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
}

type SavedVideo = {
  videoId: string
  url: string
  addedAt: number
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
  loopStartDelay: number
  seekStep: number
}

const STORAGE_KEY = "youtube-looper-segments"
const PLAYER_STATE_KEY = "youtube-looper-player-state"
const VIDEOS_KEY = "youtube-looper-videos"
const LOOP_DELAY_OPTIONS = [0, 1, 2, 3, 5]
const YOUTUBE_STATE_PLAYING = 1
const HANDLE = 28
const MIN_GAP = 0.1

export default function Home() {
  const playerRef = useRef<PlayerLike | null>(null)
  const progressBarRef = useRef<HTMLDivElement | null>(null)
  const restoreTimeRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ clientX: number; startA: number; startB: number } | null>(null)
  const countdownIntervalRef = useRef<number | null>(null)
  const countdownTimeoutRef = useRef<number | null>(null)

  const [videoId, setVideoId] = useState("gNOQ1quUi3U")
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

  const [seekStep, setSeekStep] = useState(5)
  const [loopStartDelay, setLoopStartDelay] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([])
  const [showVideoList, setShowVideoList] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFsControls, setShowFsControls] = useState(true)
  const fsHideTimerRef = useRef<number | null>(null)
  const searchParams = useSearchParams()

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

  const clearTimers = () => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }

    if (countdownTimeoutRef.current !== null) {
      window.clearTimeout(countdownTimeoutRef.current)
      countdownTimeoutRef.current = null
    }
  }

  const clearCountdown = () => {
    clearTimers()
    setCountdown(null)
  }

  const stopLoop = () => {
    clearCountdown()
    setIsLooping(false)
  }

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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (typeof parsed.playbackRate === "number" && parsed.playbackRate >= 0.25 && parsed.playbackRate <= 3) setPlaybackRate(parsed.playbackRate)
        if (typeof parsed.segmentTitle === "string") setSegmentTitle(parsed.segmentTitle)
        if (LOOP_DELAY_OPTIONS.includes(parsed.loopStartDelay)) setLoopStartDelay(parsed.loopStartDelay)
        if (typeof parsed.seekStep === "number" && parsed.seekStep >= 1 && parsed.seekStep <= 30) setSeekStep(parsed.seekStep)
      } catch {
        localStorage.removeItem(PLAYER_STATE_KEY)
      }
    }

    const rawVideos = localStorage.getItem(VIDEOS_KEY)
    if (rawVideos) {
      try {
        setSavedVideos(JSON.parse(rawVideos) as SavedVideo[])
      } catch {
        localStorage.removeItem(VIDEOS_KEY)
      }
    }

    // 쿼리스트링 ?url= 로 유튜브 링크가 넘어오면 해당 영상을 로드
    const urlParam = searchParams.get("url")
    if (urlParam) {
      const extracted = extractVideoId(urlParam)
      if (extracted) {
        setVideoId(extracted)
        setInputValue(urlParam)
        setCurrentTime(0)
        setPointA(null)
        setPointB(null)
        restoreTimeRef.current = 0
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSegments))
  }, [savedSegments])

  useEffect(() => {
    localStorage.setItem(VIDEOS_KEY, JSON.stringify(savedVideos))
  }, [savedVideos])

  useEffect(() => {
    const payload: PersistedPlayerState = {
      videoId,
      inputValue,
      currentTime,
      pointA,
      pointB,
      playbackRate,
      segmentTitle,
      loopStartDelay,
      seekStep,
    }
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(payload))
  }, [videoId, inputValue, currentTime, pointA, pointB, playbackRate, segmentTitle, loopStartDelay, seekStep])


  const startLoopWithDelay = () => {
    if (!canLoop || pointA === null) return

    clearCountdown()

    const player = playerRef.current
    if (!player) return

    if (loopStartDelay <= 0) {
      seekTo(pointA)
      player.playVideo()
      setIsLooping(true)
      return
    }

    player.pauseVideo()
    setIsLooping(false)
    setCountdown(loopStartDelay)

    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null
        if (prev <= 1) return null
        return prev - 1
      })
    }, 1000)

    countdownTimeoutRef.current = window.setTimeout(() => {
      clearCountdown()
      seekTo(pointA)
      player.playVideo()
      setIsLooping(true)
    }, loopStartDelay * 1000)
  }


  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return

      const time = player.getCurrentTime()
      setCurrentTime((prev) => (Math.abs(prev - time) < 0.05 ? prev : time))

      const total = player.getDuration()
      setDuration((prev) => (prev === total ? prev : total))

      if (isLooping && pointA !== null && pointB !== null && time >= pointB) {
        startLoopWithDelay();
        player.seekTo(pointA, true)
      }
    }, 200)

    return () => window.clearInterval(id)
  }, [isLooping, pointA, pointB, startLoopWithDelay])

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

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [])

  // iframe이 포커스를 가져가면 주기적으로 되돌림
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.activeElement?.tagName === "IFRAME") {
        (document.activeElement as HTMLElement).blur()
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [])

  const getTimeFromX = (x: number) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return 0
    const ratio = (x - rect.left) / rect.width
    return clamp(ratio * duration)
  }

  const startDrag = (target: DragTarget, clientX: number) => {
    if (target === "range" && (!canLoop || pointA === null || pointB === null)) return

    clearCountdown()
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
    stopLoop()
    seekTo(getTimeFromX(e.clientX))
  }

  const togglePlayPause = () => {
    stopLoop()

    const player = playerRef.current
    if (!player) return

    if (player.getPlayerState() === YOUTUBE_STATE_PLAYING) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  }
  const toggleLoop = () => {
    if (!canLoop) return

    if (isLooping || countdown !== null) {
      clearCountdown()
      setIsLooping(false)
      return
    }

    startLoopWithDelay()
  }

  const handleLoadVideo = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    const extracted = extractVideoId(trimmed)
    if (!extracted) {
      alert("올바른 유튜브 링크를 넣어주세요.")
      return
    }

    clearCountdown()
    setVideoId(extracted)
    setCurrentTime(0)
    setDuration(0)
    setPointA(null)
    setPointB(null)
    setIsLooping(false)
    restoreTimeRef.current = 0

    // 영상 자동 저장
    setSavedVideos((prev) => {
      if (prev.some((v) => v.videoId === extracted)) return prev
      return [{ videoId: extracted, url: trimmed, addedAt: Date.now() }, ...prev]
    })
  }

  const handleSelectVideo = (video: SavedVideo) => {
    clearCountdown()
    setVideoId(video.videoId)
    setCurrentTime(0)
    setDuration(0)
    setPointA(null)
    setPointB(null)
    setIsLooping(false)
    restoreTimeRef.current = 0
    setShowVideoList(false)
  }

  const handleDeleteVideo = (videoId: string) => {
    setSavedVideos((prev) => prev.filter((v) => v.videoId !== videoId))
  }

  const handleSave = () => {
    if (!canLoop || pointA === null || pointB === null) return

    const segment: SavedSegment = {
      id: crypto.randomUUID(),
      videoId,
      title: segmentTitle.trim() || `${format(pointA)}-${format(pointB)}`,
      start: pointA,
      end: pointB,
    }

    setSavedSegments((prev) => [segment, ...prev])
    setSegmentTitle("")
  }

  const startEditSegment = (segment: SavedSegment) => {
    setEditingSegmentId(segment.id)
    setEditingTitle(segment.title)
  }

  const saveEditSegment = () => {
    if (!editingSegmentId) return
    setSavedSegments((prev) =>
      prev.map((s) =>
        s.id === editingSegmentId ? { ...s, title: editingTitle.trim() || s.title } : s,
      ),
    )
    setEditingSegmentId(null)
    setEditingTitle("")
  }

  const cancelEditSegment = () => {
    setEditingSegmentId(null)
    setEditingTitle("")
  }

  const adjustPointA = (delta: number) => {
    clearCountdown()

    setPointA((prev) => {
      if (prev === null) return prev
      const next = Math.max(0, prev + delta)
      if (pointB !== null && next >= pointB) return Math.max(0, pointB - MIN_GAP)
      return next
    })
  }

  const adjustPointB = (delta: number) => {
    clearCountdown()

    setPointB((prev) => {
      if (prev === null) return prev
      const next = clamp(prev + delta)
      if (pointA !== null && next <= pointA) return pointA + MIN_GAP
      return next
    })
  }

  const playerContainerRef = useRef<HTMLDivElement | null>(null)

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev
      if (next) {
        setShowFsControls(true)
        resetFsHideTimer()
      } else {
        clearFsHideTimer()
      }
      return next
    })
  }

  const clearFsHideTimer = () => {
    if (fsHideTimerRef.current !== null) {
      window.clearTimeout(fsHideTimerRef.current)
      fsHideTimerRef.current = null
    }
  }

  const resetFsHideTimer = () => {
    clearFsHideTimer()
    fsHideTimerRef.current = window.setTimeout(() => {
      setShowFsControls(false)
    }, 3000)
  }

  const handleFsInteraction = () => {
    if (!isFullscreen) return
    setShowFsControls(true)
    resetFsHideTimer()
  }

  useEffect(() => {
    return () => clearFsHideTimer()
  }, [])

  // 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)

      const code = e.code
      const key = e.key.toLowerCase()

      // e.code로 물리키 매칭, e.key로 한글/영어 둘 다 매칭
      const isA = code === "KeyA" || key === "a" || key === "ㅁ"
      const isB = code === "KeyB" || key === "b" || key === "ㅠ"
      const isL = code === "KeyL" || key === "l" || key === "ㅣ"
      const isS = code === "KeyS" || key === "s" || key === "ㄴ"
      const isF = code === "KeyF" || key === "f" || key === "ㄹ"

      if (isTyping) {
        const mod = e.ctrlKey || e.metaKey
        if (!mod) return

        if (isA) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          clearCountdown()
          setPointA(currentTime)
          return
        }
        if (isB) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          clearCountdown()
          setPointB(currentTime)
          return
        }
        if (isS) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          handleSave()
          return
        }
        if (isL) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          toggleLoop()
          return
        }
        if (isF) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          toggleFullscreen()
          return
        }
        return
      }

      if (isA) {
        e.preventDefault()
        clearCountdown()
        setPointA(currentTime)
      } else if (isB) {
        e.preventDefault()
        clearCountdown()
        setPointB(currentTime)
      } else if (isL) {
        e.preventDefault()
        toggleLoop()
      } else if (isS) {
        e.preventDefault()
        handleSave()
      } else if (isF) {
        e.preventDefault()
        toggleFullscreen()
      } else if (code === "Space" || key === " ") {
        e.preventDefault()
        togglePlayPause()
      } else if (code === "ArrowLeft") {
        e.preventDefault()
        seekTo(currentTime - seekStep)
      } else if (code === "ArrowRight") {
        e.preventDefault()
        seekTo(currentTime + seekStep)
      } else if (key === "-" || key === "_") {
        e.preventDefault()
        if (playbackRate > 0.25) {
          setSpeed(
            Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100
          )
        }
      } else if (key === "=" || key === "+") {
        e.preventDefault()
        if (playbackRate < 3) {
          setSpeed(
            Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100
          )
        }
      } else if (key === "escape") {
        e.preventDefault()
        clearCountdown()
        setIsLooping(false)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [currentTime, playbackRate, pointA, pointB, isLooping, countdown, seekStep])

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 p-3 sm:p-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 rounded-3xl bg-white/70 px-5 py-4 shadow-sm backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-purple-600">YouTube Looper</h1>
        </div>
        <button
          onClick={() => setShowShortcuts(true)}
          className="rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-600 transition hover:bg-purple-200"
        >
          ? 사용법
        </button>
      </header>

      {/* URL Input */}
      <section className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-2xl border-2 border-purple-200 bg-white/80 px-3 py-2.5 text-sm text-purple-900 placeholder-purple-300 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
          placeholder="유튜브 링크를 붙여넣어 주세요"
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLoadVideo()
          }}
        />
        <button
          className="shrink-0 rounded-2xl bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-purple-600 active:scale-95"
          onClick={handleLoadVideo}
        >
          불러오기
        </button>
      </section>


      {/* Saved Segments - Sticky Top */}

      <section className="sticky top-0 z-50 -mx-3 space-y-2 rounded-b-3xl border-b border-purple-100 bg-white/90 p-3 shadow-md backdrop-blur sm:mx-0 sm:rounded-3xl sm:border sm:border-purple-100 sm:shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1.5">
            <button
              onClick={togglePlayPause}
              title="단축키: Space"
              className="rounded-xl border-2 border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600 transition hover:bg-pink-100 active:scale-95"
            >
              재생 / 정지
            </button>
            <button
              onClick={toggleLoop}
              disabled={!canLoop}
              title="단축키: L"
              className="rounded-xl bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-purple-600 active:scale-95 disabled:opacity-40"
            >
              {countdown !== null ? `${countdown}...` : isLooping ? "Loop OFF" : "Loop ON"}
            </button>
          </div>

          <div className="flex items-center gap-1" title="단축키: - / +">
            <span className="text-xs font-semibold text-purple-500">속도</span>
            <button
              onClick={() => setSpeed(Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100)}
              disabled={playbackRate <= 0.25}
              title="속도 감소 (단축키: -)"
              className="rounded-lg border-2 border-purple-100 bg-white/80 px-1.5 py-0.5 text-xs font-medium text-purple-600 transition hover:bg-purple-50 active:scale-95 disabled:opacity-40"
            >
              -
            </button>
            <span className="min-w-[2rem] text-center text-xs font-bold text-purple-700">{playbackRate}x</span>
            <button
              onClick={() => setSpeed(Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100)}
              disabled={playbackRate >= 3}
              title="속도 증가 (단축키: +)"
              className="rounded-lg border-2 border-purple-100 bg-white/80 px-1.5 py-0.5 text-xs font-medium text-purple-600 transition hover:bg-purple-50 active:scale-95 disabled:opacity-40"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-1" title="단축키: ← / →">
            <span className="text-xs font-semibold text-purple-500">이동</span>
            <button
              onClick={() => setSeekStep((prev) => Math.max(1, prev - 1))}
              disabled={seekStep <= 1}
              title="이동 간격 줄이기"
              className="rounded-lg border-2 border-purple-100 bg-white/80 px-1.5 py-0.5 text-xs font-medium text-purple-600 active:scale-95 disabled:opacity-40"
            >
              -
            </button>
            <span className="min-w-[2rem] text-center text-xs font-bold text-purple-700">{seekStep}초</span>
            <button
              onClick={() => setSeekStep((prev) => Math.min(30, prev + 1))}
              disabled={seekStep >= 30}
              title="이동 간격 늘리기"
              className="rounded-lg border-2 border-purple-100 bg-white/80 px-1.5 py-0.5 text-xs font-medium text-purple-600 active:scale-95 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="text-xs text-purple-500">루프 시작 전 타이머</label>
          <select
            value={loopStartDelay}
            onChange={(e) => setLoopStartDelay(Number(e.target.value))}
            className="rounded-xl border-2 border-purple-200 bg-white/80 px-2 py-1 text-xs text-purple-700 outline-none focus:border-purple-400"
          >
            {LOOP_DELAY_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {sec === 0 ? "바로 시작" : `${sec}초`}
              </option>
            ))}
          </select>
        </div>

        {currentVideoSegments.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-purple-600">저장된 구간</h2>
              <p className="text-xs text-purple-300">{currentVideoSegments.length}개</p>
            </div>

            <div className="flex flex-col gap-2">
              {currentVideoSegments.map((segment) => {
                const isActive = pointA === segment.start && pointB === segment.end

                return (
                  <div
                    key={segment.id}
                    className={`flex items-center justify-between gap-2 rounded-2xl border-2 p-2 transition ${isActive
                      ? "border-purple-400 bg-purple-100/80 shadow-sm"
                      : "border-purple-50 bg-white/50 opacity-60 hover:border-purple-200 hover:opacity-100"
                      }`}
                  >
                    {editingSegmentId === segment.id ? (
                      <div className="flex min-w-0 flex-1 gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-xl border-2 border-purple-300 bg-white px-3 py-1.5 text-sm text-purple-900 outline-none focus:border-purple-500"
                          type="search"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditSegment()
                            if (e.key === "Escape") cancelEditSegment()
                          }}
                          autoFocus
                        />
                        <button
                          className="shrink-0 rounded-xl bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
                          onClick={saveEditSegment}
                        >
                          저장
                        </button>
                        <button
                          className="shrink-0 rounded-xl border border-purple-200 px-3 py-1.5 text-xs text-purple-500 active:scale-95"
                          onClick={cancelEditSegment}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            clearCountdown()
                            setPointA(segment.start)
                            setPointB(segment.end)
                            seekTo(segment.start)
                          }}
                        >
                          <p className={`truncate text-sm font-semibold ${isActive ? "text-purple-800" : "text-purple-600"}`}>
                            {segment.title}
                          </p>
                          <p className={`text-[11px] ${isActive ? "text-purple-500" : "text-purple-400"}`}>
                            {format(segment.start)} - {format(segment.end)}
                          </p>
                        </button>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            className="rounded-xl border-2 border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-600 transition hover:bg-purple-100 active:scale-95"
                            onClick={() => startEditSegment(segment)}
                          >
                            수정
                          </button>
                          <button
                            className="rounded-xl border-2 border-pink-100 bg-pink-50 px-2.5 py-1.5 text-xs font-medium text-pink-500 transition hover:bg-pink-100 active:scale-95"
                            onClick={() =>
                              setSavedSegments((prev) => prev.filter((item) => item.id !== segment.id))
                            }
                          >
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>


      {/* YouTube Player */}
      <section
        ref={playerContainerRef}
        onMouseMove={handleFsInteraction}
        onTouchStart={handleFsInteraction}
        className={`overflow-hidden bg-black shadow-lg ${isFullscreen ? "fixed inset-0 z-[100] rounded-none border-0" : "relative rounded-2xl border-2 border-purple-100"}`}
      >
        <div className={`${isFullscreen ? "absolute inset-0" : "aspect-video"} w-full [&>div]:!h-full [&>div]:!w-full [&_iframe]:!h-full [&_iframe]:!w-full`}>
          <YouTube
            videoId={videoId}
            onReady={onReady}
            opts={{
              width: "100%",
              height: "100%",
              playerVars: {
                playsinline: 1,
              },
            }}
            className="h-full w-full"
          />
        </div>

        <div
          className="absolute inset-0 z-10 cursor-pointer bg-black/30"
          onClick={togglePlayPause}
        />
        {!isFullscreen ? (
          <button
            onClick={toggleFullscreen}
            title="전체화면 (단축키: F)"
            className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-xl bg-purple-500/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-purple-600 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.75 3.75v4.5h1.5v-3h3v-1.5h-4.5zM11.75 3.75v1.5h3v3h1.5v-4.5h-4.5zM5.25 11.75h-1.5v4.5h4.5v-1.5h-3v-3zM16.25 11.75v3h-3v1.5h4.5v-4.5h-1.5z" />
            </svg>
            전체화면
          </button>
        ) : (
          <button
            onClick={toggleFullscreen}
            title="전체화면 닫기 (단축키: F / Esc)"
            className={`absolute right-3 top-3 z-40 flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-white/30 active:scale-95 ${showFsControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.28 4.28a.75.75 0 011.06 0L10 8.94l4.66-4.66a.75.75 0 111.06 1.06L11.06 10l4.66 4.66a.75.75 0 11-1.06 1.06L10 11.06l-4.66 4.66a.75.75 0 01-1.06-1.06L8.94 10 4.28 5.34a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
            닫기
          </button>
        )}

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40">
            <div className="rounded-3xl bg-white/95 px-8 py-5 text-center shadow-xl">
              <p className="text-sm text-purple-400">루프 시작까지</p>
              <p className="text-5xl font-extrabold text-purple-600">{countdown}</p>
            </div>
          </div>
        )}

        {/* Fullscreen Overlay Controls */}
        {isFullscreen && (
          <div
            onMouseMove={(e) => { e.stopPropagation(); handleFsInteraction() }}
            onTouchStart={(e) => { e.stopPropagation(); handleFsInteraction() }}
            className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 transition-opacity duration-300 ${showFsControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {/* Progress Bar */}
            <div
              ref={isFullscreen ? progressBarRef : undefined}
              onPointerMove={handlePointerMove}
              onClick={handleProgressTap}
              className="relative mb-3 h-3 w-full touch-none rounded-full bg-white/30"
            >
              <div
                className="absolute left-0 top-0 h-3 rounded-full bg-purple-400/70"
                style={{ width: `${progressPercent}%` }}
              />
              {canLoop && (
                <div
                  className="absolute top-0 z-10 h-3 cursor-grab rounded-full bg-pink-400/60 active:cursor-grabbing"
                  style={{ left: `${loopStartPercent}%`, width: `${loopWidth}%` }}
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("range", e.clientX) }}
                />
              )}
              {pointA !== null && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("a", e.clientX) }}
                  className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-pink-500 shadow-lg"
                  style={{ left: `${loopStartPercent}%`, width: HANDLE, height: HANDLE }}
                >
                  <span className="text-[10px] font-extrabold text-white">A</span>
                </button>
              )}
              {pointB !== null && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("b", e.clientX) }}
                  className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-purple-500 shadow-lg"
                  style={{ left: `${loopEndPercent}%`, width: HANDLE, height: HANDLE }}
                >
                  <span className="text-[10px] font-extrabold text-white">B</span>
                </button>
              )}
              <div
                className="absolute top-[-3px] z-30 h-5 w-1 -translate-x-1/2 rounded-full bg-white"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={togglePlayPause} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/30 active:scale-95">
                재생 / 정지
              </button>
              <button onClick={toggleLoop} disabled={!canLoop} className="rounded-lg bg-purple-500/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-purple-500 active:scale-95 disabled:opacity-40">
                {countdown !== null ? `${countdown}...` : isLooping ? "Loop OFF" : "Loop ON"}
              </button>
              <button onClick={() => { clearCountdown(); setPointA(currentTime) }} className="rounded-lg bg-pink-500/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-pink-500 active:scale-95">
                A 설정
              </button>
              <button onClick={() => { clearCountdown(); setPointB(currentTime) }} className="rounded-lg bg-purple-500/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-purple-500 active:scale-95">
                B 설정
              </button>
              <button onClick={() => { seekTo(currentTime - seekStep) }} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/30 active:scale-95">
                -{seekStep}초
              </button>
              <button onClick={() => { seekTo(currentTime + seekStep) }} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/30 active:scale-95">
                +{seekStep}초
              </button>

              <div className="flex items-center gap-1">
                <span className="text-xs text-white/70">속도</span>
                <button onClick={() => setSpeed(Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100)} className="rounded-lg bg-white/20 px-1.5 py-0.5 text-xs text-white hover:bg-white/30 active:scale-95">-</button>
                <span className="min-w-[2rem] text-center text-xs font-bold text-white">{playbackRate}x</span>
                <button onClick={() => setSpeed(Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100)} className="rounded-lg bg-white/20 px-1.5 py-0.5 text-xs text-white hover:bg-white/30 active:scale-95">+</button>
              </div>

              <div className="ml-auto flex items-center gap-2 text-xs text-white/80">
                <span>A: {pointA !== null ? formatPrecise(pointA) : "-"}</span>
                <span>B: {pointB !== null ? formatPrecise(pointB) : "-"}</span>
                <span>{format(currentTime)} / {duration > 0 ? format(duration) : "--:--"}</span>
              </div>
            </div>

            {/* Save Segment in Fullscreen */}
            <div className="mt-2 flex gap-1.5">
              <button
                disabled={!canLoop}
                onClick={handleSave}
                className="shrink-0 rounded-lg bg-pink-500/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-pink-500 active:scale-95 disabled:opacity-40"
              >
                구간 저장
              </button>
            </div>

            {/* Saved Segments in Fullscreen */}
            {currentVideoSegments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {currentVideoSegments.map((segment) => {
                  const isActive = pointA === segment.start && pointB === segment.end
                  return (
                    <button
                      key={segment.id}
                      onClick={() => {
                        clearCountdown()
                        setPointA(segment.start)
                        setPointB(segment.end)
                        seekTo(segment.start)
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur transition active:scale-95 ${
                        isActive
                          ? "bg-pink-500/80 text-white"
                          : "bg-white/20 text-white/80 hover:bg-white/30"
                      }`}
                    >
                      {segment.title} <span className="text-white/60">{format(segment.start)}-{format(segment.end)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* A/B Section */}
      <section className="rounded-3xl border-2 border-purple-100 bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-purple-600">A/B 구간</h2>
            <p className="text-xs text-purple-300">핸들 드래그 또는 버튼으로 조정</p>
          </div>
          <div className="text-right text-xs text-purple-500">
            <p>
              {format(currentTime)} / {duration > 0 ? format(duration) : "--:--"}
            </p>
            <p>
              {canLoop && pointA !== null && pointB !== null
                ? `길이 ${formatPrecise(pointB - pointA)}`
                : "구간 미설정"}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          ref={progressBarRef}
          onPointerMove={handlePointerMove}
          onClick={handleProgressTap}
          className="relative mb-4 h-3 w-full touch-none rounded-full bg-purple-100"
        >
          <div
            className="absolute left-0 top-0 h-3 rounded-full bg-purple-300/60"
            style={{ width: `${progressPercent}%` }}
          />

          {canLoop && (
            <div
              className="absolute top-0 z-10 h-3 cursor-grab rounded-full bg-pink-400/50 active:cursor-grabbing"
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
              className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-3 border-white bg-pink-500 shadow-lg transition hover:scale-110"
              style={{ left: `${loopStartPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-extrabold text-white">A</span>
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
              className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-3 border-white bg-purple-500 shadow-lg transition hover:scale-110"
              style={{ left: `${loopEndPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-extrabold text-white">B</span>
            </button>
          )}

          <div
            className="absolute top-[-3px] z-30 h-5 w-1 -translate-x-1/2 rounded-full bg-purple-700"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* A/B/Length Info */}
        <div className="mb-2 grid grid-cols-3 gap-1.5 text-xs">
          <div className="rounded-xl bg-pink-50 px-2 py-1 text-center">
            <span className="font-semibold text-pink-400">A </span>
            <span className="font-bold text-pink-600">{pointA !== null ? formatPrecise(pointA) : "-"}</span>
          </div>
          <div className="rounded-xl bg-purple-50 px-2 py-1 text-center">
            <span className="font-semibold text-purple-400">B </span>
            <span className="font-bold text-purple-600">{pointB !== null ? formatPrecise(pointB) : "-"}</span>
          </div>
          <div className="rounded-xl bg-violet-50 px-2 py-1 text-center">
            <span className="font-semibold text-violet-400">길이 </span>
            <span className="font-bold text-violet-600">
              {canLoop && pointA !== null && pointB !== null ? formatPrecise(pointB - pointA) : "-"}
            </span>
          </div>
        </div>

        {/* A/B Buttons */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button
            title="단축키: A"
            className="rounded-xl border-2 border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600 transition hover:bg-pink-100 active:scale-95"
            onClick={() => {
              clearCountdown()
              setPointA(currentTime)
            }}
          >
            A 설정
          </button>
          <button
            title="단축키: B"
            className="rounded-xl border-2 border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 transition hover:bg-purple-100 active:scale-95"
            onClick={() => {
              clearCountdown()
              setPointB(currentTime)
            }}
          >
            B 설정
          </button>
          <button
            title="단축키: ←"
            className="rounded-xl border-2 border-purple-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-purple-500 transition hover:bg-purple-50 active:scale-95"
            onClick={() => {
              seekTo(currentTime - seekStep)
            }}
          >
            -{seekStep}초
          </button>
          <button
            title="단축키: →"
            className="rounded-xl border-2 border-purple-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-purple-500 transition hover:bg-purple-50 active:scale-95"
            onClick={() => {
              seekTo(currentTime + seekStep)
            }}
          >
            +{seekStep}초
          </button>
        </div>

        {/* Fine Adjust */}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button
            className="rounded-xl border-2 border-pink-100 bg-white/80 px-2.5 py-1 text-xs font-medium text-pink-500 transition hover:bg-pink-50 active:scale-95 disabled:opacity-40"
            onClick={() => adjustPointA(-0.5)}
            disabled={pointA === null}
          >
            A -0.5s
          </button>
          <button
            className="rounded-xl border-2 border-pink-100 bg-white/80 px-2.5 py-1 text-xs font-medium text-pink-500 transition hover:bg-pink-50 active:scale-95 disabled:opacity-40"
            onClick={() => adjustPointA(0.5)}
            disabled={pointA === null}
          >
            A +0.5s
          </button>
          <button
            className="rounded-xl border-2 border-purple-100 bg-white/80 px-2.5 py-1 text-xs font-medium text-purple-500 transition hover:bg-purple-50 active:scale-95 disabled:opacity-40"
            onClick={() => adjustPointB(-0.5)}
            disabled={pointB === null}
          >
            B -0.5s
          </button>
          <button
            className="rounded-xl border-2 border-purple-100 bg-white/80 px-2.5 py-1 text-xs font-medium text-purple-500 transition hover:bg-purple-50 active:scale-95 disabled:opacity-40"
            onClick={() => adjustPointB(0.5)}
            disabled={pointB === null}
          >
            B +0.5s
          </button>
        </div>

        {/* Save Segment */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border-2 border-purple-200 bg-white/80 px-3 py-2.5 text-sm text-purple-900 placeholder-purple-300 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
            placeholder="구간 이름 (예: 인트로, 후렴)"
            value={segmentTitle}
            onChange={(e) => setSegmentTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
            }}
          />
          <button
            disabled={!canLoop}
            onClick={handleSave}
            title="단축키: S"
            className="shrink-0 rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-pink-600 active:scale-95 disabled:opacity-40"
          >
            구간 저장
          </button>
        </div>
      </section>

      {/* Video List Toggle Button - Fixed Right */}
      <button
        onClick={() => setShowVideoList((prev) => !prev)}
        className="fixed right-0 top-1/2 z-[55] -translate-y-1/2 rounded-l-xl bg-purple-500 px-1.5 py-3 text-white shadow-lg transition hover:bg-purple-600 active:scale-95"
        title="저장된 영상 목록"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 transition-transform duration-300 ${showVideoList ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Video List Slide Panel */}
      <div
        className={`fixed right-0 top-0 z-[55] h-full w-72 transform border-l border-purple-100 bg-white/95 shadow-2xl backdrop-blur transition-transform duration-300 ${showVideoList ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-purple-600">저장된 영상</h2>
            <button
              onClick={() => setShowVideoList(false)}
              className="rounded-lg px-2 py-1 text-xs text-purple-400 transition hover:bg-purple-50 hover:text-purple-600"
            >
              닫기
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {savedVideos.length === 0 ? (
              <p className="py-6 text-center text-xs text-purple-300">영상을 불러오면 자동 저장됩니다</p>
            ) : (
              <div className="flex flex-col gap-2">
                {savedVideos.map((video) => (
                  <div
                    key={video.videoId}
                    className={`group rounded-xl border-2 p-2 transition ${video.videoId === videoId
                      ? "border-purple-400 bg-purple-50"
                      : "border-purple-50 bg-white hover:border-purple-200"
                      }`}
                  >
                    <button
                      className="mb-1 block w-full overflow-hidden rounded-lg"
                      onClick={() => handleSelectVideo(video)}
                    >
                      <img
                        src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                        alt=""
                        className="aspect-video w-full rounded-lg object-cover"
                      />
                    </button>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-purple-700"
                        onClick={() => handleSelectVideo(video)}
                      >
                        {video.videoId === videoId ? "▶ 재생 중" : "선택"}
                      </button>
                      <button
                        className="rounded-lg px-1.5 py-0.5 text-[10px] text-pink-400 opacity-0 transition hover:bg-pink-50 hover:text-pink-600 group-hover:opacity-100"
                        onClick={() => handleDeleteVideo(video.videoId)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Video List Backdrop */}
      {showVideoList && (
        <div
          className="fixed inset-0 z-[54] bg-black/20"
          onClick={() => setShowVideoList(false)}
        />
      )}

      {/* Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/30 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full rounded-t-3xl bg-white/95 p-6 shadow-2xl backdrop-blur sm:w-[380px] sm:rounded-3xl">
            <h3 className="mb-4 text-center text-lg font-extrabold text-purple-600">사용법</h3>
            <div className="space-y-3 text-sm text-purple-700">
              <p className="rounded-2xl bg-pink-50 px-3 py-2">재생바 탭으로 원하는 위치로 이동</p>
              <p className="rounded-2xl bg-purple-50 px-3 py-2">A/B 핸들 드래그로 구간 시작/끝 조정</p>
              <p className="rounded-2xl bg-violet-50 px-3 py-2">파란 구간 드래그로 루프 전체 이동</p>
              <p className="rounded-2xl bg-pink-50 px-3 py-2">모바일: 고정 컨트롤로 재생/루프/속도 조절</p>
              <p className="rounded-2xl bg-purple-50 px-3 py-2">루프 시작 전 타이머로 카운트다운 설정</p>
              <p className="rounded-2xl bg-violet-50 px-3 py-2">새로고침 후에도 영상과 위치 유지</p>
              <div className="rounded-2xl bg-pink-50 px-3 py-2">
                <p className="mb-1 font-semibold">키보드 단축키 (한/영 모두 지원)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-purple-700">
                  <p><kbd className="rounded border bg-white px-1">A</kbd> A 지점 설정</p>
                  <p><kbd className="rounded border bg-white px-1">B</kbd> B 지점 설정</p>
                  <p><kbd className="rounded border bg-white px-1">L</kbd> Loop ON/OFF</p>
                  <p><kbd className="rounded border bg-white px-1">S</kbd> 구간 저장</p>
                  <p><kbd className="rounded border bg-white px-1">Space</kbd> 재생/정지</p>
                  <p><kbd className="rounded border bg-white px-1">Esc</kbd> Loop 끄기</p>
                  <p><kbd className="rounded border bg-white px-1">F</kbd> 전체화면</p>
                  <p><kbd className="rounded border bg-white px-1">←</kbd><kbd className="rounded border bg-white px-1">→</kbd> 앞뒤 이동</p>
                  <p><kbd className="rounded border bg-white px-1">-</kbd><kbd className="rounded border bg-white px-1">+</kbd> 속도 조절</p>
                </div>
              </div>
            </div>
            <button
              className="mt-5 w-full rounded-xl bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-purple-600 active:scale-95"
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