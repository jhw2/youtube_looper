"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import YouTube, { YouTubeEvent } from "react-youtube"
import "./i18n"

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
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
])

function SettingsIcon({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.25" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.2.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.2a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.2a1 1 0 0 0-.2 1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  )
}

export default function Home() {
  const { t, i18n } = useTranslation()
  const playerRef = useRef<PlayerLike | null>(null)
  const progressBarRef = useRef<HTMLDivElement | null>(null)
  const restoreTimeRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ clientX: number; startA: number; startB: number } | null>(null)
  const countdownIntervalRef = useRef<number | null>(null)
  const countdownTimeoutRef = useRef<number | null>(null)
  const touchSeekRef = useRef<{ lastTapAt: number; side: "left" | "right" | null }>({
    lastTapAt: 0,
    side: null,
  })

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
  const [showFsControls, setShowFsControls] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [showPlayerSettings, setShowPlayerSettings] = useState(false)
  const fsHideTimerRef = useRef<number | null>(null)
  const currentVideoSegments = useMemo(
    () => savedSegments.filter((segment) => segment.videoId === videoId),
    [savedSegments, videoId],
  )
  const shortcutSegments = useMemo(
    () => [...currentVideoSegments].reverse().slice(0, 9),
    [currentVideoSegments],
  )

  const canLoop = pointA !== null && pointB !== null && pointB > pointA

  const loopStartPercent = duration > 0 && pointA !== null ? (pointA / duration) * 100 : 0
  const loopEndPercent = duration > 0 && pointB !== null ? (pointB / duration) * 100 : 0
  const loopWidth = Math.max(loopEndPercent - loopStartPercent, 0)
  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0
  const formatSegmentShortcut = (shortcutIndex: number) =>
    t("segmentShortcutHint", { shortcutNumber: shortcutIndex + 1 })

  const format = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const formatPrecise = (seconds: number | null) => {
    if (seconds === null) return "-"
    return `${seconds.toFixed(1)}s`
  }

  const isAllowedYouTubeHost = (hostname: string) => ALLOWED_YOUTUBE_HOSTS.has(hostname.toLowerCase())

  const extractVideoId = (value: string): string | null => {
    try {
      const url = new URL(value)
      const hostname = url.hostname.toLowerCase()

      if (!isAllowedYouTubeHost(hostname)) {
        return null
      }

      if (hostname === "youtu.be") {
        const videoId = url.pathname.replace(/^\/+/, "").split("/")[0] || null
        return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null
      }

      if (hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com") {
        if (url.pathname.includes("/shorts/")) {
          const parts = url.pathname.split("/")
          const videoId = parts[2] || null
          return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null
        }
        const videoId = url.searchParams.get("v")
        return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null
      }

      return null
    } catch {
      return null
    }
  }

  const getVideoIdFromQuery = () => {
    const queryVideoId = new URLSearchParams(window.location.search).get("v")
    if (!queryVideoId) return null

    const normalized = queryVideoId.trim()
    return YOUTUBE_VIDEO_ID_PATTERN.test(normalized) ? normalized : null
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

    // A/B가 지정되지 않은 경우 기본값으로 A=0, B=끝 설정
    setPointA((prev) => prev ?? 0)
    setPointB((prev) => prev ?? nextDuration)

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

    // 자동 로드는 raw URL 대신 검증된 videoId 쿼리 파라미터만 허용
    const queryVideoId = getVideoIdFromQuery()
    if (queryVideoId) {
      setVideoId(queryVideoId)
      setInputValue(`https://www.youtube.com/watch?v=${queryVideoId}`)
      setCurrentTime(0)
      setPointA(null)
      setPointB(null)
      restoreTimeRef.current = 0
    }
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
      alert(t("invalidUrl"))
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
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  const selectSegment = (segment: SavedSegment) => {
    clearCountdown()
    setPointA(segment.start)
    setPointB(segment.end)
    seekTo(segment.start)
  }

  const playerContainerRef = useRef<HTMLDivElement | null>(null)
  const sliderRef = useRef<HTMLDivElement | null>(null)

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

  const handlePlayerHover = () => {
    if (isFullscreen) {
      setShowFsControls(true)
      resetFsHideTimer()
      return
    }

    setShowFsControls(true)
  }

  const handlePlayerTouch = () => {
    setShowFsControls(true)
    resetFsHideTimer()
  }

  const handleMobileTapZone = (side: "left" | "center" | "right") => {
    handlePlayerTouch()

    if (side === "center") {
      touchSeekRef.current = { lastTapAt: 0, side: null }
      return
    }

    const now = Date.now()
    const { lastTapAt, side: lastSide } = touchSeekRef.current

    if (lastSide === side && now - lastTapAt < 320) {
      const direction = side === "left" ? -1 : 1
      seekTo(currentTime + direction * seekStep)
      touchSeekRef.current = { lastTapAt: 0, side: null }
      return
    }

    touchSeekRef.current = { lastTapAt: now, side }
  }

  const handlePlayerLeave = () => {
    if (isFullscreen) return
    clearFsHideTimer()
    setShowFsControls(false)
    setShowPlayerSettings(false)
  }

  const revealFsControls = () => {
    if (!isFullscreen) return
    setShowFsControls(true)
    resetFsHideTimer()
  }

  useEffect(() => {
    return () => clearFsHideTimer()
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)")
    const updateTouchDevice = () => {
      setIsTouchDevice(mediaQuery.matches || "ontouchstart" in window)
    }

    updateTouchDevice()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTouchDevice)
      return () => mediaQuery.removeEventListener("change", updateTouchDevice)
    }

    mediaQuery.addListener(updateTouchDevice)
    return () => mediaQuery.removeListener(updateTouchDevice)
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
          revealFsControls()
          clearCountdown()
          setPointA(currentTime)
          return
        }
        if (isB) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          revealFsControls()
          clearCountdown()
          setPointB(currentTime)
          return
        }
        if (isS) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          revealFsControls()
          handleSave()
          return
        }
        if (isL) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          revealFsControls()
          toggleLoop()
          return
        }
        if (isF) {
          e.preventDefault()
            ; (target as HTMLElement)?.blur()
          revealFsControls()
          toggleFullscreen()
          return
        }
        return
      }

      if (isA) {
        e.preventDefault()
        revealFsControls()
        clearCountdown()
        setPointA(currentTime)
      } else if (isB) {
        e.preventDefault()
        revealFsControls()
        clearCountdown()
        setPointB(currentTime)
      } else if (isL) {
        e.preventDefault()
        revealFsControls()
        toggleLoop()
      } else if (isS) {
        e.preventDefault()
        revealFsControls()
        handleSave()
      } else if (isF) {
        e.preventDefault()
        revealFsControls()
        toggleFullscreen()
      } else if (code === "Space" || key === " ") {
        e.preventDefault()
        revealFsControls()
        togglePlayPause()
      } else if (code === "ArrowLeft") {
        e.preventDefault()
        revealFsControls()
        seekTo(currentTime - seekStep)
      } else if (code === "ArrowRight") {
        e.preventDefault()
        revealFsControls()
        seekTo(currentTime + seekStep)
      } else if (/^[1-9]$/.test(key)) {
        const segment = shortcutSegments[Number(key) - 1]
        if (!segment) return
        e.preventDefault()
        revealFsControls()
        selectSegment(segment)
      } else if (key === "-" || key === "_") {
        e.preventDefault()
        revealFsControls()
        if (playbackRate > 0.25) {
          setSpeed(
            Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100
          )
        }
      } else if (key === "=" || key === "+") {
        e.preventDefault()
        revealFsControls()
        if (playbackRate < 3) {
          setSpeed(
            Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100
          )
        }
      } else if (key === "escape") {
        e.preventDefault()
        revealFsControls()
        clearCountdown()
        setIsLooping(false)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [currentTime, playbackRate, pointA, pointB, isLooping, countdown, seekStep, shortcutSegments])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 px-3 py-3">
      {/* Compact Header */}
      <header className="flex items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-zinc-50">YT Looper</h1>
          <span className="hidden text-[11px] text-zinc-500 sm:inline">A-B 구간 반복</span>
        </div>
        <div className="flex gap-1.5">
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-medium text-zinc-200 outline-none transition hover:border-zinc-500"
          >
            <option value="en">EN</option>
            <option value="ko">한국어</option>
          </select>
          <button
            onClick={() => setShowShortcuts(true)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            {t("help")}
          </button>
          <button
            onClick={() => setShowVideoList((prev) => !prev)}
            className="flex h-7 w-8 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-200 transition hover:bg-zinc-800"
            title={t("videoListTitle")}
            aria-label={t("videoListTitle")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 5.75A.75.75 0 013.75 5h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 5.75zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 14.25z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* URL Input */}
      <section className="flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:bg-zinc-900"
          placeholder={t("urlPlaceholder")}
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLoadVideo()
          }}
        />
        <button
          className="shrink-0 rounded-lg bg-[#3ea6ff] px-4 py-2.5 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#65b8ff] active:scale-95"
          onClick={handleLoadVideo}
        >
          {t("load")}
        </button>
      </section>


      {/* YouTube Player */}
      <section
        ref={playerContainerRef}
        onMouseEnter={handlePlayerHover}
        onMouseMove={handlePlayerHover}
        onMouseLeave={handlePlayerLeave}
        onTouchStart={handlePlayerTouch}
        style={isFullscreen ? { height: "100dvh" } : undefined}
        className={`overflow-hidden bg-black shadow-lg ${isFullscreen ? "fixed left-0 right-0 top-0 z-[100] rounded-none border-0" : "relative rounded-xl border border-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"}`}
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
                controls: 0,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                fs: 0,
                disablekb: 1,
              },
            }}
            className="h-full w-full"
          />
        </div>

        {isTouchDevice && (
          <div className="absolute inset-0 z-10 flex">
            <button
              type="button"
              aria-label={`왼쪽 두 번 탭: ${seekStep}초 뒤로`}
              onTouchStart={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleMobileTapZone("left")
              }}
              className="h-full w-1/3 bg-transparent"
            />
            <button
              type="button"
              aria-label="플레이어 컨트롤 보기"
              onTouchStart={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleMobileTapZone("center")
              }}
              className="h-full w-1/3 bg-transparent"
            />
            <button
              type="button"
              aria-label={`오른쪽 두 번 탭: ${seekStep}초 앞으로`}
              onTouchStart={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleMobileTapZone("right")
              }}
              className="h-full w-1/3 bg-transparent"
            />
          </div>
        )}

        <div
          className="absolute inset-x-0 top-0 z-20"
          style={{ height: "calc(4rem + env(safe-area-inset-top, 0px))" }}
        />

        {!isFullscreen ? (
          <button
            onClick={toggleFullscreen}
            title="전체화면 (단축키: F)"
            className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-black/80 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.75 3.75v4.5h1.5v-3h3v-1.5h-4.5zM11.75 3.75v1.5h3v3h1.5v-4.5h-4.5zM5.25 11.75h-1.5v4.5h4.5v-1.5h-3v-3zM16.25 11.75v3h-3v1.5h4.5v-4.5h-1.5z" />
            </svg>
            {t("fullscreen")}
          </button>
        ) : (
          <button
            onClick={toggleFullscreen}
            title="전체화면 닫기 (단축키: F / Esc)"
            className={`absolute right-3 top-3 z-40 flex items-center gap-1.5 rounded-md bg-black/55 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/70 active:scale-95 ${showFsControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
            style={{
              top: "calc(0.75rem + env(safe-area-inset-top, 0px))",
              right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.28 4.28a.75.75 0 011.06 0L10 8.94l4.66-4.66a.75.75 0 111.06 1.06L11.06 10l4.66 4.66a.75.75 0 11-1.06 1.06L10 11.06l-4.66 4.66a.75.75 0 01-1.06-1.06L8.94 10 4.28 5.34a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
            {t("close")}
          </button>
        )}

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-8 py-5 text-center shadow-xl">
              <p className="text-sm text-zinc-400">{t("loopStartingIn")}</p>
              <p className="text-5xl font-extrabold text-zinc-50">{countdown}</p>
            </div>
          </div>
        )}

        {/* Player Overlay Controls */}
        {isFullscreen && (
          <div
            onMouseMove={(e) => { e.stopPropagation(); handlePlayerHover() }}
            onTouchStart={(e) => { e.stopPropagation(); handlePlayerTouch() }}
            className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/[0.03] to-transparent px-3 pb-3 pt-3 transition-opacity duration-300 sm:px-4 sm:pb-4 ${showFsControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
            style={{
              paddingBottom: isFullscreen
                ? "calc(0.75rem + env(safe-area-inset-bottom, 0px))"
                : undefined,
              paddingLeft: isFullscreen
                ? "calc(0.75rem + env(safe-area-inset-left, 0px))"
                : undefined,
              paddingRight: isFullscreen
                ? "calc(0.75rem + env(safe-area-inset-right, 0px))"
                : undefined,
            }}
          >
            {/* Progress Bar */}
            <div
              ref={isFullscreen ? progressBarRef : undefined}
              onPointerMove={handlePointerMove}
              onClick={handleProgressTap}
              className="relative mb-3 h-3 w-full touch-none rounded-full bg-zinc-800/90"
            >
              <div
                className="absolute left-0 top-0 h-3 rounded-full bg-zinc-100/85"
                style={{ width: `${progressPercent}%` }}
              />
              {canLoop && (
                <div
                  className="absolute top-0 z-10 h-3 cursor-grab rounded-full bg-sky-500/80 active:cursor-grabbing"
                  style={{ left: `${loopStartPercent}%`, width: `${loopWidth}%` }}
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("range", e.clientX) }}
                />
              )}
              {pointA !== null && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("a", e.clientX) }}
                  className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#3ea6ff] shadow-lg"
                  style={{ left: `${loopStartPercent}%`, width: HANDLE, height: HANDLE }}
                >
                  <span className="text-[10px] font-extrabold text-white">A</span>
                </button>
              )}
              {pointB !== null && (
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("b", e.clientX) }}
                  className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-zinc-900 shadow-lg"
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
              <button onClick={toggleLoop} disabled={!canLoop} title={`${isLooping ? t("loopOff") : t("loopOn")} — 단축키: L`} className="rounded-lg bg-[#3ea6ff]/90 px-3 py-1.5 text-xs font-semibold text-[#0f0f0f] backdrop-blur hover:bg-[#65b8ff] active:scale-95 disabled:opacity-40">
                {countdown !== null ? `${countdown}...` : isLooping ? t("loopOff") : t("loopOn")}
              </button>

              <button
                disabled={!canLoop}
                onClick={handleSave}
                title={`${t("saveSegment")} — 단축키: S`}
                className="shrink-0 rounded-lg bg-[#3ea6ff]/90 px-3 py-1.5 text-xs font-semibold text-[#0f0f0f] backdrop-blur hover:bg-[#65b8ff] active:scale-95 disabled:opacity-40"
              >
                {t("saveSegment")}
              </button>
              <div className={`relative ${isFullscreen ? "" : "ml-auto"}`}>
                <button
                  type="button"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => setShowPlayerSettings((prev) => !prev)}
                  className="rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-white backdrop-blur transition hover:bg-black/55 active:scale-95"
                  title="플레이어 설정"
                >
                  <SettingsIcon className="h-4 w-4" />
                </button>

                {showPlayerSettings && (
                  <div
                    className="absolute bottom-full right-0 z-40 mb-2 w-[220px] rounded-lg border border-white/10 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                        <span className="text-xs font-semibold text-white/70">{t("seek")}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { seekTo(currentTime - seekStep) }} className="rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-white hover:bg-black/55 active:scale-95">-</button>
                          <span className="min-w-[2.75rem] text-center text-xs font-bold text-white">{seekStep}{t("seconds")}</span>
                          <button onClick={() => { seekTo(currentTime + seekStep) }} className="rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-white hover:bg-black/55 active:scale-95">+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                        <span className="text-xs font-semibold text-white/70">{t("speed")}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSpeed(Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100)} className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/55 active:scale-95">-</button>
                          <span className="min-w-[2.75rem] text-center text-xs font-bold text-white">{playbackRate}x</span>
                          <button onClick={() => setSpeed(Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100)} className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/55 active:scale-95">+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                        <span className="text-xs font-semibold text-white/70">{t("loopStartDelay")}</span>
                        <select
                          value={loopStartDelay}
                          onChange={(e) => setLoopStartDelay(Number(e.target.value))}
                          className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-sky-400"
                        >
                          {LOOP_DELAY_OPTIONS.map((sec) => (
                            <option key={sec} value={sec} className="bg-zinc-950 text-white">
                              {sec === 0 ? t("immediately") : `${sec}${t("seconds")}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* Saved Segments in Fullscreen */}
            {currentVideoSegments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {currentVideoSegments.map((segment) => {
                  const isActive = pointA === segment.start && pointB === segment.end
                  const shortcutIndex = shortcutSegments.findIndex((item) => item.id === segment.id)
                  return (
                    <button
                      key={segment.id}
                      onClick={() => selectSegment(segment)}
                      title={shortcutIndex >= 0 ? formatSegmentShortcut(shortcutIndex) : undefined}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur transition active:scale-95 ${isActive
                        ? "bg-[#3ea6ff]/90 text-[#0f0f0f]"
                        : "bg-black/40 text-white/80 hover:bg-black/55"
                        }`}
                    >
                      {shortcutIndex >= 0 && (
                        <span className="mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black/30 px-1 text-[10px] font-bold text-white">
                          {shortcutIndex + 1}
                        </span>
                      )}
                      {segment.title}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Controls Section */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        {/* Progress Bar */}
        <div
          ref={progressBarRef}
          onPointerMove={handlePointerMove}
          onClick={handleProgressTap}
          className="relative mb-2 h-2 w-full touch-none rounded-full bg-zinc-800"
        >
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-zinc-200/70"
            style={{ width: `${progressPercent}%` }}
          />
          {canLoop && (
            <div
              className="absolute top-0 z-10 h-2 cursor-grab rounded-full bg-sky-500/70 active:cursor-grabbing"
              style={{ left: `${loopStartPercent}%`, width: `${loopWidth}%` }}
              onPointerDown={(e) => { e.stopPropagation(); startDrag("range", e.clientX) }}
            />
          )}
          {pointA !== null && (
            <button
              type="button"
              aria-label="A 핸들"
              title={`A 시작점 — 단축키: A키 | 현재: ${formatPrecise(pointA)}`}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("a", e.clientX) }}
              className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#3ea6ff] shadow-lg transition hover:scale-110"
              style={{ left: `${loopStartPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-extrabold text-white">A</span>
            </button>
          )}
          {pointB !== null && (
            <button
              type="button"
              aria-label="B 핸들"
              title={`B 끝점 — 단축키: B키 | 현재: ${formatPrecise(pointB)}`}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag("b", e.clientX) }}
              className="absolute top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-zinc-900 shadow-lg transition hover:scale-110"
              style={{ left: `${loopEndPercent}%`, width: HANDLE, height: HANDLE }}
            >
              <span className="text-[10px] font-extrabold text-white">B</span>
            </button>
          )}
          <div
            className="absolute top-[-4px] z-30 h-4 w-1 -translate-x-1/2 rounded-full bg-zinc-50 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Time & A/B Display */}
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-mono font-semibold text-sky-400">
            A {pointA !== null ? format(pointA) : "--:--"}
          </span>
          <span className="text-zinc-500">
            {format(currentTime)} / {duration > 0 ? format(duration) : "--:--"}
          </span>
          <span className="font-mono font-semibold text-zinc-300">
            B {pointB !== null ? format(pointB) : "--:--"}
          </span>
        </div>

        {/* Loop & Save */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={toggleLoop}
            disabled={!canLoop}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${isLooping || countdown !== null ? "bg-sky-500 text-[#0f0f0f] hover:bg-sky-400" : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
            title={`${isLooping ? t("loopOff") : t("loopOn")} — 단축키: L`}
          >
            {countdown !== null ? (
              <span>{countdown}...</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path fillRule="evenodd" d="M12 5.25c1.213 0 2.415.046 3.605.135a3.256 3.256 0 013.01 3.01c.044.583.077 1.17.1 1.759L17.03 8.47a.75.75 0 10-1.06 1.06l3 3a.75.75 0 001.06 0l3-3a.75.75 0 00-1.06-1.06l-1.752 1.751c-.023-.65-.06-1.296-.108-1.939a4.756 4.756 0 00-4.392-4.392 49.422 49.422 0 00-7.436 0A4.756 4.756 0 003.89 7.39a.75.75 0 001.11 1.008 3.256 3.256 0 012.9-2.148 47.923 47.923 0 017.1 0zM12 18.75c-1.213 0-2.415-.046-3.605-.135a3.256 3.256 0 01-3.01-3.01 47.43 47.43 0 01-.1-1.759l1.689 1.689a.75.75 0 101.06-1.06l-3-3a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.752-1.751c.023.65.06 1.296.108 1.939a4.756 4.756 0 004.392 4.392 49.413 49.413 0 007.436 0 4.756 4.756 0 004.392-4.392.75.75 0 00-1.5-.059 3.256 3.256 0 01-2.9 2.148 47.923 47.923 0 01-7.1 0z" clipRule="evenodd" />
                </svg>
                {isLooping ? t("loopOff") : t("loopOn")}
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={!canLoop}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 active:scale-95 disabled:opacity-40"
            title={`${t("saveSegment")} — 단축키: S`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
              <path d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" />
            </svg>
            {t("saveSegment")}
          </button>

          <button
            onClick={() => setShowPlayerSettings((prev) => !prev)}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition active:scale-95 ${showPlayerSettings ? "border-sky-500 bg-sky-500/20 text-sky-300" : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`}
            title="상세 설정 (속도 / 반복 딜레이)"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Settings Panel */}
        {showPlayerSettings && (
          <div className="mt-4 space-y-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <div className="grid grid-cols-2 gap-2">
              {/* Speed */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                <span className="text-xs font-medium text-zinc-400">{t("speed")}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSpeed(Math.round(Math.max(0.25, playbackRate - 0.05) * 100) / 100)} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white hover:bg-zinc-700 active:scale-95">-</button>
                  <span className="text-xs font-bold text-white">{playbackRate}x</span>
                  <button onClick={() => setSpeed(Math.round(Math.min(3, playbackRate + 0.05) * 100) / 100)} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white hover:bg-zinc-700 active:scale-95">+</button>
                </div>
              </div>

              {/* Seek Step */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                <span className="text-xs font-medium text-zinc-400">{t("seek")}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSeekStep((prev) => Math.max(1, prev - 1))} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white hover:bg-zinc-700 active:scale-95">-</button>
                  <span className="text-xs font-bold text-white">{seekStep}s</span>
                  <button onClick={() => setSeekStep((prev) => Math.min(30, prev + 1))} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white hover:bg-zinc-700 active:scale-95">+</button>
                </div>
              </div>
            </div>

            {/* Loop Delay */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              <span className="text-xs font-medium text-zinc-400">{t("loopStartDelay")}</span>
              <select
                value={loopStartDelay}
                onChange={(e) => setLoopStartDelay(Number(e.target.value))}
                className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-sky-400"
              >
                {LOOP_DELAY_OPTIONS.map((sec) => (
                  <option key={sec} value={sec} className="bg-zinc-950 text-white">
                    {sec === 0 ? t("immediately") : `${sec}${t("seconds")}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Saved Segments Horizontal Slider */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100">{t("savedSegments")}</h2>
            {shortcutSegments.length > 0 && (
              <span className="hidden text-[11px] text-zinc-500 sm:inline">{t("savedSegmentsShortcutSummary")}</span>
            )}
          </div>
          {currentVideoSegments.length > 0 && (
            <span className="text-xs text-zinc-500">{currentVideoSegments.length}{t("segments")}</span>
          )}
        </div>
        {currentVideoSegments.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-500">{t("noSegments")}</p>
        ) : (
          <div className="relative">
            <button
              onClick={() => sliderRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
              className="absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-md transition hover:bg-zinc-700 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => sliderRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
              className="absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-md transition hover:bg-zinc-700 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
            <div
              ref={sliderRef}
              className="flex gap-3 overflow-x-auto px-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => {
                const el = sliderRef.current
                if (!el) return
                const startX = e.pageX - el.offsetLeft
                const scrollLeft = el.scrollLeft
                const onMove = (ev: MouseEvent) => {
                  const x = ev.pageX - el.offsetLeft
                  el.scrollLeft = scrollLeft - (x - startX)
                }
                const onUp = () => {
                  window.removeEventListener("mousemove", onMove)
                  window.removeEventListener("mouseup", onUp)
                }
                window.addEventListener("mousemove", onMove)
                window.addEventListener("mouseup", onUp)
              }}
            >
            {currentVideoSegments.map((segment) => {
              const isActive = pointA === segment.start && pointB === segment.end
              const shortcutIndex = shortcutSegments.findIndex((item) => item.id === segment.id)
              return (
                <div
                  key={segment.id}
                  title={shortcutIndex >= 0 ? formatSegmentShortcut(shortcutIndex) : undefined}
                  className={`group relative w-36 shrink-0 cursor-pointer overflow-hidden rounded-xl border transition ${isActive ? "border-sky-500" : "border-zinc-700 hover:border-zinc-500"}`}
                  onClick={() => selectSegment(segment)}
                >
                  <img
                    src={`https://img.youtube.com/vi/${segment.videoId}/mqdefault.jpg`}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  <div className={`p-2 ${isActive ? "bg-sky-900/30" : "bg-zinc-900"}`}>
                    {shortcutIndex >= 0 && (
                      <span className="mb-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-zinc-700 px-1 text-[9px] font-bold text-white">
                        {shortcutIndex + 1}
                      </span>
                    )}
                    <p className={`truncate text-xs font-semibold ${isActive ? "text-sky-300" : "text-zinc-100"}`}>
                      {segment.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      {format(segment.start)} - {format(segment.end)}
                    </p>
                  </div>
                  {shortcutIndex >= 0 && (
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 translate-y-2 rounded-md bg-black/80 px-2 py-1 text-center text-[10px] font-medium text-white opacity-0 shadow-lg backdrop-blur transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                      {formatSegmentShortcut(shortcutIndex)}
                    </div>
                  )}
                  {editingSegmentId === segment.id ? (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-zinc-950/95 p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-sky-500"
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditSegment()
                          if (e.key === "Escape") cancelEditSegment()
                        }}
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button className="rounded bg-[#3ea6ff] px-2 py-1 text-[10px] font-semibold text-[#0f0f0f] active:scale-95" onClick={saveEditSegment}>{t("save")}</button>
                        <button className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-200 active:scale-95" onClick={cancelEditSegment}>{t("cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="absolute right-1 top-1 flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white backdrop-blur hover:bg-zinc-700"
                        onClick={(e) => { e.stopPropagation(); startEditSegment(segment) }}
                      >✎</button>
                      <button
                        className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white backdrop-blur hover:bg-red-900/80"
                        onClick={(e) => { e.stopPropagation(); setSavedSegments((prev) => prev.filter((item) => item.id !== segment.id)) }}
                      >✕</button>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        )}
      </section>

      {/* Video List Slide Panel */}
      <div
        className={`fixed right-0 top-0 z-[55] h-full w-72 transform border-l border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ${showVideoList ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-100">{t("savedVideos")}</h2>
            <button
              onClick={() => setShowVideoList(false)}
              className="rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              {t("close")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {savedVideos.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-400">{t("noVideos")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {savedVideos.map((video) => (
                  <div
                    key={video.videoId}
                    className={`group rounded-md border p-2 transition ${video.videoId === videoId
                      ? "border-sky-500 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                      }`}
                  >
                    <button
                      className="mb-1 block w-full overflow-hidden rounded-md"
                      onClick={() => handleSelectVideo(video)}
                    >
                      <img
                        src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                        alt=""
                        className="aspect-video w-full rounded-md object-cover"
                      />
                    </button>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-zinc-100"
                        onClick={() => handleSelectVideo(video)}
                      >
                        {video.videoId === videoId ? t("playing") : t("select")}
                      </button>
                      <button
                        className="rounded-lg px-1.5 py-0.5 text-[10px] text-zinc-400 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-100 group-hover:opacity-100"
                        onClick={() => handleDeleteVideo(video.videoId)}
                      >
                        {t("delete")}
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
          className="fixed inset-0 z-[54] bg-black/30"
          onClick={() => setShowVideoList(false)}
        />
      )}

      {/* Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/30 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full rounded-t-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:w-[420px] sm:rounded-lg">
            <h3 className="mb-4 text-center text-lg font-bold text-zinc-50">{t("help_title")}</h3>
            <div className="space-y-3 text-sm text-zinc-200">
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_1")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_2")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_3")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_4")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_5")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_6")}</p>
              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">{t("help_17")}</p>
              <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p className="mb-2 font-semibold text-zinc-100">{t("help_7")}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-300">
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">A</kbd> {t("help_8")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">B</kbd> {t("help_9")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">L</kbd> {t("help_10")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">S</kbd> {t("help_11")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">Space</kbd> {t("help_12")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">Esc</kbd> {t("help_13")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">F</kbd> {t("help_14")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">←</kbd><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">→</kbd> {t("help_15")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">1</kbd><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">9</kbd> {t("help_18")}</p>
                  <p><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">-</kbd><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1">+</kbd> {t("help_16")}</p>
                </div>
              </div>
            </div>
            <button
              className="mt-5 w-full rounded-md bg-[#3ea6ff] px-4 py-3 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#65b8ff] active:scale-95"
              onClick={() => setShowShortcuts(false)}
            >
              {t("close")}
            </button>
          </div>
        </div>
      )}

      <footer className="pb-4 pt-1 text-[11px] text-zinc-500 sm:pb-2">
        <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("safetyNotice")}</p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100"
          >
            {t("openOnYouTube")}
          </a>
        </div>
      </footer>
    </main>
  )
}
