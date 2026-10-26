export type Vec3 = [number, number, number]

// Saved plans use Cartesian Y (north/up), while the default 3D camera looks
// along negative Z. Reflect plan Y so north stays at the top in both views.
export function planToScene(xM: number, yM: number, heightM: number, dimensions: { widthM: number; lengthM: number }): Vec3 {
  return [xM - dimensions.widthM / 2, heightM, dimensions.lengthM / 2 - yM]
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return a.map(v => v / l) as Vec3 }

export function cameraMatrix(eye: Vec3, target: Vec3, aspect: number) {
  const z = unit(sub(eye, target)), x = unit(cross([0, 1, 0], z)), y = cross(z, x)
  const view = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]
  const near = .1, far = Math.max(4000, Math.hypot(...sub(eye, target)) * 4), f = 1 / Math.tan(.65 / 2)
  const p = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0]
  return new Float32Array(Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4)
    return [0, 1, 2, 3].reduce((sum, k) => sum + p[k * 4 + row] * view[col * 4 + k], 0)
  }))
}

export function project(point: Vec3, m: Float32Array, width: number, height: number) {
  const v = [...point, 1]
  const p = [0, 1, 2, 3].map(row => v.reduce((s, n, k) => s + n * m[k * 4 + row], 0))
  return { x: (p[0] / p[3] + 1) * width / 2, y: (1 - p[1] / p[3]) * height / 2, visible: p[3] > 0 && p[2] / p[3] >= 0 && p[2] / p[3] <= 1 }
}

export function inverseMatrix(matrix: Float32Array) {
  const rows = Array.from({ length: 4 }, (_, r) => [...Array.from({ length: 4 }, (_, c) => matrix[c*4+r]), ...Array.from({ length: 4 }, (_, c) => r===c ? 1 : 0)])
  for (let c=0;c<4;c++) {
    let pivot=c
    for (let r=c+1;r<4;r++) if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r
    if(Math.abs(rows[pivot][c])<1e-12)throw new Error('Camera matrix is singular')
    ;[rows[c],rows[pivot]]=[rows[pivot],rows[c]]
    const divisor=rows[c][c]
    rows[c]=rows[c].map(v=>v/divisor)
    for(let r=0;r<4;r++)if(r!==c){const factor=rows[r][c];rows[r]=rows[r].map((v,k)=>v-factor*rows[c][k])}
  }
  return new Float32Array(Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]))
}
