import { useRef, useEffect, useMemo, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { useCursorSubscription } from "@/lib/cursorStore"
import type { IbtLapData, IbtLapPoint } from "@/components/lap-analysis/types"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"

interface TrackMap3DProps {
  lapDataByLap: Record<number, IbtLapData> | null
  selectedLaps: number[]
  lapColors: Record<number, string>
  zoomXMin?: number | null
  zoomXMax?: number | null
}

export function TrackMap3D({
  lapDataByLap,
  selectedLaps,
  lapColors,
  zoomXMin,
  zoomXMax,
}: TrackMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<any>(null)
  const trackMeshesRef = useRef<THREE.Group | null>(null)
  const cursorMeshRef = useRef<THREE.Group | null>(null)
  const zoomHighlightRef = useRef<THREE.Group | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const bounds = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return null
    
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity
    
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
    
    if (!Number.isFinite(minLat)) return null
    
    return { minLat, maxLat, minLon, maxLon }
  }, [lapDataByLap, selectedLaps])

  const centerLat = useMemo(() => {
    if (!bounds) return 0
    return (bounds.minLat + bounds.maxLat) / 2
  }, [bounds])

  const centerLon = useMemo(() => {
    if (!bounds) return 0
    return (bounds.minLon + bounds.maxLon) / 2
  }, [bounds])

  const gpsTo3D = useCallback((lat: number, lon: number, speedKmh: number | null = null): THREE.Vector3 => {
    if (!bounds) return new THREE.Vector3(0, 0, 0)
    
    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001
    
    const avgLat = (bounds.minLat + bounds.maxLat) / 2
    const lonScale = Math.cos((avgLat * Math.PI) / 180)
    
    const x = ((lon - centerLon) / lonRange) * lonScale * 1000
    const z = ((lat - centerLat) / latRange) * 1000
    
    const elevation = speedKmh != null ? Math.max(0, (speedKmh / 300) * 20) : 0
    
    return new THREE.Vector3(x, elevation, z)
  }, [bounds, centerLat, centerLon])

  const createTrackGeometry = useCallback((points: IbtLapPoint[]): THREE.BufferGeometry | null => {
    const validPoints = points.filter((p) => p.lat != null && p.lon != null)
    if (validPoints.length < 2) return null

    const positions: number[] = []
    const colors: number[] = []
    
    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i]!
      const pos = gpsTo3D(p.lat!, p.lon!, p.speedKmh)
      positions.push(pos.x, pos.y, pos.z)
      
      const color = new THREE.Color(1, 1, 1)
      if (p.speedKmh != null) {
        const speedNormalized = Math.min(1, p.speedKmh / 300)
        color.setHSL(0.6 - speedNormalized * 0.3, 0.8, 0.5)
      }
      colors.push(color.r, color.g, color.b)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    
    return geometry
  }, [gpsTo3D])

  const initScene = useCallback(() => {
    if (!containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0a)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000)
    camera.position.set(0, 500, 1000)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9)
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

    const hemisphereLight = new THREE.HemisphereLight(0x444444, 0x111111, 0.4)
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

    const gridHelper = new THREE.GridHelper(2000, 20, 0x2a2a2a, 0x1a1a1a)
    scene.add(gridHelper)

    const groundGeometry = new THREE.PlaneGeometry(2000, 2000)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f0f0f,
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
    controlsRef.current = controls

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      
      if (controlsRef.current) {
        controlsRef.current.update()
      }
      
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }
    animate()
  }, [])

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
      if (sceneRef.current) {
        sceneRef.current.clear()
      }
    }
  }, [initScene])

  useEffect(() => {
    if (!trackMeshesRef.current || !lapDataByLap || selectedLaps.length === 0) return

    trackMeshesRef.current.clear()

    for (const lap of selectedLaps) {
      const lapData = lapDataByLap[lap]
      if (!lapData) continue

      const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
      const threeColor = new THREE.Color(color)

      const geometry = createTrackGeometry(lapData.byDist)
      if (!geometry) continue

      const material = new THREE.LineBasicMaterial({
        color: threeColor,
        linewidth: 3,
        vertexColors: false,
      })

      const line = new THREE.Line(geometry, material)
      line.name = `lap-${lap}`
      trackMeshesRef.current.add(line)

      const validPoints = lapData.byDist
        .filter((p) => p.lat != null && p.lon != null)
        .map((p) => gpsTo3D(p.lat!, p.lon!, p.speedKmh))
      
      if (validPoints.length >= 2) {
        try {
          const curve = new THREE.CatmullRomCurve3(validPoints, false, 'centripetal')
          const tubeGeometry = new THREE.TubeGeometry(curve, Math.min(200, validPoints.length), 2, 8, false)

      const tubeMaterial = new THREE.MeshStandardMaterial({
        color: threeColor,
        emissive: threeColor,
        emissiveIntensity: 0.3,
        metalness: 0.5,
        roughness: 0.5,
      })

          const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
          tube.castShadow = true
          tube.receiveShadow = true
          tube.name = `lap-tube-${lap}`
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
          const validPoints = sectorPoints.map((p) => gpsTo3D(p.lat!, p.lon!, p.speedKmh))
          
          try {
            const curve = new THREE.CatmullRomCurve3(validPoints, false, 'centripetal')
            const tubeGeometry = new THREE.TubeGeometry(curve, Math.min(200, validPoints.length), 4, 8, false)
            
            const refLapColorValue = refLap != null ? (lapColors[refLap] ?? LAP_COLOR_PALETTE[0]) : LAP_COLOR_PALETTE[0]
            const highlightColor = new THREE.Color(refLapColorValue)
            const highlightMaterial = new THREE.MeshStandardMaterial({
              color: highlightColor,
              emissive: highlightColor,
              emissiveIntensity: 0.8,
              metalness: 0.7,
              roughness: 0.3,
            })

            const highlightTube = new THREE.Mesh(tubeGeometry, highlightMaterial)
            highlightTube.castShadow = true
            highlightTube.receiveShadow = true
            highlightTube.name = 'zoom-highlight'
            zoomHighlightRef.current.add(highlightTube)
          } catch (error) {
            console.warn('Failed to create zoom highlight geometry:', error)
          }
        }
      }
    } else if (zoomHighlightRef.current) {
      zoomHighlightRef.current.clear()
    }
  }, [lapDataByLap, selectedLaps, lapColors, createTrackGeometry, gpsTo3D, bounds, zoomXMin, zoomXMax])

  const validGpsPoints = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []
    
    const refLap = selectedLaps[0]
    if (refLap == null) return []
    
    const lapData = lapDataByLap[refLap]
    if (!lapData) return []
    
    return lapData.byDist
      .filter((p): p is typeof p & { lat: number; lon: number } => 
        p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      )
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [lapDataByLap, selectedLaps])

  const totalLapDistance = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return 0
    const refLap = selectedLaps[0]
    if (refLap == null) return 0
    const lapData = lapDataByLap[refLap]
    return lapData?.distanceKm ?? 0
  }, [lapDataByLap, selectedLaps])

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
    
    const lapPercentage = Math.max(0, Math.min(1, cursorDistance / totalLapDistance))
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
    
    const pos = gpsTo3D(lat, lon, speed)
    
    cursorMeshRef.current.visible = true
    cursorMeshRef.current.position.copy(pos)
  }, [bounds, gpsTo3D, validGpsPoints, totalLapDistance])

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

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return
      
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      
      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!lapDataByLap || selectedLaps.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-md border border-border/50">
        <div className="text-center">
          <div className="text-xs font-medium text-muted-foreground mb-1">3D Track Map</div>
          <div className="text-[10px] text-muted-foreground/60">Load data to view</div>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="w-full h-full" />
}

