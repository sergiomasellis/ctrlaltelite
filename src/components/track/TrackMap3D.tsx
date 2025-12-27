import { useRef, useEffect, useMemo, useCallback, type MouseEvent as ReactMouseEvent } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { useCursorSubscription } from "@/lib/cursorStore"
import type { IbtLapData, IbtLapPoint } from "@/components/lap-analysis/types"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import { useTheme } from "@/lib/theme-provider"
import type { TrackMapCorner, TrackMapData } from "@/components/track/types"

interface TrackMap3DProps {
  lapDataByLap: Record<number, IbtLapData> | null
  selectedLaps: number[]
  lapColors: Record<number, string>
  zoomXMin?: number | null
  zoomXMax?: number | null
  trackMap?: TrackMapData | null
  showLapLines?: boolean
  onSurfaceClick?: (point: { distanceKm: number; lat: number; lon: number; altitudeM: number | null }) => void
  surfaceStyle?: "default" | "merged"
}

export function TrackMap3D({
  lapDataByLap,
  selectedLaps,
  lapColors,
  zoomXMin,
  zoomXMax,
  trackMap,
  showLapLines = true,
  onSurfaceClick,
  surfaceStyle,
}: TrackMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<any>(null)
  const trackMeshesRef = useRef<THREE.Group | null>(null)
  const cursorMeshRef = useRef<THREE.Group | null>(null)
  const zoomHighlightRef = useRef<THREE.Group | null>(null)
  const surfaceMeshRef = useRef<THREE.Mesh | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const targetCameraPos = useRef<THREE.Vector3 | null>(null)
  const targetOrbitPos = useRef<THREE.Vector3 | null>(null)
  const { theme } = useTheme()

  const flipX = false
  const flipY = true

  const bounds = useMemo(() => {
    if ((!lapDataByLap || selectedLaps.length === 0) && !trackMap) return null

    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity

    if (lapDataByLap) {
      for (const lap of selectedLaps) {
        const lapData = lapDataByLap[lap]
        if (!lapData) continue

        for (const p of lapData.byDist) {
          if (p.lat != null && p.lon != null) {
            minLat = Math.min(minLat, p.lat)
            maxLat = Math.max(maxLat, p.lat)
            minLon = Math.min(minLon, p.lon)
            maxLon = Math.max(maxLon, p.lon)
          }
        }
      }
    }

    if (trackMap) {
      for (const point of trackMap.points) {
        minLat = Math.min(minLat, point.left.lat, point.right.lat)
        maxLat = Math.max(maxLat, point.left.lat, point.right.lat)
        minLon = Math.min(minLon, point.left.lon, point.right.lon)
        maxLon = Math.max(maxLon, point.left.lon, point.right.lon)
      }
    }

    if (!Number.isFinite(minLat)) return null

    return { minLat, maxLat, minLon, maxLon }
  }, [lapDataByLap, selectedLaps, trackMap])

  const altitudeBounds = useMemo(() => {
    let minAlt = Infinity
    let maxAlt = -Infinity

    if (lapDataByLap) {
      for (const lap of selectedLaps) {
        const lapData = lapDataByLap[lap]
        if (!lapData) continue
        for (const point of lapData.byDist) {
          if (point.altitudeM != null && Number.isFinite(point.altitudeM)) {
            minAlt = Math.min(minAlt, point.altitudeM)
            maxAlt = Math.max(maxAlt, point.altitudeM)
          }
        }
      }
    }

    if (trackMap) {
      for (const point of trackMap.points) {
        if (point.left.altitudeM != null && Number.isFinite(point.left.altitudeM)) {
          minAlt = Math.min(minAlt, point.left.altitudeM)
          maxAlt = Math.max(maxAlt, point.left.altitudeM)
        }
        if (point.right.altitudeM != null && Number.isFinite(point.right.altitudeM)) {
          minAlt = Math.min(minAlt, point.right.altitudeM)
          maxAlt = Math.max(maxAlt, point.right.altitudeM)
        }
      }
    }

    if (!Number.isFinite(minAlt)) return null

    return { minAlt, maxAlt }
  }, [lapDataByLap, selectedLaps, trackMap])

  const centerLat = useMemo(() => {
    if (!bounds) return 0
    return (bounds.minLat + bounds.maxLat) / 2
  }, [bounds])

  const centerLon = useMemo(() => {
    if (!bounds) return 0
    return (bounds.minLon + bounds.maxLon) / 2
  }, [bounds])

  const gpsTo3D = useCallback((
    lat: number,
    lon: number,
    altitudeM: number | null = null,
    speedKmh: number | null = null,
  ): THREE.Vector3 => {
    if (!bounds) return new THREE.Vector3(0, 0, 0)

    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001

    const avgLat = (bounds.minLat + bounds.maxLat) / 2
    const lonScale = Math.cos((avgLat * Math.PI) / 180)

    const maxRange = Math.max(latRange, lonRange * lonScale)
    const scale = 1000 / maxRange

    let x = (lon - centerLon) * lonScale * scale
    let z = (lat - centerLat) * scale

    if (flipX) x = -x
    if (flipY) z = -z

    const altitudeBase = altitudeBounds?.minAlt ?? 0
    const altitudeScale = scale / 111000
    const altitudeValue =
      altitudeM != null && Number.isFinite(altitudeM)
        ? (altitudeM - altitudeBase) * altitudeScale
        : null
    const elevation =
      altitudeValue != null ? altitudeValue : speedKmh != null ? Math.max(0, (speedKmh / 300) * 20) : 0

    return new THREE.Vector3(x, elevation, z)
  }, [bounds, centerLat, centerLon, flipX, flipY, altitudeBounds])

  const centerlinePoints = useMemo(() => {
    if (!trackMap) return []
    return trackMap.points.map((point) => ({
      distanceKm: point.distanceKm,
      lat: (point.left.lat + point.right.lat) / 2,
      lon: (point.left.lon + point.right.lon) / 2,
      altitudeM:
        point.left.altitudeM != null && point.right.altitudeM != null
          ? (point.left.altitudeM + point.right.altitudeM) / 2
          : point.left.altitudeM ?? point.right.altitudeM ?? null,
    }))
  }, [trackMap])

  const centerlineVectors = useMemo(() => {
    if (!bounds || centerlinePoints.length === 0) return []
    return centerlinePoints.map((point) => gpsTo3D(point.lat, point.lon, point.altitudeM))
  }, [bounds, centerlinePoints, gpsTo3D])

  const cornerPoints = useMemo<TrackMapCorner[]>(() => {
    return trackMap?.corners ?? []
  }, [trackMap])

  const createTrackGeometry = useCallback((points: IbtLapPoint[]): {
    geometry: THREE.BufferGeometry
    curve: THREE.CatmullRomCurve3
    tubeSegments: number
  } | null => {
    const validPoints = points.filter((p) => p.lat != null && p.lon != null)
    if (validPoints.length < 2) return null

    const vectors = validPoints.map((p) => gpsTo3D(p.lat!, p.lon!, p.altitudeM, p.speedKmh))
    const curve = new THREE.CatmullRomCurve3(vectors, false, "centripetal")
    const sampleCount = Math.min(1600, Math.max(300, vectors.length * 2))
    const curvePoints = curve.getPoints(sampleCount)
    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints)
    const tubeSegments = Math.min(1200, Math.max(200, sampleCount))

    return { geometry, curve, tubeSegments }
  }, [gpsTo3D])

  const createTrackSurfaceGeometry = useCallback((trackData: TrackMapData): THREE.BufferGeometry | null => {
    if (trackData.points.length < 2) return null

    const positions: number[] = []
    const indices: number[] = []

    for (const point of trackData.points) {
      const left = gpsTo3D(point.left.lat, point.left.lon, point.left.altitudeM)
      const right = gpsTo3D(point.right.lat, point.right.lon, point.right.altitudeM)
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    }

    const segmentCount = trackData.points.length - 1
    for (let i = 0; i < segmentCount; i++) {
      const base = i * 2
      const next = base + 2
      indices.push(base, base + 1, next)
      indices.push(base + 1, next + 1, next)
    }

    if (trackData.points.length > 2) {
      const last = (trackData.points.length - 1) * 2
      indices.push(last, last + 1, 0)
      indices.push(last + 1, 1, 0)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    return geometry
  }, [gpsTo3D])

  const initScene = useCallback(() => {
    if (!containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    const isDark = theme === "dark"
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(isDark ? 0x0a0a0a : 0xf0f0f0)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000)
    camera.position.set(0, 500, 1000)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ambientLight = new THREE.AmbientLight(isDark ? 0x404040 : 0xffffff, isDark ? 0.5 : 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.9 : 0.5)
    directionalLight.position.set(500, 1000, 500)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 2000
    directionalLight.shadow.camera.left = -1000
    directionalLight.shadow.camera.right = 1000
    directionalLight.shadow.camera.top = 1000
    directionalLight.shadow.camera.bottom = -1000
    scene.add(directionalLight)

    const hemisphereLight = new THREE.HemisphereLight(
      isDark ? 0x444444 : 0xeeeeee,
      isDark ? 0x111111 : 0x999999,
      isDark ? 0.4 : 0.6
    )
    scene.add(hemisphereLight)

    const trackGroup = new THREE.Group()
    scene.add(trackGroup)
    trackMeshesRef.current = trackGroup

    const cursorGroup = new THREE.Group()
    scene.add(cursorGroup)
    cursorMeshRef.current = cursorGroup

    const zoomHighlightGroup = new THREE.Group()
    scene.add(zoomHighlightGroup)
    zoomHighlightRef.current = zoomHighlightGroup

    const gridHelper = new THREE.GridHelper(2000, 20, isDark ? 0x2a2a2a : 0xd1d1d1, isDark ? 0x1a1a1a : 0xe5e5e5)
    scene.add(gridHelper)

    const groundGeometry = new THREE.PlaneGeometry(2000, 2000)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x0f0f0f : 0xffffff,
      roughness: 0.8,
      metalness: 0.1,
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 200
    controls.maxDistance = 3000
    controls.maxPolarAngle = Math.PI / 2.2

    // Disable auto-focus when user manually interacts with the camera
    controls.addEventListener('start', () => {
      targetCameraPos.current = null
      targetOrbitPos.current = null
    })

    controlsRef.current = controls

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)

      if (controlsRef.current) {
        // Smoothly interpolate towards targets if they exist
        if (targetOrbitPos.current) {
          controlsRef.current.target.lerp(targetOrbitPos.current, 0.05)
          // Stop interpolating if we're very close to the target
          if (controlsRef.current.target.distanceTo(targetOrbitPos.current) < 0.1) {
            targetOrbitPos.current = null
          }
        }
        if (targetCameraPos.current && cameraRef.current) {
          cameraRef.current.position.lerp(targetCameraPos.current, 0.05)
          // Stop interpolating if we're very close to the target
          if (cameraRef.current.position.distanceTo(targetCameraPos.current) < 0.1) {
            targetCameraPos.current = null
          }
        }
        controlsRef.current.update()
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    }
    animate()
  }, [theme])

  useEffect(() => {
    initScene()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (trackMeshesRef.current) {
        trackMeshesRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
            object.geometry.dispose()
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => mat.dispose())
            } else {
              object.material.dispose()
            }
          }
        })
      }
      if (cursorMeshRef.current) {
        cursorMeshRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => mat.dispose())
            } else {
              object.material.dispose()
            }
          }
        })
      }
      if (zoomHighlightRef.current) {
        zoomHighlightRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => mat.dispose())
            } else {
              object.material.dispose()
            }
          }
        })
      }
      if (rendererRef.current) {
        rendererRef.current.dispose()
        if (containerRef.current && rendererRef.current.domElement.parentNode) {
          containerRef.current.removeChild(rendererRef.current.domElement)
        }
      }
      if (controlsRef.current) {
        controlsRef.current.dispose()
      }
      if (sceneRef.current) {
        sceneRef.current.clear()
      }
      rendererRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      sceneRef.current = null
      trackMeshesRef.current = null
      cursorMeshRef.current = null
      zoomHighlightRef.current = null
      surfaceMeshRef.current = null
    }
  }, [initScene, theme])

  useEffect(() => {
    if (!trackMeshesRef.current) return

    trackMeshesRef.current.clear()
    surfaceMeshRef.current = null

    if (trackMap) {
      const surfaceGeometry = createTrackSurfaceGeometry(trackMap)
      if (surfaceGeometry) {
        const isDark = theme === "dark"
        const resolvedSurfaceStyle = surfaceStyle ?? (showLapLines ? "default" : "merged")
        const surfaceColor = resolvedSurfaceStyle === "merged" ? 0x000000 : isDark ? 0x1c1c1c : 0xe4e4e4
        const surfaceOpacity = resolvedSurfaceStyle === "merged" ? 1 : 0.65
        const surfaceMaterial = new THREE.MeshStandardMaterial({
          color: surfaceColor,
          roughness: 0.9,
          metalness: 0.1,
          transparent: true,
          opacity: surfaceOpacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        })

        const surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
        surfaceMesh.receiveShadow = true
        surfaceMesh.name = "track-surface"
        surfaceMesh.renderOrder = 0
        surfaceMesh.position.y = 0.2
        trackMeshesRef.current.add(surfaceMesh)
        surfaceMeshRef.current = surfaceMesh
      }
    }

    if (showLapLines && lapDataByLap && selectedLaps.length > 0) {
      for (let i = 0; i < selectedLaps.length; i++) {
        const lap = selectedLaps[i]!
        const lapData = lapDataByLap[lap]
        if (!lapData) continue

        const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
        const threeColor = new THREE.Color(color)

        // Add a small vertical offset to each lap to separate overlapping lines
        // We'll stack them slightly in the Y (elevation) axis
        const verticalOffset = i * 4.0

        // Always show the full lap line (don't filter by zoom - the yellow overlay handles that)
        const geometryData = createTrackGeometry(lapData.byDist)
        if (!geometryData) continue

        const material = new THREE.LineBasicMaterial({
          color: threeColor,
          linewidth: 3,
          vertexColors: false,
        })

        const line = new THREE.Line(geometryData.geometry, material)
        line.name = `lap-${lap}`
        line.renderOrder = 1
        line.position.y = verticalOffset
        trackMeshesRef.current.add(line)

        try {
          const tubeGeometry = new THREE.TubeGeometry(geometryData.curve, geometryData.tubeSegments, 1, 8, false)

          const tubeMaterial = new THREE.MeshStandardMaterial({
            color: threeColor,
            emissive: threeColor,
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.5,
          })

          const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
          tube.castShadow = false
          tube.receiveShadow = false
          tube.name = `lap-tube-${lap}`
          tube.renderOrder = 2
          tube.position.y = verticalOffset
          trackMeshesRef.current.add(tube)
        } catch (error) {
          console.warn(`Failed to create tube geometry for lap ${lap}:`, error)
        }
      }
    }

    if (cameraRef.current && bounds) {
      const avgLat = (bounds.minLat + bounds.maxLat) / 2
      const avgLon = (bounds.minLon + bounds.maxLon) / 2
      const centerPos = gpsTo3D(avgLat, avgLon)

      cameraRef.current.lookAt(centerPos)
      if (controlsRef.current) {
        controlsRef.current.target.copy(centerPos)
      }
    }

    if (zoomHighlightRef.current && zoomXMin != null && zoomXMax != null && lapDataByLap && selectedLaps.length > 0) {
      zoomHighlightRef.current.clear()

      const refLap = selectedLaps[0]
      const lapData = lapDataByLap[refLap]
      if (lapData) {
        const sectorPoints = lapData.byDist.filter((p) => {
          return p.distanceKm >= zoomXMin && p.distanceKm <= zoomXMax && p.lat != null && p.lon != null
        })

        if (sectorPoints.length >= 2) {
          const validPoints = sectorPoints.map((p) => gpsTo3D(p.lat!, p.lon!, p.altitudeM, p.speedKmh))

          try {
            const curve = new THREE.CatmullRomCurve3(validPoints, false, "centripetal")
            const sampleCount = Math.min(1600, Math.max(300, validPoints.length * 2))
            const curvePoints = curve.getPoints(sampleCount)
            const highlightGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints)

            const highlightColor = new THREE.Color("#f49f1e")
            const highlightMaterial = new THREE.LineBasicMaterial({
              color: highlightColor,
              linewidth: 3,
              transparent: true,
              opacity: 0.9,
              depthTest: false,
              depthWrite: false,
            })

            const highlightLine = new THREE.Line(highlightGeometry, highlightMaterial)
            highlightLine.name = "zoom-highlight"
            highlightLine.renderOrder = 10
            highlightLine.position.y = 0.6
            zoomHighlightRef.current.add(highlightLine)

            // Set targets for smooth animation in the animate loop
            if (cameraRef.current && controlsRef.current) {
              const box = new THREE.Box3().setFromObject(highlightLine)
              const center = new THREE.Vector3()
              box.getCenter(center)

              // Calculate size of the sector to adjust camera distance
              const size = new THREE.Vector3()
              box.getSize(size)
              const maxDim = Math.max(size.x, size.y, size.z)
              const fov = cameraRef.current.fov * (Math.PI / 180)
              let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2))
              distance *= 1.8 // Padding

              // Determine the "direction" of the sector to pick a side-view
              // We'll use the vector from the first point to the last point of the sector
              const startPoint = validPoints[0]!
              const endPoint = validPoints[validPoints.length - 1]!
              const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize()

              // Create a perpendicular vector for the side view (on the XZ plane)
              const sideView = new THREE.Vector3(-direction.z, 0.4, direction.x).normalize()

              const targetPos = new THREE.Vector3(center.x, center.y, center.z)
              const cameraPos = new THREE.Vector3().copy(targetPos).add(sideView.multiplyScalar(distance))

              targetOrbitPos.current = targetPos
              targetCameraPos.current = cameraPos
            }
          } catch (error) {
            console.warn("Failed to create zoom highlight geometry:", error)
          }
        }
      }
    } else if (zoomHighlightRef.current) {
      zoomHighlightRef.current.clear()

      // Reset camera to full track view when zoom is cleared
      if (cameraRef.current && controlsRef.current && bounds) {
        const avgLat = (bounds.minLat + bounds.maxLat) / 2
        const avgLon = (bounds.minLon + bounds.maxLon) / 2
        const centerPos = gpsTo3D(avgLat, avgLon)

        targetOrbitPos.current = centerPos
        targetCameraPos.current = new THREE.Vector3(centerPos.x, 600, centerPos.z + 800)
      }
    }
    if (cornerPoints.length > 0) {
      const markerGeometry = new THREE.SphereGeometry(5, 16, 16)
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: 0xf49f1e,
        emissive: 0xf49f1e,
        emissiveIntensity: 0.6,
      })

      for (let i = 0; i < cornerPoints.length; i++) {
        const corner = cornerPoints[i]
        if (!corner) continue
        const pos = gpsTo3D(corner.lat, corner.lon, corner.altitudeM)
        const marker = new THREE.Mesh(markerGeometry, markerMaterial)
        marker.position.copy(pos)
        marker.position.y += 8
        marker.name = "corner-marker"
        marker.renderOrder = 3
        trackMeshesRef.current.add(marker)

        const labelCanvas = document.createElement("canvas")
        labelCanvas.width = 128
        labelCanvas.height = 128
        const labelContext = labelCanvas.getContext("2d")
        if (labelContext) {
          labelContext.fillStyle = "rgba(16, 16, 16, 0.85)"
          labelContext.beginPath()
          labelContext.arc(64, 64, 48, 0, Math.PI * 2)
          labelContext.fill()
          labelContext.fillStyle = "#f49f1e"
          labelContext.font = "bold 64px sans-serif"
          labelContext.textAlign = "center"
          labelContext.textBaseline = "middle"
          labelContext.fillText(String(i + 1), 64, 68)

          const texture = new THREE.CanvasTexture(labelCanvas)
          const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          })
          const sprite = new THREE.Sprite(spriteMaterial)
          sprite.position.copy(pos)
          sprite.position.y += 22
          sprite.scale.set(40, 40, 1)
          sprite.name = "corner-label"
          sprite.renderOrder = 4
          trackMeshesRef.current.add(sprite)
        }
      }
    }
  }, [lapDataByLap, selectedLaps, lapColors, createTrackGeometry, gpsTo3D, bounds, zoomXMin, zoomXMax, theme, trackMap, createTrackSurfaceGeometry, showLapLines, cornerPoints, surfaceStyle])

  const validGpsPoints = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []

    const refLap = selectedLaps[0]
    if (refLap == null) return []

    const lapData = lapDataByLap[refLap]
    if (!lapData) return []

    // Filter by zoom range if zoom is active
    const pointsToUse = zoomXMin != null && zoomXMax != null
      ? lapData.byDist.filter((p) => p.distanceKm >= zoomXMin && p.distanceKm <= zoomXMax)
      : lapData.byDist

    return pointsToUse
      .filter((p): p is typeof p & { lat: number; lon: number } =>
        p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      )
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [lapDataByLap, selectedLaps, zoomXMin, zoomXMax])

  const totalLapDistance = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return 0
    const refLap = selectedLaps[0]
    if (refLap == null) return 0
    const lapData = lapDataByLap[refLap]
    if (!lapData) return 0

    // When zoomed, use the zoom range as the total distance for cursor calculation
    if (zoomXMin != null && zoomXMax != null) {
      return zoomXMax - zoomXMin
    }

    return lapData.distanceKm ?? 0
  }, [lapDataByLap, selectedLaps, zoomXMin, zoomXMax])

  const refLapColor = useMemo(() => {
    const refLap = selectedLaps[0]
    if (refLap == null) return LAP_COLOR_PALETTE[0]
    return lapColors[refLap] ?? LAP_COLOR_PALETTE[0]
  }, [selectedLaps, lapColors])

  useCursorSubscription((cursorDistance) => {
    if (!cursorMeshRef.current || !bounds || validGpsPoints.length < 2 || totalLapDistance <= 0) {
      if (cursorMeshRef.current) {
        cursorMeshRef.current.visible = false
      }
      return
    }

    if (cursorDistance == null) {
      cursorMeshRef.current.visible = false
      return
    }

    // When zoomed, adjust cursorDistance to be relative to the zoom range
    let adjustedCursorDistance = cursorDistance
    if (zoomXMin != null && zoomXMax != null) {
      // Clamp cursorDistance to the zoom range
      adjustedCursorDistance = Math.max(zoomXMin, Math.min(zoomXMax, cursorDistance))
      // Make it relative to the zoom range (0 to zoomXMax - zoomXMin)
      adjustedCursorDistance = adjustedCursorDistance - zoomXMin
    }

    const lapPercentage = Math.max(0, Math.min(1, adjustedCursorDistance / totalLapDistance))
    const floatIndex = lapPercentage * (validGpsPoints.length - 1)
    const indexLo = Math.floor(floatIndex)
    const indexHi = Math.min(indexLo + 1, validGpsPoints.length - 1)
    const t = floatIndex - indexLo

    const p0 = validGpsPoints[indexLo]
    const p1 = validGpsPoints[indexHi]
    if (!p0 || !p1) {
      cursorMeshRef.current.visible = false
      return
    }

    const lat = p0.lat + (p1.lat - p0.lat) * t
    const lon = p0.lon + (p1.lon - p0.lon) * t
    const speed = p0.speedKmh != null && p1.speedKmh != null
      ? p0.speedKmh + (p1.speedKmh - p0.speedKmh) * t
      : null
    const altitudeM =
      p0.altitudeM != null && p1.altitudeM != null
        ? p0.altitudeM + (p1.altitudeM - p0.altitudeM) * t
        : p0.altitudeM ?? p1.altitudeM ?? null

    const pos = gpsTo3D(lat, lon, altitudeM, speed)

    cursorMeshRef.current.visible = true
    cursorMeshRef.current.position.copy(pos)
  }, [bounds, gpsTo3D, validGpsPoints, totalLapDistance, zoomXMin, zoomXMax])

  useEffect(() => {
    if (!cursorMeshRef.current) return

    cursorMeshRef.current.clear()

    const color = new THREE.Color(refLapColor)

    const sphereGeometry = new THREE.SphereGeometry(8, 16, 16)
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8,
    })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.castShadow = true
    cursorMeshRef.current.add(sphere)

    const ringGeometry = new THREE.RingGeometry(12, 16, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = -Math.PI / 2
    cursorMeshRef.current.add(ring)

    const glowGeometry = new THREE.SphereGeometry(20, 16, 16)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.2,
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    cursorMeshRef.current.add(glow)
  }, [refLapColor])

  const handleSurfaceClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onSurfaceClick) return
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const surfaceMesh = surfaceMeshRef.current
    if (!renderer || !camera || !surfaceMesh || centerlineVectors.length === 0) return

    const rect = renderer.domElement.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    const pointer = new THREE.Vector2(x, y)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)
    const intersections = raycaster.intersectObject(surfaceMesh, false)
    const hit = intersections[0]
    if (!hit) return

    let closestIndex = 0
    let closestDistance = Infinity
    for (let i = 0; i < centerlineVectors.length; i++) {
      const v = centerlineVectors[i]
      const dist = v.distanceToSquared(hit.point)
      if (dist < closestDistance) {
        closestDistance = dist
        closestIndex = i
      }
    }

    const center = centerlinePoints[closestIndex]
    if (!center) return
    onSurfaceClick({
      distanceKm: center.distanceKm,
      lat: center.lat,
      lon: center.lon,
      altitudeM: center.altitudeM,
    })
  }, [onSurfaceClick, centerlineVectors, centerlinePoints])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current) return

      const width = container.clientWidth
      const height = container.clientHeight

      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    }

    handleResize()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", handleResize)
      return () => window.removeEventListener("resize", handleResize)
    }

    const observer = new ResizeObserver(() => handleResize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  if ((!lapDataByLap || selectedLaps.length === 0) && !trackMap) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-md border border-border/50">
        <div className="text-center">
          <div className="text-xs font-medium text-muted-foreground mb-1">3D Track Map</div>
          <div className="text-[10px] text-muted-foreground/60">Load data to view</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onClick={onSurfaceClick ? handleSurfaceClick : undefined}
    />
  )
}
